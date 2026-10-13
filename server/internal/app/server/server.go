package server

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/handlers"
	"github.com/gorilla/mux"
	"github.com/nikotubach/clang-tidy-configurator-v2/internal/app/analyzer"
	"github.com/nikotubach/clang-tidy-configurator-v2/internal/app/formatter"

	log "github.com/sirupsen/logrus"
)

type Server struct {
	router    *mux.Router
	analyzer  *analyzer.Analyzer
	formatter *formatter.Formatter
	bindAddr  string
}

func (srv *Server) Start() error {
	return http.ListenAndServe(srv.bindAddr, srv)
}

func (srv *Server) StartTLS(certFile, keyFile string) error {
	return http.ListenAndServeTLS(srv.bindAddr, certFile, keyFile, srv)
}

func (srv *Server) configureRouter() {
	srv.router.Use(handlers.CORS(handlers.AllowedOrigins([]string{"*"})))
	srv.router.HandleFunc("/analyze", srv.analyzeHandler).Methods("POST")
	srv.router.HandleFunc("/fix", srv.fixHandler).Methods("POST")
	srv.router.HandleFunc("/format", srv.formatHandler).Methods("POST")
}

func NewServer(an *analyzer.Analyzer, fm *formatter.Formatter, bindAddr string) *Server {
	s := &Server{router: mux.NewRouter(),
		analyzer:  an,
		formatter: fm,
		bindAddr:  bindAddr,
	}
	s.configureRouter()
	return s
}

func (srv *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	srv.router.ServeHTTP(w, r)
}

/*
Analyze endpoint

Request
Method: POST
Query string:
version: full version string, for example: 20.1.8
filext: filename extension to assume language, e.g. .cpp
Body, content-type application/json, charset utf-8:
code:       piece of code to analyze, string
tidyConfig: contents of a .clang-tidy file (YAML), string
extraArgs:  extra compiler arguments appended after "--", e.g. "-std=c++20", string

Response
200 OK, application/json: {"diagnostics": [...]}
*/

type analyzeRequestBody struct {
	Code       string `json:"code"`
	TidyConfig string `json:"tidyConfig"`
	ExtraArgs  string `json:"extraArgs"`
}

type analyzeResponseBody struct {
	Diagnostics []analyzer.Diagnostic `json:"diagnostics"`
}

// parseVersionAndFilext reads and validates the version/filext query params
// and the request body shared by /analyze and /fix. Returns ok=false if it
// already wrote an error response.
func (srv *Server) parseVersionAndFilext(rw http.ResponseWriter, req *http.Request) (version, filenameExt string, body analyzeRequestBody, ok bool) {
	if !req.URL.Query().Has("version") {
		log.Debug("No version parameter in query")
		http.Error(rw, "No version parameter in query", http.StatusBadRequest)
		return "", "", body, false
	}
	version = req.URL.Query().Get("version")

	if !req.URL.Query().Has("filext") {
		log.Debug("No filext parameter in query")
		http.Error(rw, "No filext parameter in query", http.StatusBadRequest)
		return "", "", body, false
	}
	filenameExt = req.URL.Query().Get("filext")

	if !srv.analyzer.VersionAvailable(version) {
		log.Debugf("Specified version not available %s", version)
		http.Error(rw, "Selected version is not available", http.StatusBadRequest)
		return "", "", body, false
	}

	decoder := json.NewDecoder(req.Body)
	if err := decoder.Decode(&body); err != nil {
		log.Debugf("Failed to decode request body:\n%s", req.Body)
		http.Error(rw, "Failed to decode request body", http.StatusBadRequest)
		return "", "", body, false
	}

	return version, filenameExt, body, true
}

func writeAnalyzerError(rw http.ResponseWriter, err error) {
	if inpErr, ok := err.(*analyzer.InputError); ok {
		http.Error(rw, inpErr.Error(), http.StatusBadRequest)
	} else if intErr, ok := err.(*analyzer.InternalError); ok {
		http.Error(rw, intErr.Error(), http.StatusInternalServerError)
	}
}

