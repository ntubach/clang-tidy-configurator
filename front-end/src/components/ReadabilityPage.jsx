import React from "react";
import yaml from "yaml";
import { Resizable } from "re-resizable";
import Header from "./Header";
import ReadabilityEditor from "./ReadabilityEditor";
import CheckOptionInput from "./CheckOptionInput";
import checkItemStyles from "./CheckItem.module.css";
import LoadingIcon from "./LoadingIcon";
import Error from "./Error";
import ConfigUiPage from "./ConfigUiPage";
import Popup from 'reactjs-popup';
import { Fix } from "../API";
import { ValidationError } from "../tidyConfigStuff";
import styles from "./ReadabilityPage.module.css";
import sampleCpp from '../code_snippets/sample.cpp'

const NAMING_CHECK = "readability-identifier-naming"
const NAMING_DOCS_URL = "https://clang.llvm.org/extra/clang-tidy/checks/readability/identifier-naming.html"

// Every identifier kind readability-identifier-naming documents, grouped the
// way the docs page itself groups them. "Default" is the fallback used for
// any kind left unconfigured, so it gets its own group at the top. Derived
// from introspecting the check's own CheckOptions (see llvm/build-config.py)
// rather than hand-copied from the docs, so it stays correct as clang-tidy
// adds kinds (e.g. Concept, added in clang-tidy 22) - a kind missing for the
// selected version's binary just has no options to show and is hidden below.
//
// Deliberately NOT covered: the HungarianNotation.<Type>.<Name> options
// (e.g. HungarianNotation.PrimitiveType.*) - those are keyed by C/C++ type
// name rather than by identifier kind, a different shape this page's
// per-kind UI doesn't fit. See NAMING_DOCS_URL for those.
const NAMING_KINDS = [
  { group: "Fallback", name: "Default", label: "Default (fallback for any kind not set below)" },
  { group: "Types", name: "AbstractClass", label: "Abstract classes" },
  { group: "Types", name: "Class", label: "Classes" },
  { group: "Types", name: "Struct", label: "Structs" },
  { group: "Types", name: "Union", label: "Unions" },
  { group: "Types", name: "Enum", label: "Enums" },
  { group: "Types", name: "TypeAlias", label: "Type aliases" },
  { group: "Types", name: "Typedef", label: "Typedefs" },
  { group: "Types", name: "Concept", label: "Concepts" },
  { group: "Namespaces", name: "Namespace", label: "Namespaces" },
  { group: "Namespaces", name: "InlineNamespace", label: "Inline namespaces" },
  { group: "Functions & methods", name: "Function", label: "Functions" },
  { group: "Functions & methods", name: "GlobalFunction", label: "Global functions" },
  { group: "Functions & methods", name: "Method", label: "Methods" },
  { group: "Functions & methods", name: "ClassMethod", label: "Class (static) methods" },
  { group: "Functions & methods", name: "VirtualMethod", label: "Virtual methods" },
  { group: "Functions & methods", name: "PrivateMethod", label: "Private methods" },
  { group: "Functions & methods", name: "ProtectedMethod", label: "Protected methods" },
  { group: "Functions & methods", name: "PublicMethod", label: "Public methods" },
  { group: "Functions & methods", name: "ConstexprFunction", label: "Constexpr functions" },
  { group: "Functions & methods", name: "ConstexprMethod", label: "Constexpr methods" },
  { group: "Variables", name: "Variable", label: "Variables" },
  { group: "Variables", name: "GlobalVariable", label: "Global variables" },
  { group: "Variables", name: "GlobalPointer", label: "Global pointers" },
  { group: "Variables", name: "LocalVariable", label: "Local variables" },
  { group: "Variables", name: "LocalPointer", label: "Local pointers" },
  { group: "Variables", name: "StaticVariable", label: "Static variables" },
  { group: "Variables", name: "Parameter", label: "Parameters" },
  { group: "Variables", name: "PointerParameter", label: "Pointer parameters" },
  { group: "Members", name: "Member", label: "Members" },
  { group: "Members", name: "ClassMember", label: "Class members" },
  { group: "Members", name: "PrivateMember", label: "Private members" },
  { group: "Members", name: "ProtectedMember", label: "Protected members" },
  { group: "Members", name: "PublicMember", label: "Public members" },
  { group: "Constants", name: "Constant", label: "Constants" },
  { group: "Constants", name: "ClassConstant", label: "Class constants" },
  { group: "Constants", name: "ClassConstexpr", label: "Class constexpr members" },
  { group: "Constants", name: "ConstantMember", label: "Constant members" },
  { group: "Constants", name: "ConstantParameter", label: "Constant parameters" },
  { group: "Constants", name: "ConstantPointerParameter", label: "Constant pointer parameters" },
  { group: "Constants", name: "ConstexprVariable", label: "Constexpr variables" },
  { group: "Constants", name: "GlobalConstant", label: "Global constants" },
  { group: "Constants", name: "GlobalConstantPointer", label: "Global constant pointers" },
  { group: "Constants", name: "GlobalConstexprVariable", label: "Global constexpr variables" },
  { group: "Constants", name: "LocalConstant", label: "Local constants" },
  { group: "Constants", name: "LocalConstantPointer", label: "Local constant pointers" },
  { group: "Constants", name: "LocalConstexprVariable", label: "Local constexpr variables" },
  { group: "Constants", name: "StaticConstant", label: "Static constants" },
  { group: "Constants", name: "StaticConstexprVariable", label: "Static constexpr variables" },
  { group: "Enum constants", name: "EnumConstant", label: "Enum constants" },
  { group: "Enum constants", name: "ScopedEnumConstant", label: "Scoped enum constants" },
  { group: "Templates", name: "TemplateParameter", label: "Template parameters" },
  { group: "Templates", name: "TypeTemplateParameter", label: "Type template parameters" },
  { group: "Templates", name: "ValueTemplateParameter", label: "Value template parameters" },
  { group: "Templates", name: "TemplateTemplateParameter", label: "Template-template parameters" },
  { group: "Templates", name: "ParameterPack", label: "Parameter packs" },
  { group: "Macros", name: "MacroDefinition", label: "Macro definitions" },
]
const NAMING_GROUP_ORDER = [
  "Fallback", "Types", "Namespaces", "Functions & methods", "Variables",
  "Members", "Constants", "Enum constants", "Templates", "Macros",
]
const NAMING_SUBOPTIONS = ["Case", "Prefix", "Suffix", "IgnoredRegexp", "HungarianPrefix"]

