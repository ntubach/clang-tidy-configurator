package server

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"testing"

	"github.com/nikotubach/clang-tidy-configurator-v2/internal/app/analyzer"
	"github.com/nikotubach/clang-tidy-configurator-v2/internal/app/config"
)

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
	testFile, err := os.Open("testing_data.json")
	if err != nil {
		t.Fatal(err)
	}
	decoder := json.NewDecoder(testFile)
	var tests TestList = make(TestList, 0)
	decoder.Decode(&tests)
	testFile.Close()

	os.Chdir("../../..")
	cfg := config.NewConfig()
	jsonReader, err := os.Open("config.json")
	if err != nil {
		t.Fatal(err)
	}
	decoder = json.NewDecoder(jsonReader)
	err = decoder.Decode(&cfg)
	jsonReader.Close()
	if err != nil {
		t.Fatal(err)
	}

	an, err := analyzer.NewAnalyzer(&cfg.Versions)
	if err != nil {
		t.Fatal(err)
	}
	srv := NewServer(an, cfg.BindAddr)

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
