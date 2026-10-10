package analyzer

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	log "github.com/sirupsen/logrus"
)

type InternalError struct {
	what string
}

func (er *InternalError) Error() string {
	if er.what == "" {
		return "Internal error"
	}
	return er.what
}

type InputError struct {
	what string
}

func (er *InputError) Error() string {
	return er.what
}

type Diagnostic struct {
	Line     int    `json:"line"`
	Column   int    `json:"column"`
	Severity string `json:"severity"`
	Message  string `json:"message"`
	Check    string `json:"check"`
}

type binary struct {
	path string
	// --allow-no-checks was added in clang-tidy 19; passing it to an
	// older binary makes the whole invocation fail immediately with an
	// "Unknown command line argument" error before it even looks at the
	// file, so it must only be used when the binary actually supports it.
	supportsAllowNoChecks bool
}

type Analyzer struct {
	executables map[string]binary
	timeout     time.Duration
}

func (a *Analyzer) checkAndSetExecs(versions *map[string]string) error {
	var err error
	executables := make(map[string]binary)
	for version, execPath := range *versions {
		// Resolved to an absolute path now, while the process cwd is still
		// the server's working directory: Analyze() sets cmd.Dir to a temp
		// directory per request, and a relative Path is looked up relative
		// to the *new* Dir after chdir, not the original cwd.
		absExecPath, absErr := filepath.Abs(execPath)
		if absErr != nil {
			log.Errorf("Failed to resolve absolute path for %s: %s", execPath, absErr)
			delete(*versions, version)
			continue
		}
		cmd := exec.Command(absExecPath, "--version")
		output := new(strings.Builder)
		cmd.Stdout = output
		err = cmd.Run()
		if err != nil {
			log.Errorf("%s exited with code %s\n stdout:\n%s", absExecPath, err, output.String())
			delete(*versions, version)
			continue
		}
		(*versions)[version] = absExecPath

		helpCmd := exec.Command(absExecPath, "--help")
		helpOutput := new(strings.Builder)
		helpCmd.Stdout = helpOutput
		helpCmd.Run() // best-effort; a failure here just leaves the flag off
		executables[version] = binary{
			path:                  absExecPath,
			supportsAllowNoChecks: strings.Contains(helpOutput.String(), "--allow-no-checks"),
		}
		log.Infof("%s --version output:\n%s", absExecPath, output.String())
	}

	if len(*versions) == 0 {
		err = errors.New("failed to run every single clang-tidy version")
	} else {
		a.executables = executables
	}
	return err
}

func NewAnalyzer(versions *map[string]string) (*Analyzer, error) {
	a := &Analyzer{timeout: 10 * time.Second}
	err := a.checkAndSetExecs(versions)
	return a, err
}

func (a *Analyzer) VersionAvailable(version string) bool {
	_, present := a.executables[version]
	return present
}

// diagnosticLineRegex matches clang-tidy's primary diagnostic lines, e.g.:
// /tmp/foo123/sample.cpp:4:7: warning: use a trailing return type [modernize-use-trailing-return-type]
var diagnosticLineRegex = regexp.MustCompile(`^(.+):(\d+):(\d+):\s+(warning|error|note):\s+(.*?)(?:\s+\[([\w.,-]+)\])?$`)

func parseDiagnostics(output, fileName string) []Diagnostic {
	diagnostics := make([]Diagnostic, 0)
	lines := strings.Split(output, "\n")
	for _, line := range lines {
		matches := diagnosticLineRegex.FindStringSubmatch(line)
		if matches == nil {
			continue
		}
		if filepath.Base(matches[1]) != fileName {
			continue
		}
		lineNum, err := strconv.Atoi(matches[2])
		if err != nil {
			continue
		}
		colNum, err := strconv.Atoi(matches[3])
		if err != nil {
			continue
		}
		diagnostics = append(diagnostics, Diagnostic{
			Line:     lineNum,
			Column:   colNum,
			Severity: matches[4],
			Message:  matches[5],
			Check:    matches[6],
		})
	}
	return diagnostics
}

// noChecksEnabledMarker is what clang-tidy prints (and fails with) when the
// resolved Checks glob matches nothing, on versions old enough to lack
// --allow-no-checks (added in clang-tidy 19). Newer binaries never hit this
// since Analyze() passes that flag whenever the binary supports it; treating
// it as "zero diagnostics" rather than a hard failure keeps behavior
// consistent across the whole supported version range.
const noChecksEnabledMarker = "Error: no checks enabled"

func looksLikeHardFailure(stderrText string, diagnostics []Diagnostic) bool {
	if len(diagnostics) > 0 {
		return false
	}
	if strings.Contains(stderrText, noChecksEnabledMarker) {
		return false
	}
	hardFailureMarkers := []string{
		"Error: invalid configuration specified",
		"Unknown command line argument",
		"for the --config",
	}
	for _, marker := range hardFailureMarkers {
		if strings.Contains(stderrText, marker) {
			return true
		}
	}
	return false
}

