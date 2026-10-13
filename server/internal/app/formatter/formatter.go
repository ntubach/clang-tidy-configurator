package formatter

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	log "github.com/sirupsen/logrus"
)

type InternalError struct{}

func (er *InternalError) Error() string {
	return "Internal error"
}

type InputError struct {
	what string
}

func (er *InputError) Error() string {
	return er.what
}

// Formatter runs clang-format for the Readability Preview page's Format tab.
// Ported from clang-format-configurator-v2's formatter, plus the absolute
// path resolution and timeout the analyzer here already has.
type Formatter struct {
	executables map[string]string
	timeout     time.Duration
}

// NewFormatter never fails outright: clang-format is an optional extra on
// top of clang-tidy, so a version whose binary is missing or broken is just
// dropped (and /format answers "not available" for it) rather than taking
// the whole server down with it.
func NewFormatter(versions map[string]string) *Formatter {
	f := &Formatter{executables: make(map[string]string), timeout: 10 * time.Second}
	for version, execPath := range versions {
		absExecPath, err := filepath.Abs(execPath)
		if err != nil {
			log.Errorf("Failed to resolve absolute path for %s: %s", execPath, err)
			continue
		}
		cmd := exec.Command(absExecPath, "--version")
		output := new(strings.Builder)
		cmd.Stdout = output
		if err := cmd.Run(); err != nil {
			log.Errorf("%s exited with code %s\n stdout:\n%s", absExecPath, err, output.String())
			continue
		}
		f.executables[version] = absExecPath
		log.Infof("%s --version output:\n%s", absExecPath, output.String())
	}
	if len(f.executables) == 0 {
		log.Warning("No working clang-format binaries configured, /format will reject every request")
	}
	return f
}

func (f *Formatter) VersionAvailable(version string) bool {
	_, present := f.executables[version]
	return present
}

// Format pipes code through clang-format with style (contents of a
// .clang-format file) and returns the formatted result.
func (f *Formatter) Format(version, filenameExt, code, style string) (string, error) {
	log.Debugf("Start formatting\nversion:%s\nfilenameExt: %s\nCode:\n%s\n\n\nStyle:\n%s\n\n\n", version, filenameExt, code, style)
	executable, ok := f.executables[version]
	if !ok {
		return "", &InputError{"selected clang-format version is not available"}
	}

	ctx, cancel := context.WithTimeout(context.Background(), f.timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, executable,
		fmt.Sprintf("-style=%s", style),
		fmt.Sprintf("--assume-filename=sample%s", filenameExt))
	cmd.Stdin = strings.NewReader(code)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()

	if ctx.Err() == context.DeadlineExceeded {
		log.Warning("clang-format timed out")
		return "", &InputError{"Formatting timed out, code or configuration is too complex"}
	}
	if err != nil {
		if _, ok := err.(*exec.ExitError); ok {
			log.Warningf("clang-format returned an error: %s", stderr.String())
			return "", &InputError{fmt.Sprintf("clang-format returned an error:\n%s", stderr.String())}
		}
		log.Debugf("Internal error running clang-format: %s", err)
		return "", &InternalError{}
	}

	log.Debug("Finished formatting")
	return stdout.String(), nil
}
