export function Analyze(code, tidyConfigYaml, extraArgs, version, language, analyzeApiUrl, onResult, onError) {
  let filext = "";
  switch (language) {
    case "c_cpp":
      filext = ".cpp"
      break;
    case "c":
      filext = ".c"
      break;
  }
  const body = { code: code, tidyConfig: tidyConfigYaml, extraArgs: extraArgs }
  fetch(analyzeApiUrl + new URLSearchParams({
    version: version,
    filext: filext
  }), {
    body: JSON.stringify(body),
    mode: 'cors',
    method: 'POST'
  })
    .then(response => {
      if (response.ok)
        response.json().then((data) => onResult(data.diagnostics || []))
      else
        response.text().then(onError)
    }).catch((errorObject) => { onError(errorObject.toString()) })
}
