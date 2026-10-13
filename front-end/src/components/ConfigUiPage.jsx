import React from "react";
import AceEditor from "react-ace";
import { saveAs } from 'file-saver';
import styles from "./ConfigUiPage.module.css"
import "./ace.css"
import "ace-builds/src-noconflict/mode-yaml";
import "ace-builds/src-noconflict/snippets/yaml";
import "ace-builds/src-noconflict/theme-textmate";
import "ace-builds/src-noconflict/theme-clouds_midnight";
import "ace-builds/src-noconflict/ext-language_tools";
import "ace-builds/src-min-noconflict/ext-searchbox";


// A plain YAML editor shell for a .clang-tidy (or, via fileName,
// .clang-format) file - upload/download/edit/load. What the text means (how
// it's built from and parsed back into a page's own state) is up to the
// caller via initialText/onLoadConfig, so the same shell works for the main
// page's full module/check matrix and both of the Readability Preview's tabs.
const ConfigUiPage = ({ initialText, onLoadConfig, onClose, darkTheme, fileName = ".clang-tidy" }) => {
    const [optionsText, setOptionsText] = React.useState(initialText)

    const downloadConfigFile = React.useCallback(() => {
        const blob = new Blob([optionsText], { type: 'text/plain;charset=utf-8' })
        saveAs(blob, fileName)
    }, [optionsText, fileName])

    const onUploadFileToStr = React.useCallback(() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.onchange = (e) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                setOptionsText(e.target.result)
            }
            reader.readAsText(e.target.files[0])
        }
        input.click()
    }, [setOptionsText])

    return (
        <div className={styles.config_ui_page}>
            <header className={styles.top_panel}>
                <h2 className={styles.page_title_text}>
                    Edit your {fileName} config file in place or use Upload and Download buttons to open File Explorer
                </h2>
            </header>
            <div className={styles.middle_panel}>
                <div className={styles.editor_container}>
                    <AceEditor
                        value={optionsText}
                        onChange={setOptionsText}
                        width={"100%"}
                        height={"100%"}
                        mode={"yaml"}
                        fontSize={14}
                        showPrintMargin={false}
                        theme={darkTheme ? "clouds_midnight" : "textmate"}
                        setOptions={{
                            useWorker: false,
                            enableBasicAutocompletion: true,
                            enableLiveAutocompletion: true,
                            enableSnippets: true,
                        }}
                    />
                </div>
            </div>
            <footer className={styles.bottom_panel}>
                <span className={styles.bottom_file_buttons}>
                    <button onClick={onUploadFileToStr}>
                        Upload file
                    </button>
                    <button onClick={downloadConfigFile}>
                        Download file
                    </button>
                </span>
                <span className={styles.bottom_control_buttons}>
                    <button onClick={onClose}>
                        Close
                    </button>
                    <button onClick={() => { onLoadConfig(optionsText) }}>
                        Load Config
                    </button>
                </span>
            </footer>
        </div>
    )
};

export default ConfigUiPage
