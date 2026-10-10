# Clang-tidy-configurator-v2

Interactively pick clang-tidy checks and check options while watching the diagnostics they
produce on your own code, live. The clang-tidy equivalent of
[clang-format-configurator-v2](https://github.com/Wirena/clang-format-configurator-v2), reusing
its overall architecture (a small Go server shelling out to real clang binaries + a React
front-end) but with a data model and UI built around clang-tidy's checks/CheckOptions instead of
clang-format's formatting options.

A second, lighter-weight page ("Readability Preview", reachable via the header button) is closer
to clang-format-configurator's own UX: pick from the `readability-*` checks that have a known safe
fix, and see the sample rewritten in place - or diffed against where it started - instead of a
diagnostics list. See `front-end/src/components/ReadabilityPage.jsx`.

## Live deployment

Running at https://clang-tidy-configurator.site - a $6/mo DigitalOcean droplet (nginx serves the
built front-end and proxies `/analyze` to the Go backend, which runs as the `ctc` systemd service,
`clang-tidy-configurator.service`), fronted by Cloudflare for DNS and TLS. The domain is
registered and DNS-managed through Cloudflare (SSL/TLS mode: Flexible - Cloudflare terminates
HTTPS for visitors and talks to the droplet over plain HTTP, so the origin itself has no
certificate of its own). The droplet is still directly reachable at its bare IP,
`165.227.213.129`, over HTTP only.

Every push to `main` auto-deploys via `.github/workflows/deploy.yml`: it rsyncs the repo to
`/opt/clang-tidy-configurator` as an unprivileged `deploy` user, rebuilds both the Go binary and
the front-end on the server, then restarts the service (`deploy` has a sudoers rule scoped to
exactly `systemctl restart clang-tidy-configurator` and `systemctl reload nginx`, nothing else).
`llvm/config.json` and the `clang-tidy` binary under `server/third-party/` are deliberately
excluded from that sync - they're not tracked in git, so a routine deploy leaves them alone; see
"Adding more versions" below for when you actually want to regenerate them.

The workflow authenticates over SSH using a dedicated deploy keypair, stored only as encrypted
GitHub Actions secrets (`DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_USER`) - not this repo, not
anyone's laptop. To rotate it: generate a new keypair, replace the `deploy` user's
`~/.ssh/authorized_keys` entry on the server, and `gh secret set DEPLOY_SSH_KEY < new_key`.

## Status

Supports clang-tidy 14.0.6 through 23.1.2, installed as prebuilt packages (Ubuntu's own repos for
14-19, `apt.llvm.org` for 20+) rather than built from source - see "Adding more versions" below for
why, and for the `llvm/prepare.sh` source-build pipeline that exists but isn't what's actually
running. Two version-range quirks `build-config.py` and the backend both account for:

- clang-tidy's docs changed layout partway through this range: flat `checks/<name>.rst` files on
  14.x, nested `checks/<module>/<name>.rst` on 15.x+.
- `CheckOptions` changed serialization shape too: a `{key, value}` list on 14.x (and still accepted
  by every later version), a flat map on 15.x+ (not accepted by 14.x). The frontend always emits
  the list form for this reason - it's the one shape that works everywhere.
- `--allow-no-checks` was added in clang-tidy 19; the backend detects support per binary rather
  than assuming it, since passing it to an older binary fails the entire invocation before it
  analyzes anything.

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
   `front-end/public/config.json` is a symlink to `llvm/config.json`. It lives under `public/`,
   not `src/`, so it's fetched at runtime as a static asset rather than bundled into the JS by
   webpack - that file can run to several megabytes (hundreds of checks x many versions), and
   bundling it is enough to OOM a small build machine.

## Adding more versions

The 14-23 range currently running was set up the fast way, not via the Docker source-build
pipeline below:

1. Install `clang-tidy-N` for the new version (Ubuntu's own repos cover a few versions; otherwise
   add `apt.llvm.org`'s repo for that major version and install just the `clang-tidy-N` package -
   avoid its `llvm.sh` installer script, which pulls in `lldb` and conflicts across versions on
   shared files like `/etc/lldb/lldbinit`).
2. Symlink it into `server/third-party/clang-tidy/clang-tidy-<full-version>` and add that version
   to `server/config.json`'s `versions` map.
3. Sparse-checkout `clang-tools-extra/docs/clang-tidy/checks` at the matching `llvmorg-<version>`
   tag into `llvm/docs/<version>/checks/` (via `git archive <tag> -- <path> | tar -x`, not
   `git checkout -- <path>` in a reused working tree - the latter doesn't prune files a newer tag
   removed, silently mixing content from whatever was checked out there before).
4. Regenerate the schema: `cd llvm && python3 build-config.py <bins_dir> docs ./config.json`.
5. Re-deploy the front-end's static `config.json` and rebuild - see the gotcha below.

`llvm/prepare.sh` builds clang-tidy from source for a list of LLVM tags instead (same idea as the
reference's `llvm/prepare.sh`, adjusted for `clang-tools-extra` and clang-tidy's docs layout), for
reaching further back than packages go (pre-14.x). It has **not** been run - building
clang + clang-tools-extra from source is a substantial amount of compute time per version, on a
box with more than the 1 vCPU / 1GB this is deployed on. Run it with Docker available:

```
cd llvm
./prepare.sh --all
```

This regenerates `llvm/config.json` via the same `llvm/build-config.py` from the newly built
binaries and docs for every tag in `prepare.sh`'s `TAGS` array.

### Gotcha: AnalyzeApiUrl / FixApiUrl

`build-config.py` always writes `AnalyzeApiUrl` and `FixApiUrl` as `http://localhost:8080/...`
(the value that's actually correct for local dev, via `npm start`). Production needs both set to
the relative `/analyze?` and `/fix?` instead, so the browser hits the same origin nginx proxies
rather than literally `localhost` in each visitor's own browser. Since `front-end/public/config.json`
is copied into `front-end/build/config.json` at build time (not left as a symlink), patching the
committed `llvm/config.json` alone isn't enough once a build already ran - either patch both URLs
*before* `npm run build`, or patch the deployed `front-end/build/config.json` directly, which takes
effect immediately with no rebuild since it's served as a static file.

## Known limitations (v1)

- Only the module-level bulk toggle + explicit per-check overrides are reconstructed when loading
  an uploaded `.clang-tidy` file; hand-written partial globs (e.g. `bugprone-use-*`) are ignored
  rather than reverse-engineered, since this configurator never writes those itself.
- CheckOptions enum constraints are only recognized for identifier-naming's casing and
  Hungarian-prefix options; everything else is a free-text field.
- The Readability Preview page is checks-only, on/off - it doesn't expose per-check `CheckOptions`
  (so e.g. identifier-naming's casing style there is always whatever clang-tidy defaults to), and
  only offers `readability-*` checks our schema marks `offersFixes: true` for, not the full set of
  checks with fixes across every module.
