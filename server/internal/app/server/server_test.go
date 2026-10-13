package server

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"

	"github.com/nikotubach/clang-tidy-configurator-v2/internal/app/analyzer"
	"github.com/nikotubach/clang-tidy-configurator-v2/internal/app/config"
	"github.com/nikotubach/clang-tidy-configurator-v2/internal/app/formatter"
)

// packageDir is captured once before any test chdirs (TestAnalyzeEndpoint,
// TestFixEndpoint and TestFormatEndpoint all need to cd up to the repo root to find config.json,
// which would otherwise make the second test to run unable to find its own
// testing_data*.json depending on test execution order).
var packageDir string

func TestMain(m *testing.M) {
	var err error
	packageDir, err = os.Getwd()
	if err != nil {
		panic(err)
	}
	os.Exit(m.Run())
}

func newTestServer(t *testing.T) *Server {
	t.Helper()
	if err := os.Chdir(packageDir); err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir("../../.."); err != nil {
		t.Fatal(err)
	}
	cfg := config.NewConfig()
	jsonReader, err := os.Open("config.json")
	if err != nil {
		t.Fatal(err)
	}
	defer jsonReader.Close()
	if err := json.NewDecoder(jsonReader).Decode(&cfg); err != nil {
		t.Fatal(err)
	}

	an, err := analyzer.NewAnalyzer(&cfg.Versions)
	if err != nil {
		t.Fatal(err)
	}
	return NewServer(an, formatter.NewFormatter(cfg.FormatVersions), cfg.BindAddr)
}

type TestCase struct {
	Version        string   `json:"version"`
	Description    string   `json:"description"`
	FileExt        string   `json:"file_extension"`
	TidyConfig     string   `json:"tidy_config"`
	ExtraArgs      string   `json:"extra_args"`
	Code           string   `json:"code"`
	ExpectedChecks []string `json:"expected_checks"`
}
type TestList []TestCase

func containsCheck(diagnostics []analyzer.Diagnostic, check string) bool {
	for _, d := range diagnostics {
		if d.Check == check {
			return true
		}
	}
	return false
}

func TestAnalyzeEndpoint(t *testing.T) {
	if err := os.Chdir(packageDir); err != nil {
		t.Fatal(err)
	}
	testFile, err := os.Open("testing_data.json")
	if err != nil {
		t.Fatal(err)
	}
	decoder := json.NewDecoder(testFile)
	var tests TestList = make(TestList, 0)
	decoder.Decode(&tests)
	testFile.Close()

	srv := newTestServer(t)

	for _, test := range tests {
		t.Run(test.Description, func(t *testing.T) {
			body, _ := json.Marshal(analyzeRequestBody{
				Code:       test.Code,
				TidyConfig: test.TidyConfig,
				ExtraArgs:  test.ExtraArgs,
			})
			query := url.Values{}
			query.Set("version", test.Version)
			query.Set("filext", test.FileExt)
			req := httptest.NewRequest("POST", fmt.Sprintf("/analyze?%s", query.Encode()), bytes.NewReader(body))
			rec := httptest.NewRecorder()
			srv.ServeHTTP(rec, req)

			if rec.Code != http.StatusOK {
				t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
			}

			var resp analyzeResponseBody
			if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
				t.Fatalf("failed to unmarshal response: %s\nbody: %s", err, rec.Body.String())
			}

			for _, expectedCheck := range test.ExpectedChecks {
				if !containsCheck(resp.Diagnostics, expectedCheck) {
					t.Errorf("expected diagnostic from check %q, got %+v", expectedCheck, resp.Diagnostics)
				}
			}
			if len(test.ExpectedChecks) == 0 && len(resp.Diagnostics) != 0 {
				t.Errorf("expected no diagnostics, got %+v", resp.Diagnostics)
			}
		})
	}
}

type FixTestCase struct {
	Version             string   `json:"version"`
	Description         string   `json:"description"`
	FileExt             string   `json:"file_extension"`
	TidyConfig          string   `json:"tidy_config"`
	ExtraArgs           string   `json:"extra_args"`
	Code                string   `json:"code"`
	ExpectedContains    []string `json:"expected_contains"`
	ExpectedNotContains []string `json:"expected_not_contains"`
}

