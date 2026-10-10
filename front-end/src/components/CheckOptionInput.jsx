import React from "react";
import styles from "./Selector.module.css";

// Renders one CheckOption input (bool/enum/int/string). currentValue
// undefined means "unset" - the option is left out of CheckOptions and
// clang-tidy falls back to its own compiled-in behavior.
const CheckOptionInput = ({ optionInfo, currentValue, onChange }) => {
  const placeholder = optionInfo.defaultValue || "unset upstream"

  switch (optionInfo.type) {
    case "bool":
      return (
        <select
          className={styles.selector}
          value={currentValue === undefined ? "" : currentValue}
          onChange={(event) => onChange(event.target.value === "" ? undefined : event.target.value)}
        >
          <option value="">{placeholder ? `(default: ${placeholder})` : ""}</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      )
    case "enum":
      return (
        <select
          className={styles.selector}
          value={currentValue === undefined ? "" : currentValue}
          onChange={(event) => onChange(event.target.value === "" ? undefined : event.target.value)}
        >
          <option value="">{placeholder ? `(default: ${placeholder})` : "(unset)"}</option>
          {(optionInfo.enum || []).map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
      )
    case "int":
      return (
        <input
          type="number"
          className={styles.selector}
          placeholder={placeholder}
          value={currentValue === undefined ? "" : currentValue}
          onChange={(event) => onChange(event.target.value === "" ? undefined : event.target.value)}
        />
      )
    default:
      return (
        <input
          type="text"
          className={styles.selector}
          placeholder={placeholder}
          value={currentValue === undefined ? "" : currentValue}
          onChange={(event) => onChange(event.target.value === "" ? undefined : event.target.value)}
        />
      )
  }
};

export default CheckOptionInput;
