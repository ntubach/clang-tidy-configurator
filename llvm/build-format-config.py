#!/usr/bin/python3
"""
Builds llvm/format-config.json (schema of clang-format style options) for one
or more clang-format versions, for the Readability Preview page's Format tab.

The option parsing (everything scraped from ClangFormatStyleOptions.rst:
option names, types, enum values, nested flags, docstrings) is lifted from
clang-format-configurator-v2's llvm/build-config.py, so the output has the
shape that project's option UI (ported into front-end/src/components/format/)
expects. Differences:

  - per-style defaults are read straight from each binary's --dump-config
    (the same way build-config.py introspects clang-tidy), rather than from
    files dumped in a separate Docker stage first.
  - nested-flag parsing is fixed (see parse_nested_conf_flags) and nested
    options are marked "nested": true explicitly, since one can legitimately
    end up with a single nested flag (see drop_undumped_nested_flags).

Usage:
    build-format-config.py <bins_dir> <docs_dir> <output_config_json>

<bins_dir> contains files named "clang-format-<version>" (executable).
<docs_dir> contains one "<version>.rst" per version, a copy of
clang/docs/ClangFormatStyleOptions.rst at that version's llvmorg tag.
"""
import json
import os
import re
import subprocess
import sys

import yaml
from yaml.resolver import Resolver

STYLES = ["LLVM", "Google", "Chromium", "Mozilla", "WebKit", "Microsoft", "GNU"]

known_types = ["bool", "unsigned", "std::string", "std::vector<std::string>", "int",
               "std::vector<IncludeCategory>", "std::vector<RawStringFormat>"]

new_type_naming_map = {"Boolean": "bool", "Unsigned": "unsigned", "String": "std::string",
                       "Integer": "int", "List of Strings": "std::vector<std::string>",
                       "List of RawStringFormats": "std::vector<RawStringFormat>",
                       "List of IncludeCategories": "std::vector<IncludeCategory>"}


def parse_nested_conf_flags(text: str):
    # Unlike the original, each nested flag's enum values are scraped from
    # that flag's own section only (the original scanned the whole option,
    # giving every nested enum flag every other flag's values too), and the
    # type is everything before the last word, so multi-word types like
    # "List of Strings" don't swallow the name.
    headers = list(re.finditer(r'^  \* ``(.+) (\w+)``', text, re.MULTILINE))
    nopts = []
    for i, m in enumerate(headers):
        section = text[m.end():headers[i + 1].start() if i + 1 < len(headers) else len(text)]
        typename = new_type_naming_map.get(m.group(1), m.group(1))
        variants = []
        if typename not in known_types:
            variants = [""]
            for m1 in re.finditer(r'^    \* ``.*`` \(in configuration: ``(.*)``', section, re.MULTILINE):
                if m1.group(1) not in variants:
                    variants.append(m1.group(1))
        nopts.append({"title": m.group(2), "argument_type": typename, "arg_val_enum": variants})
    return nopts


def parse_unknown_arg_type(text: str):
    # group 1 - type variant
    matches = re.finditer(r'\* ``.*`` \(in configuration: ``(.*)``\)', text)
    typeVariants = list(map(lambda m: m.group(1), matches))
    typeVariants.insert(0, "")
    return typeVariants


def parse_based_on_style(header: str, body: str):
    # group 1 - option name, group 2 - type
    header_match = re.match(r'\*{2}(\w+)\*{2} \(``(.*)``\)',
                            header)

    variants_matches = re.finditer(r'\* ``(.*)', body)
    typeVariants = list(map(lambda m: m.group(1).replace("``", ""),
                            variants_matches))
    typeVariants.insert(0, '')
    return {"title": header_match.group(1), "docstring":
            rst_docstring_to_html_codeblock(body).replace("`_", ""),
            "values": [{"title": header_match.group(1), "argument_type": header_match.group(2),
                       "arg_val_enum": typeVariants}]}


def rst_docstring_to_html_codeblock(docstring: str) -> str:
    def repl(match):
        if match.group(4) is not None:
            return '<pre>'+match.group(4).replace('<', "&lt;").replace('>', "&gt;")+'</pre>'
        elif match.group(6) is not None:
            return '<p>' + match.group(6) + '</p>'

    # multiline code and paragraphs
    #  group 3 - language, group 4 - code, group 6 - paragraph
    docstring = docstring.strip()
    docstring = re.sub(r'(?P<indent>  +)(\.\. code-block:: (.*?)\s+$)((\n|(?P=indent)  .*)+)|(^.+?\n)',
                  repl, docstring, 0, re.MULTILINE)
    # single line code
    docstring = re.sub(r'`{1,2}(.+?)`{1,2}',
                  r'<code>\g<1></code>', docstring, 0, re.MULTILINE)
    ## replate **deprecated** with
    docstring = docstring.replace("**deprecated**", "<b>DEPRECATED</b>")
    return docstring.strip()

def check_if_deprecated_by_docstring(docstring: str) -> bool:
    return "**deprecated**" in docstring