// The check's handful of options that aren't per-kind at all (just plain
// booleans), shown in their own section rather than forced into the
// kind/sub-option grid above.
const NAMING_GENERAL_OPTIONS = [
  { name: "IgnoreMainLikeFunctions", label: "Ignore main-like functions" },
  { name: "AggressiveDependentMemberLookup", label: "Aggressive dependent member lookup" },
  { name: "CheckAnonFieldInParent", label: "Check anonymous field in parent" },
  { name: "GetConfigPerFile", label: "Get config per file" },
  { name: "IgnoreFailedSplit", label: "Ignore failed split" },
]

// Casing (and the occasional prefix/suffix) the kinds code_snippets/sample.cpp
// actually demonstrates have in it today, so this panel starts at a no-op:
// Apply Fixes won't change anything until an option is changed away from
// these. Every other kind/option (the large majority, once templates,
// macros, Hungarian prefixes etc. are included) has no entry here and so
// starts unset, which is itself the aligned default - the sample doesn't
// use any convention for them.
const NAMING_DEFAULTS = {
  ClassCase: "CamelCase",
  StructCase: "CamelCase",
  EnumCase: "CamelCase",
  EnumConstantCase: "CamelCase",
  GlobalConstantCase: "CamelCase",
  GlobalConstantPrefix: "k",
  NamespaceCase: "lower_case",
  FunctionCase: "lower_case",
  MethodCase: "lower_case",
  VariableCase: "lower_case",
  ParameterCase: "lower_case",
  MemberCase: "lower_case",
  MemberSuffix: "_",
}

