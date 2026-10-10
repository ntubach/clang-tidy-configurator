import React from "react";
import styles from "./ChecksList.module.css";
import CheckItem from "./CheckItem";
import { isCheckEnabled } from "../tidyConfigStuff";

const ModuleCheckbox = ({ state, onChange }) => {
  const ref = React.useRef(null)
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "mixed"
  }, [state])
  return (
    <input
      ref={ref}
      type="checkbox"
      className={styles.module_checkbox}
      checked={state === "all"}
      onChange={(event) => onChange(event.target.checked)}
    />
  )
}

const ChecksList = ({ config, selectedVersion, moduleState, checkOverrides, checkOptionOverrides, onModuleToggle, onCheckToggle, onOptionChange }) => {
  const [search, setSearch] = React.useState("")
  const [collapsedModules, setCollapsedModules] = React.useState({})

  const checksByModule = React.useMemo(() => {
    const byModule = {}
    config[selectedVersion].checks.forEach((check) => {
      (byModule[check.module] ||= []).push(check)
    })
    return byModule
  }, [config, selectedVersion])

  const searchLower = search.trim().toLowerCase()

  return (
    <div className="ChecksList">
      <div className={styles.search_container}>
        <input
          type="text"
          className={styles.search_input}
          placeholder={`Search ${config[selectedVersion].checks.length} checks...`}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {config[selectedVersion].modules.map((module) => {
        const moduleChecks = checksByModule[module] || []
        const filteredChecks = searchLower
          ? moduleChecks.filter((c) => c.name.toLowerCase().includes(searchLower))
          : moduleChecks

        if (searchLower && filteredChecks.length === 0) return null

        const enabledCount = moduleChecks.filter((c) => isCheckEnabled(c.name, c.module, moduleState, checkOverrides)).length
        const headerState = enabledCount === 0 ? "none" : enabledCount === moduleChecks.length ? "all" : "mixed"
        const collapsed = collapsedModules[module] ?? true

        return (
          <div className={styles.module_section} key={module}>
            <div
              className={styles.module_header}
              onClick={() => setCollapsedModules({ ...collapsedModules, [module]: !collapsed })}
            >
              <span onClick={(e) => e.stopPropagation()}>
                <ModuleCheckbox
                  state={headerState}
                  onChange={(checked) => onModuleToggle(module, checked)}
                />
              </span>
              <span className={styles.module_name}>{module}</span>
              <span className={styles.module_count}>{enabledCount}/{moduleChecks.length}</span>
            </div>
            {(!collapsed || searchLower) ? (
              <div className={styles.module_body}>
                {filteredChecks.map((checkInfo) => (
                  <CheckItem
                    key={checkInfo.name}
                    checkInfo={checkInfo}
                    enabled={isCheckEnabled(checkInfo.name, checkInfo.module, moduleState, checkOverrides)}
                    checkOptionOverrides={checkOptionOverrides}
                    onToggle={(checked) => onCheckToggle(checkInfo.name, checked)}
                    onOptionChange={onOptionChange}
                  />
                ))}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export default ChecksList;
