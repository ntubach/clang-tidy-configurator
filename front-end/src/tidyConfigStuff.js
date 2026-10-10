import yaml from "yaml"

export class ValidationError extends Error { }

// Checks enabled state is derived from two layers:
//  - moduleState[module] = "all" | "none", the bulk choice for a whole module
//  - checkOverrides[checkName] = true | false, an explicit exception that
//    diverges from the module's bulk choice for one specific check
// This mirrors how real .clang-tidy files are written by hand, e.g.
// "-*,bugprone-*,-bugprone-easily-swappable-parameters".

export function isCheckEnabled(checkName, module, moduleState, checkOverrides) {
  if (Object.prototype.hasOwnProperty.call(checkOverrides, checkName))
    return checkOverrides[checkName]
  return moduleState[module] === "all"
}

export function buildChecksString(config, version, moduleState, checkOverrides) {
  const tokens = ["-*"]
  config[version].modules.forEach((module) => {
    if (moduleState[module] === "all")
      tokens.push(`${module}-*`)
  })
  Object.entries(checkOverrides).forEach(([checkName, enabled]) => {
    tokens.push(enabled ? checkName : `-${checkName}`)
  })
  return tokens.join(",")
}

export function buildTidyConfigYaml(options, config) {
  const checksString = buildChecksString(config, options.selectedVersion, options.moduleState, options.checkOverrides)
  const contents = {
    Checks: checksString,
  }
  if (options.warningsAsErrors)
    contents.WarningsAsErrors = options.warningsAsErrors
  if (options.headerFilterRegex)
    contents.HeaderFilterRegex = options.headerFilterRegex
  if (Object.keys(options.checkOptionOverrides).length > 0)
    contents.CheckOptions = { ...options.checkOptionOverrides }

  const doc = new yaml.Document()
  doc.contents = contents
  return doc.toString()
}

export function emptyModuleState(config, version) {
  const moduleState = {}
  config[version].modules.forEach((m) => { moduleState[m] = "none" })
  return moduleState
}

export function parseChecksString(checksString, config, version) {
  const moduleState = emptyModuleState(config, version)
  const checkOverrides = {}
  const knownChecks = new Set(config[version].checks.map((c) => c.name))
  const checksByModule = {}
  config[version].checks.forEach((c) => {
    (checksByModule[c.module] ||= []).push(c.name)
  })

  const tokens = (checksString || "").split(",").map((t) => t.trim()).filter(Boolean)
  for (const token of tokens) {
    const negate = token.startsWith("-")
    const pattern = negate ? token.slice(1) : token

    if (pattern === "*") {
      config[version].modules.forEach((m) => { moduleState[m] = negate ? "none" : "all" })
      Object.keys(checkOverrides).forEach((k) => delete checkOverrides[k])
      continue
    }

    if (pattern.endsWith("-*")) {
      const module = pattern.slice(0, -2)
      if (config[version].modules.includes(module)) {
        moduleState[module] = negate ? "none" : "all"
        ;(checksByModule[module] || []).forEach((checkName) => delete checkOverrides[checkName])
        continue
      }
    }

    if (knownChecks.has(pattern)) {
      checkOverrides[pattern] = !negate
    }
    // Other glob shapes (partial wildcards like "bugprone-use-*") aren't
    // reconstructed into module/check state - this configurator never
    // writes those itself, so round-tripping its own downloaded files
    // always works; hand-written exotic globs are best-effort ignored.
  }

  return { moduleState, checkOverrides }
}

export function loadTidyConfigFromString(configStr, config, selectedVersion, onLoaded) {
  const parsed = yaml.parse(configStr)
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    throw new ValidationError("Looks like an invalid .clang-tidy file")

  const { moduleState, checkOverrides } = parseChecksString(parsed.Checks, config, selectedVersion)
  const checkOptionOverrides = {}
  Object.entries(parsed.CheckOptions || {}).forEach(([key, value]) => {
    checkOptionOverrides[key] = String(value)
  })

  onLoaded({
    selectedVersion,
    moduleState,
    checkOverrides,
    checkOptionOverrides,
    warningsAsErrors: parsed.WarningsAsErrors || "",
    headerFilterRegex: parsed.HeaderFilterRegex || "",
    extraArgs: "-std=c++20",
  })
}

export function loadTidyConfigFromFile(file, config, selectedVersion, onError, onLoaded) {
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      loadTidyConfigFromString(e.target.result, config, selectedVersion, onLoaded)
    } catch (err) {
      onError(err.message)
    }
  }
  reader.readAsText(file)
}
