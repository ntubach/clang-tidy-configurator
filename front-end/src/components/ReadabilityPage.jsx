import React from "react";
import yaml from "yaml";
import Header from "./Header";
import headerStyles from "./Header.module.css";
import ReadabilityEditor from "./ReadabilityEditor";
import CheckItem from "./CheckItem";
import LoadingIcon from "./LoadingIcon";
import Error from "./Error";
import Popup from 'reactjs-popup';
import { debounce } from "lodash";
import { Fix } from "../API";
import styles from "./ReadabilityPage.module.css";
import sampleCpp from '../code_snippets/sample.cpp'

function buildFixChecksYaml(checkOverrides) {
  const enabled = Object.entries(checkOverrides).filter(([, v]) => v).map(([name]) => name)
  const doc = new yaml.Document()
  doc.contents = { Checks: ["-*", ...enabled].join(",") }
  return doc.toString()
}

// A second, lighter-weight page: pick from clang-tidy's readability checks
// that have a known-safe fix, and see the sample rewritten in place (or
// diffed against where it started), instead of the main page's diagnostics
// list. Deliberately separate from ChecksList/MainApp's state model - this
// one check-selection concern doesn't need module bulk-toggling or
// per-check CheckOptions.
const ReadabilityPage = ({ config, selectedVersion, onVersionChange, darkTheme, onDarkThemeChange, onNavigate }) => {
  const [originalCode, setOriginalCode] = React.useState("")
  const [code, setCode] = React.useState("")
  const [checkOverrides, setCheckOverrides] = React.useState({})
  const [autoApply, setAutoApply] = React.useState(true)
  const [diffMode, setDiffMode] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const [activeErrorPopup, setActiveErrorPopup] = React.useState(false)
  const errorText = React.useRef("")
  const lastAppliedInputRef = React.useRef(null)

  React.useEffect(() => {
    fetch(sampleCpp)
      .then((response) => response.text())
      .then((text) => { setOriginalCode(text); setCode(text) })
  }, [])

  // Check names don't necessarily match across versions - drop selections
  // that no longer exist when switching, same spirit as the main page's
  // options reset on version change.
  React.useEffect(() => { setCheckOverrides({}) }, [selectedVersion])

  const availableChecks = React.useMemo(
    () => config[selectedVersion].checks.filter((c) => c.module === "readability" && c.offersFixes),
    [config, selectedVersion]
  )

  function applyFixes(currentCode, overrides) {
    if (lastAppliedInputRef.current === currentCode) return
    const tidyYaml = buildFixChecksYaml(overrides)
    Fix(currentCode, tidyYaml, "-std=c++20", selectedVersion, "c_cpp", config.FixApiUrl,
      (fixedCode) => {
        lastAppliedInputRef.current = fixedCode
        setCode(fixedCode)
        window.loadingIcon.setLoadingState("success")
      },
      (errortext) => {
        window.loadingIcon.setLoadingState("error")
        errorText.current = errortext
        setActiveErrorPopup(true)
      })
  }

  const applyFixesDebounced = React.useRef(debounce(applyFixes, 1000, { leading: false, trailing: true })).current
  React.useEffect(() => {
    if (!autoApply || !code) return
    window.loadingIcon.setLoadingState("loading")
    applyFixesDebounced(code, checkOverrides)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, checkOverrides, autoApply])

  const searchLower = search.trim().toLowerCase()
  const filteredChecks = searchLower
    ? availableChecks.filter((c) => c.name.toLowerCase().includes(searchLower))
    : availableChecks
  const enabledCount = availableChecks.filter((c) => checkOverrides[c.name]).length

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
      >
        <input
          className={headerStyles.checkbox}
          type="checkbox"
          id="autoapply" checked={autoApply}
          onChange={(event) => setAutoApply(event.currentTarget.checked)}
        />
        <label className={headerStyles.label} htmlFor="autoapply">Auto-apply on changes</label>
        <button onClick={() => { window.loadingIcon.setLoadingState("loading"); applyFixes(code, checkOverrides) }}>
          Apply Fixes
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

      <div className="pane_container">
        <div className={`left_side ${styles.checks_panel}`}>
          <div className={styles.search_container}>
            <h2 className={styles.panel_title}>Readability fixes ({enabledCount}/{availableChecks.length} enabled)</h2>
            <div className={styles.search_input_wrapper}>
              <input
                type="text"
                className={styles.search_input}
                placeholder={`Search ${availableChecks.length} checks...`}
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
          <div className={styles.checks_list}>
            {filteredChecks.map((checkInfo) => (
              <CheckItem
                key={checkInfo.name}
                checkInfo={{ ...checkInfo, options: [] }}
                enabled={!!checkOverrides[checkInfo.name]}
                checkOptionOverrides={{}}
                onToggle={(checked) => setCheckOverrides((prev) => ({ ...prev, [checkInfo.name]: checked }))}
                onOptionChange={() => { }}
              />
            ))}
          </div>
        </div>
        <section className="right_side">
          <ReadabilityEditor
            originalCode={originalCode}
            code={code}
            onCodeChange={setCode}
            diffMode={diffMode}
            onToggleDiffMode={() => setDiffMode(!diffMode)}
            onResetSample={() => { lastAppliedInputRef.current = null; setCode(originalCode) }}
            darkTheme={darkTheme}
            loadingIcon={<LoadingIcon />}
          />
        </section>
      </div>
    </div>
  )
}

export default ReadabilityPage;
