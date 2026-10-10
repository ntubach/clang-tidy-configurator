import Header from "./components/Header";
import ChecksList from "./components/ChecksList";
import { Resizable } from "re-resizable";
import Editor from "./components/Editor";
import DiagnosticsList from "./components/DiagnosticsList";
import Error from "./components/Error";
import LoadingIcon from "./components/LoadingIcon";
import { useEffect, useState, useRef } from "react";
import config from "./config.json";
import { buildTidyConfigYaml, emptyModuleState } from "./tidyConfigStuff"
import { Analyze } from "./API"
import { useCookies } from "react-cookie";
import Popup from 'reactjs-popup';

import { debounce } from "lodash";
import ConfigUiPage from "./components/ConfigUiPage";


function initialOptions(selectedVersion) {
  return {
    selectedVersion,
    moduleState: emptyModuleState(config, selectedVersion),
    checkOverrides: {},
    checkOptionOverrides: {},
    warningsAsErrors: "",
    headerFilterRegex: "",
    extraArgs: "-std=c++20",
  }
}

const App = () => {
  const [cookie, setCookie] = useCookies([])

  const [configPageOpened, setConfigPageOpened] = useState(false)

  const errorText = useRef("")
  const [activeErrorPopup, setActiveErrorPopup] = useState(false)
  const [darkThemeActive, setDarkThemeActive] = useState(cookie.theme === "dark" || cookie.theme === "light" ? cookie.theme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches)
  useEffect(() => { if (darkThemeActive) document.body.className = "dark"; else document.body.className = "" }, [darkThemeActive])

  const initialVersion = config.Versions.values.includes(cookie.version) ? cookie.version : config.Versions.values[0]
  const [options, setOptions] = useState(initialOptions(initialVersion));

  const [text, setText] = useState("");
  const [diagnostics, setDiagnostics] = useState([]);
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [currentLang] = useState("c_cpp")
  const gotoRef = useRef(null)

  function analyzeCode(opts, code) {
    const tidyYaml = buildTidyConfigYaml(opts, config)
    Analyze(code, tidyYaml, opts.extraArgs, opts.selectedVersion, currentLang,
      (newDiagnostics) => { setDiagnostics(newDiagnostics); window.loadingIcon.setLoadingState("success") },
      (errortext) => {
        window.loadingIcon.setLoadingState("error")
        errorText.current = errortext
        setActiveErrorPopup(true)
      })
  };

  useEffect(() => { if (autoAnalyze) analyzeCode(options, text) }, [text]);

  const analyzeCodeDebounced = useRef(debounce(analyzeCode, 1000, { leading: false, trailing: true })).current
  useEffect(() => {
    if (autoAnalyze) {
      window.loadingIcon.setLoadingState("loading");
      analyzeCodeDebounced(options, text)
    }
  }, [options]);

  const updateOptions = (updater) => setOptions((prev) => updater(prev))

  return (
    <div>
      <Header
        autoAnalyze={autoAnalyze}
        darkTheme={darkThemeActive}
        onDarkThemeChange={() => { const newDarkThemeStatus = !darkThemeActive; setCookie("theme", newDarkThemeStatus ? "dark" : "light", { path: "/" }); setDarkThemeActive(newDarkThemeStatus) }}
        onUpdate={() => { window.loadingIcon.setLoadingState("loading"); analyzeCode(options, text) }}
        onConfigFile={() => { setConfigPageOpened(true) }}
        onAutoAnalyzeChange={setAutoAnalyze}
        versions={config.Versions.values}
        selectedVersion={options.selectedVersion}
        onVersionChange={(newVersion) => {
          setCookie("version", newVersion, { path: "/" })
          setOptions(initialOptions(newVersion))
        }}
      />
      <Popup
        className="error_popup"
        open={activeErrorPopup}
        modal={true}
        closeOnEscape={true}
        position="top center"
        closeOnDocumentClick
        onClose={() => setActiveErrorPopup(false)}>
        <Error
          errorText={errorText.current}
        />
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
          onClose={() => setConfigPageOpened(false)}
          onLoaded={(newOptions) => {
            if (newOptions === undefined)
              return
            setOptions(newOptions)
            setConfigPageOpened(false)
          }}
          onError={(errorDescription) => {
            errorText.current = errorDescription
            setActiveErrorPopup(true)
          }}
          darkTheme={darkThemeActive}
          options={options}
        />
      </Popup>

      <div className="pane_container">
        <Resizable
          className="left_side"
          defaultSize={{ width: "45%" }}
          handleStyles={{ bottom: { backgroundColor: "#FF0000" } }}
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
          <div className="checksList_container">
            <ChecksList
              config={config}
              selectedVersion={options.selectedVersion}
              moduleState={options.moduleState}
              checkOverrides={options.checkOverrides}
              checkOptionOverrides={options.checkOptionOverrides}
              onModuleToggle={(module, checked) => updateOptions((prev) => {
                const moduleState = { ...prev.moduleState, [module]: checked ? "all" : "none" }
                const checkOverrides = { ...prev.checkOverrides }
                config[prev.selectedVersion].checks
                  .filter((c) => c.module === module)
                  .forEach((c) => delete checkOverrides[c.name])
                return { ...prev, moduleState, checkOverrides }
              })}
              onCheckToggle={(checkName, checked) => updateOptions((prev) => ({
                ...prev,
                checkOverrides: { ...prev.checkOverrides, [checkName]: checked }
              }))}
              onOptionChange={(key, value) => updateOptions((prev) => {
                const checkOptionOverrides = { ...prev.checkOptionOverrides }
                if (value === undefined) delete checkOptionOverrides[key]
                else checkOptionOverrides[key] = value
                return { ...prev, checkOptionOverrides }
              })}
            />
          </div>
        </Resizable>
        <section className="right_side">
          <Editor
            onTextChange={setText}
            editorText={text}
            diagnostics={diagnostics}
            darkTheme={darkThemeActive}
            loadingIcon={<LoadingIcon />}
            gotoRef={gotoRef}
          />
          <DiagnosticsList
            diagnostics={diagnostics}
            onJumpTo={(line, column) => gotoRef.current && gotoRef.current(line, column)}
          />
        </section>
      </div>
    </div>
  );
}


export default App;
