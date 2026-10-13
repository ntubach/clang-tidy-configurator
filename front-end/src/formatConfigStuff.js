import yaml from "yaml"
import { cloneDeepWith, isNumber, isObject } from "lodash";
import { ValidationError } from "./tidyConfigStuff"

// .clang-format handling for the Readability Preview's Format tab, against
// the option schema llvm/build-format-config.py generates (the same shape
// clang-format-configurator-v2 uses, so its option UI ports over as-is).
//
// Unlike clang-format-configurator-v2, which fills every option with the
// selected BasedOnStyle's defaults on style change, the state here is
// sparse: { BasedOnStyle, ...only the options the user actually set }.
// clang-format resolves everything else from BasedOnStyle itself, the
// selectors already show the style's default for an unset option, and the
// generated .clang-format file stays as short as the user's real changes.

// Style the sample (code_snippets/sample.cpp) is already formatted in, so
// the Format tab starts as a no-op the same way the naming defaults do.
export const DEFAULT_FORMAT_OPTIONS = { BasedOnStyle: "Chromium" }

// Value an option effectively has: the user's own, else the style default.
export function effectiveFormatValue(formatConfig, version, formatOptions, title) {
  if (formatOptions[title] !== undefined) return formatOptions[title]
  const option = formatConfig?.[version]?.find((o) => o.title === title)
  const style = formatOptions.BasedOnStyle || "LLVM"
  return option && !option.nested ? option.values[0].defaults?.[style]?.value : undefined
}

// Drops empty arrays/objects and empty array elements; clang-format rejects
// an empty mapping and treats an empty list the same as unset anyway.
function removeEmpty(obj) {
  Object.entries(obj).filter(([, v]) => isObject(v)).forEach(([k, v]) => {
    if (Array.isArray(v)) {
      obj[k] = v.filter((n) => !isObject(n) || Object.values(n).some((x) => x != null))
        .filter((n) => n !== "" && n != null)
      if (obj[k].length === 0) delete obj[k]
    } else {
      removeEmpty(v)
      if (Object.values(v).every((x) => x === undefined)) delete obj[k]
    }
  })
  return obj
}

// Flow-style YAML for clang-format's -style= argument. Lifted from
// clang-format-configurator-v2's buildYamlCmdString, including its two
// workarounds: clang-format can't parse a flow-style mapping whose last
// value is a bare integer, and wants booleans quoted for the same reason,
// so every scalar is sent as a quoted string.
export function buildFormatStyleArg(formatOptions) {
  const customizer = (value, key, object) => {
    if (object && isNumber(value)) return value.toString()
    return undefined
  }
  const doc = new yaml.Document()
  doc.contents = removeEmpty(cloneDeepWith(formatOptions, customizer))
  return doc.toString({
    collectionStyle: 'flow', indentSeq: false,
    falseStr: "'false'", trueStr: "'true'", defaultStringType: 'QUOTE_SINGLE',
    defaultKeyType: 'PLAIN',
  })
}

// Block-style YAML for a .clang-format file to download.
export function buildFormatConfigFile(formatOptions) {
  const doc = new yaml.Document()
  doc.contents = removeEmpty(cloneDeepWith(formatOptions, () => undefined))
  return doc.toString()
}

// clang-format 15 replaced AlignConsecutive*'s plain enum values with a
// struct (and still accepts the old spellings, but this UI only knows the
// struct form for those versions), so legacy values in an uploaded file are
// converted rather than rejected.
const LEGACY_ALIGN_CONSECUTIVE = {
  None: [false, false, false],
  false: [false, false, false],
  Consecutive: [true, false, false],
  true: [true, false, false],
  AcrossEmptyLines: [true, true, false],
  AcrossComments: [true, false, true],
  AcrossEmptyLinesAndComments: [true, true, true],
}

function convertLegacyAlignConsecutive(options, version) {
  const major = parseInt(version)
  if (major < 15) return
  Object.keys(options).filter((k) => k.startsWith("AlignConsecutive")).forEach((k) => {
    const flags = LEGACY_ALIGN_CONSECUTIVE[String(options[k])]
    if (typeof options[k] === "object" || flags === undefined) return
    const [Enabled, AcrossEmptyLines, AcrossComments] = flags
    options[k] = {
      Enabled, AcrossEmptyLines, AcrossComments, AlignCompound: false,
      ...(major >= 18 ? { AlignFunctionPointers: false } : {}),
      PadOperators: true,
    }
  })
}

// Parses an uploaded/edited .clang-format into the sparse state above. A
// multi-language file (several `---` documents, each with its own
// Language) is narrowed to the C++ one, since that's all this page formats.
export function loadFormatConfigFromString(configStr, formatConfig, version) {
  const docs = yaml.parseAllDocuments(configStr)
  const errored = docs.find((d) => d.errors.length > 0)
  if (errored) throw new ValidationError(errored.errors[0].message)
  const parsedDocs = docs.map((d) => d.toJSON()).filter((d) => d !== null && d !== undefined)
  if (parsedDocs.some((d) => typeof d !== "object" || Array.isArray(d)))
    throw new ValidationError("Looks like an invalid .clang-format file")

  const cppDoc = parsedDocs.find((d) => d.Language === "Cpp")
  const generalDoc = parsedDocs.find((d) => d.Language === undefined)
  const options = { ...(generalDoc || {}), ...(cppDoc || {}) }
  if (parsedDocs.length > 0 && !cppDoc && !generalDoc)
    throw new ValidationError("This .clang-format has no section for C++ (Language: Cpp)")
  delete options.Language

  const knownTitles = new Set((formatConfig[version] || []).map((o) => o.title))
  const unknown = Object.keys(options).filter((k) => !knownTitles.has(k))
  if (unknown.length > 0)
    throw new ValidationError(`Not a clang-format ${version} option: ${unknown.join(", ")}`)

  convertLegacyAlignConsecutive(options, version)
  return options
}