func (srv *Server) analyzeHandler(rw http.ResponseWriter, req *http.Request) {
	version, filenameExt, body, ok := srv.parseVersionAndFilext(rw, req)
	if !ok {
		return
	}

	diagnostics, err := srv.analyzer.Analyze(version, filenameExt, body.Code, body.TidyConfig, body.ExtraArgs)
	if err != nil {
		writeAnalyzerError(rw, err)
		return
	}

	responseBody, err := json.Marshal(analyzeResponseBody{Diagnostics: diagnostics})
	if err != nil {
		log.Errorf("Failed to marshal response: %s", err)
		http.Error(rw, "Internal error", http.StatusInternalServerError)
		return
	}

	rw.Header().Set("Content-Type", "application/json")
	rw.WriteHeader(http.StatusOK)
	rw.Write(responseBody)
	log.Debug("Request successfully served")
}

/*
Fix endpoint

Same request shape as /analyze. Runs clang-tidy with --fix-errors and
returns the rewritten file content alongside whatever diagnostics remain.

Response
200 OK, application/json: {"fixedCode": "...", "diagnostics": [...]}
*/

type fixResponseBody struct {
	FixedCode   string                `json:"fixedCode"`
	Diagnostics []analyzer.Diagnostic `json:"diagnostics"`
}

func (srv *Server) fixHandler(rw http.ResponseWriter, req *http.Request) {
	version, filenameExt, body, ok := srv.parseVersionAndFilext(rw, req)
	if !ok {
		return
	}

	fixedCode, diagnostics, err := srv.analyzer.Fix(version, filenameExt, body.Code, body.TidyConfig, body.ExtraArgs)
	if err != nil {
		writeAnalyzerError(rw, err)
		return
	}

	responseBody, err := json.Marshal(fixResponseBody{FixedCode: fixedCode, Diagnostics: diagnostics})
	if err != nil {
		log.Errorf("Failed to marshal response: %s", err)
		http.Error(rw, "Internal error", http.StatusInternalServerError)
		return
	}

	rw.Header().Set("Content-Type", "application/json")
	rw.WriteHeader(http.StatusOK)
	rw.Write(responseBody)
	log.Debug("Request successfully served")
}

/*
Format endpoint

Request
Method: POST
Query string:
version: full version string, for example: 20.1.8 (same version strings as
         /analyze, looked up in config.json's format-versions instead)
filext: filename extension to assume language, e.g. .cpp
Body, content-type application/json, charset utf-8:
code:  piece of code to format, string
style: contents of a .clang-format file (YAML), string

Response
200 OK, application/json: {"formattedCode": "..."}
*/

type formatRequestBody struct {
	Code  string `json:"code"`
	Style string `json:"style"`
}

type formatResponseBody struct {
	FormattedCode string `json:"formattedCode"`
}

func (srv *Server) formatHandler(rw http.ResponseWriter, req *http.Request) {
	if !req.URL.Query().Has("version") {
		log.Debug("No version parameter in query")
		http.Error(rw, "No version parameter in query", http.StatusBadRequest)
		return
	}
	version := req.URL.Query().Get("version")

	if !req.URL.Query().Has("filext") {
		log.Debug("No filext parameter in query")
		http.Error(rw, "No filext parameter in query", http.StatusBadRequest)
		return
	}
	filenameExt := req.URL.Query().Get("filext")

	if !srv.formatter.VersionAvailable(version) {
		log.Debugf("Specified clang-format version not available %s", version)
		http.Error(rw, "clang-format "+version+" is not available on this server", http.StatusBadRequest)
		return
	}

	var body formatRequestBody
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		log.Debugf("Failed to decode request body:\n%s", req.Body)
		http.Error(rw, "Failed to decode request body", http.StatusBadRequest)
		return
	}

	formattedCode, err := srv.formatter.Format(version, filenameExt, body.Code, body.Style)
	if err != nil {
		if inpErr, ok := err.(*formatter.InputError); ok {
			http.Error(rw, inpErr.Error(), http.StatusBadRequest)
		} else {
			http.Error(rw, err.Error(), http.StatusInternalServerError)
		}
		return
	}

	responseBody, err := json.Marshal(formatResponseBody{FormattedCode: formattedCode})
	if err != nil {
		log.Errorf("Failed to marshal response: %s", err)
		http.Error(rw, "Internal error", http.StatusInternalServerError)
		return
	}

	rw.Header().Set("Content-Type", "application/json")
	rw.WriteHeader(http.StatusOK)
	rw.Write(responseBody)
	log.Debug("Request successfully served")
}
