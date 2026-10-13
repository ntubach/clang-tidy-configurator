#!/bin/bash
# One-time (re-runnable) setup for the Readability Preview's Format tab on
# the production droplet. Run from anywhere inside the checkout, as a user
# with sudo (it only uses sudo for apt-get and systemctl):
#
#   /opt/clang-tidy-configurator/deploy/enable-clang-format.sh
#
# For every clang-tidy version in server/config.json's "versions" map, it:
#   1. installs the matching clang-format-<major> package if missing
#   2. symlinks it to server/third-party/clang-format/clang-format-<version>
#      (the path server/config.json's "format-versions" map expects)
#   3. downloads ClangFormatStyleOptions.rst at llvmorg-<version> into
#      llvm/format-docs/
# then regenerates llvm/format-config.json with FormatApiUrl pointed at
# the same-origin /format?, links it into the front-end (and into the
# current build/, so it's served immediately without a rebuild), restarts
# the backend so it picks up the new binaries, and smoke-tests /format.
#
# Everything it writes (server/third-party, llvm/format-docs,
# llvm/format-config.json, front-end/public/format-config.json) is excluded
# from the deploy workflow's rsync, so later deploys leave it in place.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE="clang-tidy-configurator"
BIN_DIR="$REPO/server/third-party/clang-format"
DOCS_DIR="$REPO/llvm/format-docs"
SCHEMA="$REPO/llvm/format-config.json"

VERSIONS=$(python3 -c 'import json,sys; print(" ".join(json.load(open(sys.argv[1]))["versions"]))' "$REPO/server/config.json")
echo "clang-tidy versions in server/config.json: $VERSIONS"

mkdir -p "$BIN_DIR" "$DOCS_DIR"

missing_pkgs=()
for version in $VERSIONS; do
    major="${version%%.*}"
    command -v "clang-format-$major" >/dev/null || missing_pkgs+=("clang-format-$major")
done
if [ ${#missing_pkgs[@]} -gt 0 ]; then
    echo "Installing: ${missing_pkgs[*]}"
    sudo apt-get update -qq
    sudo apt-get install -y -qq "${missing_pkgs[@]}"
fi

for version in $VERSIONS; do
    major="${version%%.*}"
    binary="$(command -v "clang-format-$major")"
    actual="$("$binary" --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
    if [ "$actual" != "$version" ]; then
        # Same LLVM major, different patch release: still the right tool,
        # but the option docs/defaults are taken at $version's tag.
        echo "WARNING: clang-format-$major is $actual, not $version - using it anyway"
    fi
    ln -sfn "$binary" "$BIN_DIR/clang-format-$version"

    if [ ! -s "$DOCS_DIR/$version.rst" ]; then
        echo "Downloading ClangFormatStyleOptions.rst for $version"
        curl -sfL -o "$DOCS_DIR/$version.rst.tmp" \
            "https://raw.githubusercontent.com/llvm/llvm-project/llvmorg-$version/clang/docs/ClangFormatStyleOptions.rst"
        mv "$DOCS_DIR/$version.rst.tmp" "$DOCS_DIR/$version.rst"
    fi
done

python3 -c 'import yaml' 2>/dev/null || {
    echo "Installing python3-yaml for build-format-config.py"
    sudo apt-get install -y -qq python3-yaml
}

echo "Generating $SCHEMA"
python3 "$REPO/llvm/build-format-config.py" "$BIN_DIR" "$DOCS_DIR" "$SCHEMA"
# Same-origin URL for production (build-format-config.py writes the
# localhost one used by `npm start`) - see README's FormatApiUrl gotcha.
sed -i 's#"FormatApiUrl": "http://localhost:8080/format?"#"FormatApiUrl": "/format?"#' "$SCHEMA"
grep -q '"FormatApiUrl": "/format?"' "$SCHEMA" || { echo "Failed to patch FormatApiUrl"; exit 1; }

ln -sfn ../../llvm/format-config.json "$REPO/front-end/public/format-config.json"
if [ -d "$REPO/front-end/build" ]; then
    cp "$SCHEMA" "$REPO/front-end/build/format-config.json"
fi

echo "Restarting $SERVICE"
sudo systemctl restart "$SERVICE"

# Startup runs --version/--help on every clang-tidy and clang-format binary,
# which takes a while on a 1 vCPU droplet, so poll rather than sleep once.
first_version="${VERSIONS%% *}"
response=""
for _ in $(seq 1 30); do
    response=$(curl -s -X POST "http://127.0.0.1:8080/format?version=$first_version&filext=.cpp" \
        -d '{"code":"int  x;","style":"{BasedOnStyle: LLVM}"}') && break
    sleep 1
done
echo "Smoke test /format ($first_version): $response"
case "$response" in
    *'"formattedCode":"int x;"'*) echo "Done - the Format tab is enabled." ;;
    *) echo "Smoke test failed - check: journalctl -u $SERVICE -n 50"; exit 1 ;;
esac
