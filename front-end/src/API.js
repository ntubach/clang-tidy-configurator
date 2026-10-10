function filextFor(language) {
  switch (language) {
    case "c_cpp":
      return ".cpp"
    case "c":
      return ".c"
    default:
      return ""
  }
}

function post(apiUrl, version, filext, code, tidyConfigYaml, extraArgs, onResult, onError) {
  const body = { code: code, tidyConfig: tidyConfigYaml, extraArgs: extraArgs }
  fetch(apiUrl + new URLSearchParams({
    version: version,
    filext: filext
  }), {
    body: JSON.stringify(body),
    mode: 'cors',
    method: 'POST'
  })
    .then(response => {
      if (response.ok)
        response.json().then(onResult)
      else
        response.text().then(onError)
    }).catch((errorObject) => { onError(errorObject.toString()) })
}

export function Analyze(code, tidyConfigYaml, extraArgs, version, language, analyzeApiUrl, onResult, onError) {
  post(analyzeApiUrl, version, filextFor(language), code, tidyConfigYaml, extraArgs,
    (data) => onResult(data.diagnostics || []), onError)
}

export function Fix(code, tidyConfigYaml, extraArgs, version, language, fixApiUrl, onResult, onError) {
  post(fixApiUrl, version, filextFor(language), code, tidyConfigYaml, extraArgs,
    (data) => onResult(data.fixedCode || "", data.diagnostics || []), onError)
}
