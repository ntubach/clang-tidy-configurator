import React from 'react';
import styles from './Header.module.css'



const Header = ({ autoAnalyze, onAutoAnalyzeChange, darkTheme, onDarkThemeChange, onUpdate, onConfigFile }) => {
  return (
    <header className={styles.header}>
      <h1 className={styles.title_text}>clang-tidy configurator v2</h1>
      <span>
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
