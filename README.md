# Clang-tidy-configurator-v2

Interactively pick clang-tidy checks and check options while watching the diagnostics they
produce on your own code, live. The clang-tidy equivalent of
[clang-format-configurator-v2](https://github.com/Wirena/clang-format-configurator-v2), reusing
its overall architecture (a small Go server shelling out to real clang binaries + a React
front-end) but with a data model and UI built around clang-tidy's checks/CheckOptions instead of
clang-format's formatting options.

## Status

This is a v1 built end-to-end against one locally-installed clang-tidy version (20.1.8). The
`llvm/` build pipeline that builds many versions from source (mirroring the reference project's
`llvm/prepare.sh`) is written but has not been run beyond generating the schema for this one
version — see "Adding more versions" below.

## How it differs from clang-format-configurator-v2

- clang-format has ~100 structured formatting options. clang-tidy has 573 checks (simple on/off
  toggles, glob-matched by name, e.g. `bugprone-*`) plus ~190 check-specific `CheckOptions`.
- clang-format's output is reformatted code. clang-tidy's output is diagnostics
  (file:line:col, severity, message, check name) shown as editor markers + a list panel, not a
  code diff.
- clang-tidy only understands C/C++/Objective-C.
- `config.json`'s check list, option names and default values come from introspecting the
  clang-tidy binary directly (`--list-checks`, `--dump-config`) rather than scraping docs, since
  that's ground truth and clang-tidy's per-check docs aren't structured enough to reliably parse
  value constraints from. Human descriptions still come from scraping
  `clang-tools-extra/docs/clang-tidy/checks/**/*.rst`. A small hand-maintained table in
  `llvm/build-config.py` upgrades the identifier-naming casing/Hungarian-prefix options to proper
  dropdowns; everything else is a free-text field (still fully correct to use, just not a
  dropdown).

## Build and Run

Requirements: Go 1.22+, Node 18+, a clang-tidy binary (the system package is fine to start).

1. Point `server/config.json`'s `versions` map at a real clang-tidy binary, e.g. for the system
   package:
   ```
   ln -sf /usr/bin/clang-tidy server/third-party/clang-tidy/clang-tidy-20.1.8
   ```
2. Run the server:
   ```
   cd server
   go run ./cmd/clang-tidy-configurator
   ```
3. Run the front-end:
   ```
   cd front-end
   npm install
   npm start
   ```
   `front-end/src/config.json` is a symlink to `llvm/config.json`, same convention as the
   reference project.

## Adding more versions

`llvm/prepare.sh` builds clang-tidy from source for a list of LLVM tags (same idea as the
reference's `llvm/prepare.sh`, adjusted for `clang-tools-extra` and clang-tidy's docs layout) and
copies the per-version check docs. It has **not** been run for the full tag list in this
repository yet - building clang + clang-tools-extra from source is a substantial amount of compute
time per version. Run it with Docker available:

```
cd llvm
./prepare.sh --all
```

This regenerates `llvm/config.json` (via `llvm/build-config.py`) from the newly built binaries and
docs for every tag in `prepare.sh`'s `TAGS` array. Then add each new version to
`server/config.json`'s `versions` map.

To regenerate `config.json` for binaries/docs you already have on disk without the Docker
pipeline:

```
cd llvm
python3 build-config.py <dir-of-clang-tidy-N binaries> <dir-of-per-version-docs> ./config.json
```

## Known limitations (v1)

- Only the module-level bulk toggle + explicit per-check overrides are reconstructed when loading
  an uploaded `.clang-tidy` file; hand-written partial globs (e.g. `bugprone-use-*`) are ignored
  rather than reverse-engineered, since this configurator never writes those itself.
- No `--fix` / before-after diff view - only diagnostics.
- CheckOptions enum constraints are only recognized for identifier-naming's casing and
  Hungarian-prefix options; everything else is a free-text field.