function defaultNamingOverrides() {
  const overrides = {}
  Object.entries(NAMING_DEFAULTS).forEach(([name, value]) => { overrides[`${NAMING_CHECK}.${name}`] = value })
  return overrides
}

function buildFixChecksYaml(checkOptionOverrides) {
  const doc = new yaml.Document()
  const contents = { Checks: `-*,${NAMING_CHECK}` }
  if (Object.keys(checkOptionOverrides).length > 0)
    // List-of-{key,value} form, not the newer map form - clang-tidy <=14
    // only accepts the list form, and every later version through at
    // least 23 still accepts it too. Same reasoning as tidyConfigStuff.js.
    contents.CheckOptions = Object.entries(checkOptionOverrides).map(([key, value]) => ({ key, value }))
  doc.contents = contents
  return doc.toString()
}

// Loads a .clang-tidy file into this page's narrower state model. This page
// only ever runs identifier-naming, so Checks is ignored entirely rather
// than parsed; a CheckOptions entry outside the curated kinds/sub-options
// above is silently dropped rather than rejected, since this page has no UI
// to represent it anyway.
function loadReadabilityConfigFromString(configStr) {
  const parsed = yaml.parse(configStr)
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    throw new ValidationError("Looks like an invalid .clang-tidy file")

  const recognizedKeys = new Set()
  NAMING_KINDS.forEach((kind) => NAMING_SUBOPTIONS.forEach((sub) => recognizedKeys.add(`${NAMING_CHECK}.${kind.name}${sub}`)))
  NAMING_GENERAL_OPTIONS.forEach((opt) => recognizedKeys.add(`${NAMING_CHECK}.${opt.name}`))

  const checkOptionOverrides = {}
  const rawEntries = Array.isArray(parsed.CheckOptions)
    ? parsed.CheckOptions
      .filter((entry) => entry && typeof entry === "object" && "key" in entry)
      .map(({ key, value }) => [key, value])
    : Object.entries(parsed.CheckOptions || {})
  rawEntries.forEach(([key, value]) => {
    if (recognizedKeys.has(key) && value != null) checkOptionOverrides[key] = String(value)
  })

  return checkOptionOverrides
}

