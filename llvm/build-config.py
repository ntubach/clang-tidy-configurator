#!/usr/bin/python3
"""
Builds front-end/src/config.json (schema of clang-tidy checks + CheckOptions)
for one or more clang-tidy versions.

Unlike clang-format-configurator-v2's build-config.py (which scrapes a single,
consistently-formatted ClangFormatStyleOptions.rst for everything, including
option defaults), clang-tidy's ~190 CheckOptions are documented as freehand
prose scattered across ~500 small per-check .rst files with no consistent
enum-value format. So here:

  - the check list, module grouping, option names and DEFAULT VALUES come
    from introspecting the actual clang-tidy binary (--list-checks,
    --dump-config), which is authoritative and can't drift from reality.
  - human descriptions (check docstring, per-option docstring) come from
    scraping clang-tools-extra/docs/clang-tidy/checks/**/*.rst.
  - enum-constrained options are NOT auto-detected from prose (too
    unstructured); a small hand-maintained table below upgrades the handful
    of genuinely enum-shaped, high-value options (identifier-naming's casing
    and Hungarian-prefix options) to dropdowns. Everything else is a
    bool/int/string field, which is still fully correct to use, just a
    free-text input in the UI instead of a dropdown.

Usage:
    build-config.py <bins_dir> <docs_dir> <output_config_json>

<bins_dir> contains files named "clang-tidy-<version>" (executable).
<docs_dir> contains one subdirectory per version, "<version>/checks/...",
a copy of clang-tools-extra/docs/clang-tidy/checks/ at that version's tag.
"""
import functools
import json
import os
import re
import subprocess
import sys
import tempfile

import yaml

# Directory names under clang-tools-extra/docs/clang-tidy/checks/, which
# double as check name prefixes. Sorted longest-first so a check like
# "clang-analyzer-core.NullDereference" resolves to module "clang-analyzer",
# not "clang".
KNOWN_MODULES = sorted([
    "abseil", "altera", "android", "boost", "bugprone", "cert",
    "clang-analyzer", "concurrency", "cppcoreguidelines", "darwin",
    "fuchsia", "google", "hicpp", "linuxkernel", "llvm", "llvmlibc", "misc",
    "modernize", "mpi", "objc", "openmp", "performance", "portability",
    "readability", "zircon",
], key=len, reverse=True)

# Hand-maintained enum tables for options whose valid values are only
# described in prose, keyed by option name suffix.
ENUM_OPTIONS_BY_SUFFIX = {
    "Case": ["aNy_CasE", "lower_case", "UPPER_CASE", "camelBack", "CamelCase",
              "camel_Snake_Back", "Camel_Snake_Case", "Leading_upper_snake_case"],
    "HungarianPrefix": ["Off", "On", "LowerCase", "CamelCase"],
}


def resolve_module(check_name: str) -> str:
    for module in KNOWN_MODULES:
        if check_name == module or check_name.startswith(module + "-"):
            return module
    return check_name.split("-")[0]


def resolve_doc_path(docs_dir: str, version: str, check_name: str, module: str) -> str:
    # Doc layout changed across LLVM versions: older releases (up through
    # ~14.x) have every check's .rst directly under checks/, named after
    # the full check name; newer releases nest them under checks/<module>/.
    # Try nested first (the common case for anything still receiving
    # releases), then fall back to flat.
    rest = check_name[len(module) + 1:] if check_name != module else check_name
    nested = os.path.join(docs_dir, version, "checks", module, rest + ".rst")
    if os.path.isfile(nested):
        return nested
    flat = os.path.join(docs_dir, version, "checks", check_name + ".rst")
    if os.path.isfile(flat):
        return flat
    return nested


def list_checks(binary: str) -> list:
    output = subprocess.run(
        [binary, "-checks=*", "--list-checks"],
        capture_output=True, text=True, check=True,
    ).stdout
    lines = [l.strip() for l in output.splitlines()]
    return sorted(l for l in lines if l and not l.endswith(":"))


def dump_check_options(binary: str) -> dict:
    with tempfile.TemporaryDirectory() as tmp:
        dummy = os.path.join(tmp, "dummy.cpp")
        with open(dummy, "w") as f:
            f.write("int main() { return 0; }\n")
        output = subprocess.run(
            [binary, "-checks=*", "--dump-config", dummy, "--", "-std=c++20"],
            capture_output=True, text=True, check=True, cwd=tmp,
        ).stdout
    parsed = yaml.safe_load(output)
    raw = parsed.get("CheckOptions") or {}
    # Pre-15ish clang-tidy serializes CheckOptions as a list of {key,
    # value} pairs instead of a flat map; normalize to a map either way.
    if isinstance(raw, list):
        return {entry["key"]: entry["value"] for entry in raw}
    return raw


