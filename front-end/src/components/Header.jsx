import React from 'react';
import styles from './Header.module.css'



const Header = ({ autoAnalyze, onAutoAnalyzeChange, darkTheme, onDarkThemeChange, onUpdate, onConfigFile, versions, selectedVersion, onVersionChange }) => {
  return (
    <header className={styles.header}>
      <h1 className={styles.title_text}>clang-tidy configurator v2</h1>
      <span>
        <label className={styles.label} htmlFor="version-select">clang-tidy</label>
        <select
          id="version-select"
          className={styles.button}
          value={selectedVersion}
          onChange={(event) => onVersionChange(event.target.value)}
        >
          {versions.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        <input
          className={styles.checkbox} type="checkbox"
          id="autoupdate" defaultChecked={autoAnalyze}
          onChange={(event) => onAutoAnalyzeChange(event.currentTarget.checked)}
        />
        <label className={styles.label} htmlFor="autoupdate">Auto-analyze on changes</label>
        <button className={styles.button} onClick={onUpdate}>
          Analyze
        </button>
        <button className={styles.button} onClick={onConfigFile}>
          Config File
        </button>
        <button className={styles.button} id={styles.theme_button} onClick={onDarkThemeChange}>
          {darkTheme ? "White Theme" : "Dark Theme"}
        </button>
      </span>
    </header>
  )
}

export default Header;