def parse_rst(rst: str):

    end_substr = ".. END_FORMAT_STYLE_OPTIONS"
    end_index = rst.find(end_substr)
    options = re.split(r'(^\*{2}\w+\*{2} \(``.*``\))',
                       rst[0:end_index], 0, re.MULTILINE)

    del (options[0])

    options_list = [parse_based_on_style(options[0], options[1])]

    for i in range(2, len(options), 2):
        # group 1 - option name, group 2 - type
        opt_header_match = re.match(
            r'\*{2}(\w+)\*{2} \(``(.*)``\)', options[i])
        if opt_header_match is None:
            sys.stderr.write(f'Error parsing option header:{options[i]}')
            continue


        i += 1
        cur_opt = {"title": opt_header_match.group(
            1), "docstring": rst_docstring_to_html_codeblock(options[i])
            # yep, bringing closer the global warming and the heat death of the universe by calling a replace method
            # on a version 7-13  docstring that is guaranteed not to have a singe occurrence of ":versionbadge:"
            .replace(":versionbadge:", "Introduced in:"),
            "deprecated": check_if_deprecated_by_docstring(options[i]),
            "values": []}
        values = []

        if "Nested configuration flags:" in options[i]:
            nestedOpts = parse_nested_conf_flags(options[i])
            if nestedOpts is None:
                sys.stderr.write(f'Error parsing nested options:{options[i]}')
            else:
                values = nestedOpts
                cur_opt["nested"] = True
        else:
            arg_enum = []
            typename = opt_header_match.group(2)
            if typename in new_type_naming_map:
                typename = new_type_naming_map[typename]

            if typename not in known_types:
                arg_enum = parse_unknown_arg_type(options[i])
                if arg_enum is None:
                    sys.stderr.write(
                        f'Error parsing type variants:{options[i]}')
                    arg_enum = []
            values.append(
                {"title": cur_opt["title"], "argument_type": typename, "arg_val_enum": arg_enum})

        cur_opt["values"] = values
        options_list.append(cur_opt)

    return options_list



def dump_style_defaults(binary: str):
    styles = {}
    for style in STYLES:
        result = subprocess.run([binary, f"--style={style}", "--dump-config"],
                                capture_output=True, text=True)
        if result.returncode != 0:
            sys.stderr.write(f"Failed to dump {style} config from {binary}, skipping\n")
            continue
        styles[style] = yaml.safe_load(result.stdout)
    return styles


def drop_undumped_nested_flags(optionList, styles):
    # A nested flag no style's --dump-config ever emits isn't a real field
    # of that option: e.g. 23.x's BreakBinaryOperations documents the fields
    # of its PerOperator list entries at the same indent as its own, which
    # would otherwise show up as bogus siblings of Default.
    for option in optionList:
        if not option.get("nested"):
            continue
        dumped = [d[option["title"]] for d in styles.values()
                  if isinstance(d.get(option["title"]), dict)]
        if not dumped:
            continue
        option["values"] = [v for v in option["values"] if any(v["title"] in d for d in dumped)]


def apply_defaults(optionList, styles):
    for option in optionList:
        title = option["title"]
        if not option.get("nested"):
            defaults = {}
            for styleName, defaultsList in styles.items():
                if title not in defaultsList or title == "Language":
                    continue
                defaults[styleName] = {"value": defaultsList[title]}
            option["values"][0]["defaults"] = defaults
        else:
            for value in option["values"]:
                defaults = {}
                for styleName, defaultsList in styles.items():
                    if title not in defaultsList or title == "Language" \
                            or not isinstance(defaultsList[title], dict) \
                            or value["title"] not in defaultsList[title]:
                        continue
                    defaults[styleName] = {"value": defaultsList[title][value["title"]]}
                value["defaults"] = defaults


def version_key(version: str):
    return tuple(int(part) for part in version.split("."))


def main():
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(1)
    bins_dir, docs_dir, output_path = sys.argv[1:4]

    # Keep YAML 1.1's yes/no/on/off/y/n as plain strings: clang-format has
    # enum values literally spelled "Yes"/"No" (e.g.
    # AlwaysBreakTemplateDeclarations) that must survive as strings.
    for ch in "OoYyNn":
        if len(Resolver.yaml_implicit_resolvers[ch]) == 1:
            del Resolver.yaml_implicit_resolvers[ch]
        else:
            Resolver.yaml_implicit_resolvers[ch] = [
                x for x in Resolver.yaml_implicit_resolvers[ch] if x[0] != "tag:yaml.org,2002:bool"]

    versions = sorted((f[:-len(".rst")] for f in os.listdir(docs_dir) if f.endswith(".rst")),
                      key=version_key, reverse=True)
    result = {"FormatApiUrl": "http://localhost:8080/format?",
              "Versions": {"title": "Version", "values": []}}
    for version in versions:
        binary = os.path.join(bins_dir, f"clang-format-{version}")
        if not os.access(binary, os.X_OK):
            sys.stderr.write(f"No executable {binary}, skipping {version}\n")
            continue
        with open(os.path.join(docs_dir, f"{version}.rst")) as f:
            optionList = parse_rst(f.read())
        # 23.x documents "InheritParentConfig=<directory-path>" as a
        # BasedOnStyle variant - a placeholder, not a value to pick.
        basedOnStyle = optionList[0]["values"][0]
        basedOnStyle["arg_val_enum"] = [v for v in basedOnStyle["arg_val_enum"] if "<" not in v]
        styles = dump_style_defaults(binary)
        drop_undumped_nested_flags(optionList, styles)
        apply_defaults(optionList, styles)
        result["Versions"]["values"].append(version)
        result[version] = optionList
        print(f"{version}: {len(optionList)} options")

    with open(output_path, "w") as fo:
        json.dump(result, fo)


if __name__ == "__main__":
    main()