def infer_type(option_name: str, default_value, docstring: str = "") -> str:
    for suffix in ENUM_OPTIONS_BY_SUFFIX:
        if option_name.endswith(suffix):
            return "enum"
    if default_value is not None:
        if default_value in ("true", "false"):
            return "bool"
        if re.fullmatch(r"-?\d+", default_value):
            return "int"
        return "string"
    # No compiled-in default to introspect: some CheckOptions (e.g. most of
    # readability-identifier-naming's per-kind *Case/*Prefix/*Suffix options)
    # are genuinely optional/unset unless the user sets them, so clang-tidy's
    # --dump-config never reports them at all. Fall back to a docstring
    # heuristic for these, discovered only via their ".. option::" rst block.
    if re.search(r"(?i)when (set to|true|enabled)\b.*<code>false</code>|<code>true</code>.{0,60}<code>false</code>", docstring):
        return "bool"
    return "string"


def enum_values(option_name: str):
    for suffix, values in ENUM_OPTIONS_BY_SUFFIX.items():
        if option_name.endswith(suffix):
            return values
    return None


# --- Minimal RST -> HTML rendering, adapted from clang-format-configurator-v2's
# llvm/build-config.py (rst_docstring_to_html_codeblock), extended with bullet
# list support since clang-tidy docs use "- ``value``" lists heavily.

def render_rst_block(text: str) -> str:
    text = text.strip()
    if not text:
        return ""

    def repl_codeblock(match):
        code = match.group("code")
        return "<pre>" + code.replace("<", "&lt;").replace(">", "&gt;") + "</pre>"

    # multi-line ".. code-block:: lang" blocks
    text = re.sub(
        r"(?P<indent> *)\.\. code-block:: \S+\s*\n(?P<code>(?:\n|(?P=indent) {2,}.*\n?)+)",
        repl_codeblock, text, flags=re.MULTILINE,
    )

    paragraphs = re.split(r"\n\s*\n", text)
    html_parts = []
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        if para.startswith("<pre>"):
            html_parts.append(para)
            continue
        bullet_lines = re.findall(r"^\s*[-*]\s+(.*)$", para, re.MULTILINE)
        if bullet_lines and len(bullet_lines) == len(
            [l for l in para.splitlines() if l.strip()]
        ):
            items = "".join(f"<li>{inline_markup(l)}</li>" for l in bullet_lines)
            html_parts.append(f"<ul>{items}</ul>")
        else:
            html_parts.append(f"<p>{inline_markup(para)}</p>")
    return "\n".join(html_parts)


def inline_markup(text: str) -> str:
    text = re.sub(r"``(.+?)``", r"<code>\1</code>", text)
    text = re.sub(r"`([^`]+?)`_?", r"<code>\1</code>", text)
    text = text.replace("**deprecated**", "<b>DEPRECATED</b>")
    return text


OPTION_DIRECTIVE_RE = re.compile(
    r"^\.\. option:: (\S+)\n((?:[ \t]+.*\n|\n)*)", re.MULTILINE
)


def parse_check_rst(path: str):
    try:
        with open(path, "r") as f:
            raw = f.read()
    except FileNotFoundError:
        return {"shortDescription": "", "docstring": "", "offersFixes": None}, {}

    # Drop the ".. title::" line, the redirect-stub ".. meta::" block that
    # auto-generated clang-analyzer-*.rst files carry, and the
    # "<name>\n====...\n" heading.
    body = re.sub(r"^\.\. title:: .*\n", "", raw)
    body = re.sub(r"^\.\. meta::\n(?:[ \t]+.*\n)*\n?", "", body, flags=re.MULTILINE)
    body = re.sub(r"^\S.*\n=+\n", "", body, count=1, flags=re.MULTILINE)

    option_docs = {}
    for m in OPTION_DIRECTIVE_RE.finditer(body):
        name = m.group(1)
        block = "\n".join(
            line[4:] if line.startswith("    ") else line.strip()
            for line in m.group(2).splitlines()
        )
        option_docs[name] = render_rst_block(block)

    # Main docstring: everything before the "Options\n-------" section (if
    # any), with ".. option::" directives stripped out so they aren't
    # duplicated in the check-level docstring.
    main_part = re.split(r"^Options\n-{3,}\n", body, maxsplit=1, flags=re.MULTILINE)[0]
    main_part = OPTION_DIRECTIVE_RE.sub("", main_part)
    main_part = re.sub(r"^Example.?\n-+\n", "", main_part, flags=re.MULTILINE)

    docstring_html = render_rst_block(main_part)
    first_para_match = re.search(r"<p>(.*?)</p>", docstring_html, re.DOTALL)
    short_description = ""
    if first_para_match:
        short_description = re.sub(r"<[^>]+>", "", first_para_match.group(1)).strip()

    return {
        "shortDescription": short_description,
        "docstring": docstring_html,
    }, option_docs