func TestFixEndpoint(t *testing.T) {
	if err := os.Chdir(packageDir); err != nil {
		t.Fatal(err)
	}
	testFile, err := os.Open("testing_data_fix.json")
	if err != nil {
		t.Fatal(err)
	}
	var tests []FixTestCase
	json.NewDecoder(testFile).Decode(&tests)
	testFile.Close()

	srv := newTestServer(t)

	for _, test := range tests {
		t.Run(test.Description, func(t *testing.T) {
			body, _ := json.Marshal(analyzeRequestBody{
				Code:       test.Code,
				TidyConfig: test.TidyConfig,
				ExtraArgs:  test.ExtraArgs,
			})
			query := url.Values{}
			query.Set("version", test.Version)
			query.Set("filext", test.FileExt)
			req := httptest.NewRequest("POST", fmt.Sprintf("/fix?%s", query.Encode()), bytes.NewReader(body))
			rec := httptest.NewRecorder()
			srv.ServeHTTP(rec, req)

			if rec.Code != http.StatusOK {
				t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
			}

			var resp fixResponseBody
			if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
				t.Fatalf("failed to unmarshal response: %s\nbody: %s", err, rec.Body.String())
			}

			for _, want := range test.ExpectedContains {
				if !strings.Contains(resp.FixedCode, want) {
					t.Errorf("expected fixed code to contain %q, got:\n%s", want, resp.FixedCode)
				}
			}
			for _, unwanted := range test.ExpectedNotContains {
				if strings.Contains(resp.FixedCode, unwanted) {
					t.Errorf("expected fixed code to not contain %q, got:\n%s", unwanted, resp.FixedCode)
				}
			}
		})
	}
}

type FormatTestCase struct {
	Version             string   `json:"version"`
	Description         string   `json:"description"`
	FileExt             string   `json:"file_extension"`
	Style               string   `json:"style"`
	Code                string   `json:"code"`
	ExpectedStatus      int      `json:"expected_status"`
	ExpectedContains    []string `json:"expected_contains"`
	ExpectedNotContains []string `json:"expected_not_contains"`
}

func TestFormatEndpoint(t *testing.T) {
	if err := os.Chdir(packageDir); err != nil {
		t.Fatal(err)
	}
	testFile, err := os.Open("testing_data_format.json")
	if err != nil {
		t.Fatal(err)
	}
	var tests []FormatTestCase
	json.NewDecoder(testFile).Decode(&tests)
	testFile.Close()

	srv := newTestServer(t)

	for _, test := range tests {
		t.Run(test.Description, func(t *testing.T) {
			body, _ := json.Marshal(formatRequestBody{Code: test.Code, Style: test.Style})
			query := url.Values{}
			query.Set("version", test.Version)
			query.Set("filext", test.FileExt)
			req := httptest.NewRequest("POST", fmt.Sprintf("/format?%s", query.Encode()), bytes.NewReader(body))
			rec := httptest.NewRecorder()
			srv.ServeHTTP(rec, req)

			expectedStatus := test.ExpectedStatus
			if expectedStatus == 0 {
				expectedStatus = http.StatusOK
			}
			if rec.Code != expectedStatus {
				t.Fatalf("expected %d, got %d: %s", expectedStatus, rec.Code, rec.Body.String())
			}
			if expectedStatus != http.StatusOK {
				return
			}

			var resp formatResponseBody
			if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
				t.Fatalf("failed to unmarshal response: %s\nbody: %s", err, rec.Body.String())
			}

			for _, want := range test.ExpectedContains {
				if !strings.Contains(resp.FormattedCode, want) {
					t.Errorf("expected formatted code to contain %q, got:\n%s", want, resp.FormattedCode)
				}
			}
			for _, unwanted := range test.ExpectedNotContains {
				if strings.Contains(resp.FormattedCode, unwanted) {
					t.Errorf("expected formatted code to not contain %q, got:\n%s", unwanted, resp.FormattedCode)
				}
			}
		})
	}
}
