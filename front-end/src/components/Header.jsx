import React from 'react';
import styles from './Header.module.css'



const Header = ({ darkTheme, onDarkThemeChange, versions, selectedVersion, onVersionChange, navLabel, onNavClick, children }) => {
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
        {children}
        <button className={styles.button} onClick={onNavClick}>
          {navLabel}
        </button>
        <button className={styles.button} id={styles.theme_button} onClick={onDarkThemeChange}>
          {darkTheme ? "White Theme" : "Dark Theme"}
        </button>
      </span>
    </header>
  )
}

export default Header;