def parse_offers_fixes(docs_dir: str, version: str) -> dict:
    list_rst = os.path.join(docs_dir, version, "checks", "list.rst")
    result = {}
    try:
        with open(list_rst, "r") as f:
            content = f.read()
    except FileNotFoundError:
        return result
    for m in re.finditer(r":doc:`([\w-]+(?:\.[\w]+)?)\s*<[^>]+>`,\s*\"?(Yes)?\"?", content):
        result[m.group(1)] = m.group(2) == "Yes"
    return result


def build_version_config(binary: str, docs_dir: str, version: str) -> dict:
    checks = list_checks(binary)
    check_options_defaults = dump_check_options(binary)
    offers_fixes = parse_offers_fixes(docs_dir, version)

    # Group the flat "<check>.<Option>" default map by check.
    options_by_check = {}
    for key, value in check_options_defaults.items():
        check_name, _, option_name = key.rpartition(".")
        options_by_check.setdefault(check_name, {})[option_name] = value

    modules = set()
    check_entries = []
    for check_name in checks:
        module = resolve_module(check_name)
        modules.add(module)
        doc_path = resolve_doc_path(docs_dir, version, check_name, module)
        check_doc, option_docs = parse_check_rst(doc_path)

        introspected_defaults = options_by_check.get(check_name, {})
        # Union of binary-introspected option names (ground truth, has a
        # default) and rst-documented option names (".. option::" blocks
        # found regardless of whether dump-config reported a default) -
        # see infer_type()'s docstring for why the latter can be nonempty
        # even when the former is sparse/missing for a check.
        all_option_names = sorted(set(introspected_defaults) | set(option_docs))

        options = []
        for option_name in all_option_names:
            default_value = introspected_defaults.get(option_name)
            docstring = option_docs.get(option_name, "")
            option_type = infer_type(option_name, default_value, docstring)
            entry = {
                "name": option_name,
                "type": option_type,
                "defaultValue": default_value if default_value is not None else "",
                "docstring": docstring,
            }
            if option_type == "enum":
                entry["enum"] = enum_values(option_name)
            options.append(entry)

        check_entries.append({
            "name": check_name,
            "module": module,
            "offersFixes": offers_fixes.get(check_name),
            "shortDescription": check_doc.get("shortDescription", ""),
            "docstring": check_doc.get("docstring", ""),
            "options": options,
        })

    return {
        "modules": sorted(modules),
        "checks": check_entries,
    }


def version_sort_key(v: str):
    parts = re.split(r"[.-]", v)
    return [int(p) if p.isdigit() else p for p in parts]


def main():
    if len(sys.argv) != 4:
        print("3 args expected: path to dir with clang-tidy binaries, "
              "path to dir with per-version docs, output file path")
        sys.exit(1)

    bins_dir, docs_dir, output_path = sys.argv[1:4]

    versions = []
    binaries = {}
    for filename in sorted(os.listdir(bins_dir)):
        m = re.match(r"clang-tidy-(.+)$", filename)
        if not m:
            continue
        version = m.group(1)
        versions.append(version)
        binaries[version] = os.path.abspath(os.path.join(bins_dir, filename))

    versions.sort(key=version_sort_key, reverse=True)

    config = {
        "AnalyzeApiUrl": "http://localhost:8080/analyze?",
        "FixApiUrl": "http://localhost:8080/fix?",
        "Versions": {"title": "Version", "values": versions},
    }

    for version in versions:
        sys.stderr.write(f"Building config for {version}\n")
        config[version] = build_version_config(binaries[version], docs_dir, version)

    with open(output_path, "w") as f:
        json.dump(config, f)


if __name__ == "__main__":
    main()