// A second, lighter-weight page, focused entirely on
// readability-identifier-naming: pick a Case/Prefix/Suffix per kind of
// identifier and see the sample rewritten in place (or diffed against where
// it started), instead of the main page's diagnostics list.
const ReadabilityPage = ({ config, selectedVersion, onVersionChange, darkTheme, onDarkThemeChange, onNavigate }) => {
  const [originalCode, setOriginalCode] = React.useState("")
  const [code, setCode] = React.useState("")
  const [checkOptionOverrides, setCheckOptionOverrides] = React.useState(defaultNamingOverrides())
  const [diffMode, setDiffMode] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const [activeErrorPopup, setActiveErrorPopup] = React.useState(false)
  const [configPageOpened, setConfigPageOpened] = React.useState(false)
  const errorText = React.useRef("")

  React.useEffect(() => {
    fetch(sampleCpp)
      .then((response) => response.text())
      .then((text) => { setOriginalCode(text); setCode(text) })
  }, [])

  // Option names don't necessarily match across versions - reset to the
  // sample-aligned defaults when switching, same spirit as the main page's
  // options reset on version change.
  React.useEffect(() => { setCheckOptionOverrides(defaultNamingOverrides()) }, [selectedVersion])

  const namingCheck = React.useMemo(
    () => config[selectedVersion].checks.find((c) => c.name === NAMING_CHECK),
    [config, selectedVersion]
  )
  const namingOptionsByName = React.useMemo(
    () => (namingCheck ? Object.fromEntries(namingCheck.options.map((o) => [o.name, o])) : {}),
    [namingCheck]
  )

  // A kind with no visible sub-options for this version's binary (e.g.
  // Concept, pre-clang-tidy-22) is hidden rather than shown empty; grouped
  // for rendering, and filtered by the search box below.
  const searchLower = search.trim().toLowerCase()
  const matchesSearch = (name, label) =>
    !searchLower || name.toLowerCase().includes(searchLower) || label.toLowerCase().includes(searchLower)
  const visibleKindsByGroup = React.useMemo(() => {
    const byGroup = {}
    NAMING_KINDS.forEach((kind) => {
      const visibleSubs = NAMING_SUBOPTIONS.filter((sub) => namingOptionsByName[`${kind.name}${sub}`])
      if (visibleSubs.length === 0 || !matchesSearch(kind.name, kind.label)) return
      ;(byGroup[kind.group] ||= []).push({ ...kind, visibleSubs })
    })
    return byGroup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namingOptionsByName, searchLower])
  const visibleGeneralOptions = React.useMemo(
    () => NAMING_GENERAL_OPTIONS.filter((opt) => namingOptionsByName[opt.name] && matchesSearch(opt.name, opt.label)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [namingOptionsByName, searchLower]
  )

  function applyFixes(currentCode, optionOverrides) {
    const tidyYaml = buildFixChecksYaml(optionOverrides)
    Fix(currentCode, tidyYaml, "-std=c++20", selectedVersion, "c_cpp", config.FixApiUrl,
      (fixedCode) => {
        setCode(fixedCode)
        window.loadingIcon.setLoadingState("success")
      },
      (errortext) => {
        window.loadingIcon.setLoadingState("error")
        errorText.current = errortext
        setActiveErrorPopup(true)
      })
  }

  function setOption(key, value) {
    setCheckOptionOverrides((prev) => {
      const next = { ...prev }
      if (value === undefined) delete next[key]
      else next[key] = value
      return next
    })
  }

  return (
    <div>
      <Header
        darkTheme={darkTheme}
        onDarkThemeChange={onDarkThemeChange}
        versions={config.Versions.values}
        selectedVersion={selectedVersion}
        onVersionChange={onVersionChange}
        navLabel="Back to Analyzer"
        onNavClick={onNavigate}
        primaryAction={
          <button onClick={() => { window.loadingIcon.setLoadingState("loading"); applyFixes(code, checkOptionOverrides) }}>
            Apply Fixes
          </button>
        }
      >
        <button onClick={() => { setConfigPageOpened(true) }}>
          Config File
        </button>
      </Header>

      <Popup
        className="error_popup"
        open={activeErrorPopup}
        modal={true}
        closeOnEscape={true}
        position="top center"
        closeOnDocumentClick
        onClose={() => setActiveErrorPopup(false)}>
        <Error errorText={errorText.current} />
      </Popup>

      <Popup
        className="config_page_popup"
        open={configPageOpened}
        onClose={() => setConfigPageOpened(false)}
        modal={true}
        closeOnEscape={false}
        closeOnDocumentClick={false}
        position="center center"
      >
        <ConfigUiPage
          initialText={buildFixChecksYaml(checkOptionOverrides)}
          onLoadConfig={(text) => {
            try {
              setCheckOptionOverrides(loadReadabilityConfigFromString(text))
              setConfigPageOpened(false)
            } catch (err) {
              errorText.current = err.message
              setActiveErrorPopup(true)
            }
          }}
          onClose={() => setConfigPageOpened(false)}
          darkTheme={darkTheme}
        />
      </Popup>

      <div className="pane_container">
        <Resizable
          className="left_side"
          defaultSize={{ width: "45%" }}
          // Wide enough for an option name + its 200px dropdown to sit side by
          // side without overlapping; the code side gets everything past that.
          minWidth={440}
          enable={{
            top: false,
            right: true,
            bottom: false,
            left: false,
            topRight: false,
            bottomRight: false,
            bottomLeft: false,
            topLeft: false,
          }}
        >
          {/* Scrolling lives on this inner div, not the Resizable itself -
              otherwise the drag handle (a child of the Resizable) is clipped
              by the scrollbar and scrolls away with the content. */}
          <div className={styles.checks_panel}>
            <div className={styles.panel_header}>
              <h2 className={styles.panel_title}>Identifier Naming</h2>
              <p className={styles.panel_description}>
                Case, prefix, suffix, ignored-name regex and Hungarian prefix for every identifier
                kind this check documents. See{" "}
                <a href={NAMING_DOCS_URL} target="_blank" rel="noopener noreferrer">
                  the full option reference
                </a>{" "}
                for the per-type Hungarian notation options, which don't fit this per-kind layout.
              </p>
              <div className={styles.search_input_wrapper}>
                <input
                  type="text"
                  className={styles.search_input}
                  placeholder="Search kinds (e.g. member, template, macro)..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                {search ? (
                  <button
                    type="button"
                    className={styles.search_clear_button}
                    aria-label="Clear search"
                    onClick={() => setSearch("")}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            </div>
            <div className={styles.naming_groups}>
              {visibleGeneralOptions.length > 0 ? (
                <div className={styles.naming_group}>
                  <h3 className={styles.naming_group_title}>General</h3>
                  <div className={styles.naming_kind}>
                    <div className={checkItemStyles.options_container}>
                      {visibleGeneralOptions.map((opt) => {
                        const optionInfo = namingOptionsByName[opt.name]
                        const key = `${NAMING_CHECK}.${opt.name}`
                        return (
                          <div className={checkItemStyles.option_row} key={key}>
                            <span className={checkItemStyles.option_name} title={optionInfo.docstring.replace(/<[^>]+>/g, "")}>
                              {opt.label}
                            </span>
                            <CheckOptionInput
                              optionInfo={optionInfo}
                              currentValue={checkOptionOverrides[key]}
                              onChange={(value) => setOption(key, value)}
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              ) : null}
              {NAMING_GROUP_ORDER.filter((group) => visibleKindsByGroup[group]?.length).map((group) => (
                <div className={styles.naming_group} key={group}>
                  <h3 className={styles.naming_group_title}>{group}</h3>
                  {visibleKindsByGroup[group].map((kind) => (
                    <div className={styles.naming_kind} key={kind.name}>
                      <div className={styles.naming_kind_title}>{kind.label}</div>
                      <div className={checkItemStyles.options_container}>
                        {kind.visibleSubs.map((sub) => {
                          const optionInfo = namingOptionsByName[`${kind.name}${sub}`]
                          const key = `${NAMING_CHECK}.${kind.name}${sub}`
                          return (
                            <div className={checkItemStyles.option_row} key={key}>
                              <span className={checkItemStyles.option_name} title={optionInfo.docstring.replace(/<[^>]+>/g, "")}>
                                {sub}
                              </span>
                              <CheckOptionInput
                                optionInfo={optionInfo}
                                currentValue={checkOptionOverrides[key]}
                                onChange={(value) => setOption(key, value)}
                              />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </Resizable>
        <section className="right_side">
          <ReadabilityEditor
            originalCode={originalCode}
            code={code}
            onCodeChange={setCode}
            diffMode={diffMode}
            onToggleDiffMode={() => setDiffMode(!diffMode)}
            onResetSample={() => setCode(originalCode)}
            darkTheme={darkTheme}
            loadingIcon={<LoadingIcon />}
          />
        </section>
      </div>
    </div>
  )
}

export default ReadabilityPage;
