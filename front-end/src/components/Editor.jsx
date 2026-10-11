import React from "react";
import AceEditor from "react-ace";
import styles from './Editor.module.css'
import sampleCpp from '../code_snippets/sample.cpp'
import "./ace.css"
import "ace-builds/src-noconflict/mode-c_cpp";
import "ace-builds/src-noconflict/snippets/c_cpp";
import "ace-builds/src-noconflict/theme-textmate";
import "ace-builds/src-noconflict/theme-clouds_midnight";
import "ace-builds/src-noconflict/ext-language_tools";
import "ace-builds/src-min-noconflict/ext-searchbox";
import { debounce } from "lodash";

const severityToMarkerClass = {
  error: styles.marker_error,
  warning: styles.marker_warning,
  note: styles.marker_note,
}

const Editor = ({ editorText, onTextChange, diagnostics, darkTheme, loadingIcon, gotoRef }) => {
  const sampleCppString = React.useRef("")
  const editorRef = React.useRef(null)
  const markerIdsRef = React.useRef([])

  const onTextChangeDebounced = React.useRef(debounce(onTextChange, 1000, { leading: false, trailing: true })).current

  React.useEffect(() => {
    fetch(sampleCpp)
      .then((response) => response.text())
      .then((textContent) => {
        sampleCppString.current = textContent;
        onTextChange(sampleCppString.current)
      })
  }, [])

  React.useEffect(() => {
    if (gotoRef) {
      gotoRef.current = (line, column) => {
        if (editorRef.current) {
          editorRef.current.gotoLine(line, Math.max(0, column - 1), true)
          editorRef.current.focus()
        }
      }
    }
  }, [gotoRef])

  React.useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const session = editor.getSession()

    markerIdsRef.current.forEach((id) => session.removeMarker(id))
    markerIdsRef.current = []

    const annotations = (diagnostics || []).map((d) => ({
      row: Math.max(0, d.line - 1),
      column: d.column - 1,
      text: `[${d.check}] ${d.message}`,
      type: d.severity === "error" ? "error" : d.severity === "note" ? "info" : "warning",
    }))
    session.setAnnotations(annotations)

    const Range = window.ace.require("ace/range").Range
    const wordRe = /\w/
    ;(diagnostics || []).forEach((d) => {
      const row = Math.max(0, d.line - 1)
      const col = Math.max(0, d.column - 1)
      // clang-tidy only gives a start column, not a span, so extend the
      // marker to cover the identifier/token at that position (falling
      // back to a one-character marker for punctuation) for a readable
      // squiggle instead of a near-invisible sliver.
      const lineText = session.getLine(row) || ""
      let end = col
      if (wordRe.test(lineText[col] || "")) {
        while (end < lineText.length && wordRe.test(lineText[end])) end++
      } else {
        end = col + 1
      }
      const range = new Range(row, col, row, end)
      const markerClass = severityToMarkerClass[d.severity] || styles.marker_warning
      const id = session.addMarker(range, markerClass, "text")
      markerIdsRef.current.push(id)
    })
  }, [diagnostics])

  return (
    <span className={styles.editor_wrapper}>
      <span className={styles.tab_container}>
        <span>
          {loadingIcon}
          <button
            className={styles.tab_button}
            onClick={() => onTextChange(sampleCppString.current)}
          >
            Reset sample
          </button>
        </span>
      </span>
      <span className={styles.editor_container}>
        <AceEditor
          editorProps={{ $blockScrolling: true }}
          onLoad={(editor) => { editorRef.current = editor }}
          name="Ace editor"
          height="100%"
          width="100%"
          value={editorText}
          mode="c_cpp"
          theme={darkTheme ? "clouds_midnight" : "textmate"}
          fontSize={14}
          debounceChangePeriod={0}
          showPrintMargin={false}
          showGutter={true}
          onChange={(text) => onTextChangeDebounced(text)}
          setOptions={{
            enableBasicAutocompletion: true,
            enableLiveAutocompletion: true,
            enableSnippets: true,
          }}
        />
      </span>
    </span>
  )
};

export default Editor