// runClangTidy writes code to a temp file and runs clang-tidy against it
// with the given extra flags (e.g. ["--fix-errors"] for Fix), shared by
// Analyze and Fix. On success it returns the temp file/dir paths so the
// caller can read back the (possibly rewritten) file before cleaning up;
// on any error it cleans up itself and returns an empty tmpDir.
func (a *Analyzer) runClangTidy(version, filenameExt, code, tidyConfigYaml, extraArgs string, extraFlags []string) (diagnostics []Diagnostic, filePath string, tmpDir string, err error) {
	bin, ok := a.executables[version]
	if !ok {
		return nil, "", "", &InputError{"selected version is not available"}
	}

	tmpDir, err = os.MkdirTemp("", "clang-tidy-configurator-*")
	if err != nil {
		log.Errorf("Failed to create temp dir: %s", err)
		return nil, "", "", &InternalError{}
	}

	fileName := "sample" + filenameExt
	filePath = filepath.Join(tmpDir, fileName)
	if writeErr := os.WriteFile(filePath, []byte(code), 0o600); writeErr != nil {
		log.Errorf("Failed to write temp source file: %s", writeErr)
		os.RemoveAll(tmpDir)
		return nil, "", "", &InternalError{}
	}

	args := []string{
		filePath,
		fmt.Sprintf("--config=%s", tidyConfigYaml),
		"--quiet",
	}
	if bin.supportsAllowNoChecks {
		args = append(args, "--allow-no-checks")
	}
	args = append(args, extraFlags...)
	args = append(args, "--")
	if extraArgs != "" {
		args = append(args, strings.Fields(extraArgs)...)
	}

	ctx, cancel := context.WithTimeout(context.Background(), a.timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, bin.path, args...)
	cmd.Dir = tmpDir
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	runErr := cmd.Run()

	if ctx.Err() == context.DeadlineExceeded {
		log.Warning("clang-tidy timed out")
		os.RemoveAll(tmpDir)
		return nil, "", "", &InputError{"Analysis timed out, code or configuration is too complex"}
	}

	diagnostics = parseDiagnostics(stdout.String(), fileName)

	if runErr != nil {
		if _, ok := runErr.(*exec.ExitError); ok {
			if looksLikeHardFailure(stderr.String(), diagnostics) {
				log.Warningf("clang-tidy returned an error: %s", stderr.String())
				os.RemoveAll(tmpDir)
				return nil, "", "", &InputError{fmt.Sprintf("clang-tidy returned an error:\n%s", stderr.String())}
			}
			// Non-zero exit with parsed diagnostics is normal (error-severity
			// diagnostics or WarningsAsErrors promote the exit code).
		} else {
			log.Debugf("Internal error running clang-tidy: %s", runErr)
			os.RemoveAll(tmpDir)
			return nil, "", "", &InternalError{}
		}
	}

	return diagnostics, filePath, tmpDir, nil
}

func (a *Analyzer) Analyze(version, filenameExt, code, tidyConfigYaml, extraArgs string) ([]Diagnostic, error) {
	log.Debugf("Start analyzing\nversion:%s\nfilenameExt: %s\nCode:\n%s\n\n\nConfig:\n%s\n\n\n", version, filenameExt, code, tidyConfigYaml)
	diagnostics, _, tmpDir, err := a.runClangTidy(version, filenameExt, code, tidyConfigYaml, extraArgs, nil)
	if tmpDir != "" {
		defer os.RemoveAll(tmpDir)
	}
	if err != nil {
		return nil, err
	}
	log.Debugf("Finished analyzing. Found %d diagnostics", len(diagnostics))
	return diagnostics, nil
}

// Fix runs clang-tidy with --fix-errors and returns the rewritten file
// content alongside whatever diagnostics it still printed (fixes that were
// applied, and anything left unfixed). --fix-errors rather than plain --fix
// so it still applies what it can even if the sample has unrelated compile
// errors elsewhere, matching Analyze's existing tolerance for broken code.
func (a *Analyzer) Fix(version, filenameExt, code, tidyConfigYaml, extraArgs string) (string, []Diagnostic, error) {
	log.Debugf("Start fixing\nversion:%s\nfilenameExt: %s\nCode:\n%s\n\n\nConfig:\n%s\n\n\n", version, filenameExt, code, tidyConfigYaml)
	diagnostics, filePath, tmpDir, err := a.runClangTidy(version, filenameExt, code, tidyConfigYaml, extraArgs, []string{"--fix-errors"})
	if tmpDir != "" {
		defer os.RemoveAll(tmpDir)
	}
	if err != nil {
		return "", nil, err
	}

	fixedCode, readErr := os.ReadFile(filePath)
	if readErr != nil {
		log.Errorf("Failed to read fixed file: %s", readErr)
		return "", nil, &InternalError{}
	}

	log.Debugf("Finished fixing. %d diagnostics remain", len(diagnostics))
	return string(fixedCode), diagnostics, nil
}
