import React from "react";
import AceEditor from "react-ace";
import { diff as DiffEditor } from "react-ace";
import styles from './Editor.module.css'
import "./ace.css"
import "ace-builds/src-noconflict/mode-c_cpp";
import "ace-builds/src-noconflict/snippets/c_cpp";
import "ace-builds/src-noconflict/theme-textmate";
import "ace-builds/src-noconflict/theme-clouds_midnight";
import "ace-builds/src-noconflict/ext-language_tools";
import "ace-builds/src-min-noconflict/ext-searchbox";
import { debounce } from "lodash";

// Shows the live/editable code, or - toggled via diffMode - a diff of the
// pristine seeded sample against the current (possibly already-fixed) code.
// Deliberately not a reuse/extension of Editor.jsx: that component is built
// around diagnostics markers/annotations on unchanged text, this one is
// built around a fixed-code/diff toggle over text that gets rewritten in
// place, and conflating the two risks regressing the main page.
const ReadabilityEditor = ({ originalCode, code, onCodeChange, diffMode, onToggleDiffMode, onResetSample, darkTheme, loadingIcon }) => {
  const onCodeChangeDebounced = React.useRef(debounce(onCodeChange, 1000, { leading: false, trailing: true })).current

  const editor = diffMode ? (
    <DiffEditor
      name="Readability diff editor"
      height="100%"
      width="100%"
      editorProps={{ $blockScrolling: true }}
      mode="c_cpp"
      theme={darkTheme ? "clouds_midnight" : "textmate"}
      orientation="beside"
      fontSize={14}
      debounceChangePeriod={0}
      showPrintMargin={false}
      value={[originalCode, code]}
      onChange={([, rightText]) => onCodeChangeDebounced(rightText)}
      setOptions={{
        showGutter: true,
      }}
    />
  ) : (
    <AceEditor
      name="Readability editor"
      height="100%"
      width="100%"
      editorProps={{ $blockScrolling: true }}
      value={code}
      mode="c_cpp"
      theme={darkTheme ? "clouds_midnight" : "textmate"}
      fontSize={14}
      debounceChangePeriod={0}
      showPrintMargin={false}
      showGutter={true}
      onChange={(text) => onCodeChangeDebounced(text)}
      setOptions={{
        enableBasicAutocompletion: true,
        enableLiveAutocompletion: true,
        enableSnippets: true,
      }}
    />
  )

  return (
    <span className={styles.editor_wrapper}>
      <span className={styles.tab_container}>
        <span>
          {loadingIcon}
          <button className={styles.tab_button} onClick={onResetSample}>
            Reset sample
          </button>
          {diffMode ? <span className={styles.diffmode_guide}>Diff: original sample (left) vs current (right)</span> : null}
        </span>
        <span>
          <button className={styles.tab_button} onClick={onToggleDiffMode}>
            {diffMode ? "Fixed code" : "Diff"}
          </button>
        </span>
      </span>
      <span className={styles.editor_container}>
        {editor}
      </span>
    </span>
  )
};

export default ReadabilityEditor
