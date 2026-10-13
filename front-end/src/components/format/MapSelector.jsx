import React from "react";
import styles from "../Selector.module.css";
import SingleSelector from "./SingleSelector";

// Options with nested flags (BraceWrapping, SpaceBeforeParensOptions, ...).
// Ported from clang-format-configurator-v2.
//
// Some of these also accept a plain scalar meaning "every flag at once"
// (e.g. BreakBinaryOperations: OnePerLine on clang-format 23); a loaded
// scalar is shown as unset here and replaced by the first edit.
const MapSelector = ({ selectorInfo, onChange, currentStyle, currentOptionValue: rawValue }) => {
  const currentOptionValue = rawValue !== null && typeof rawValue === "object" ? rawValue : undefined
  return (
    <span className={styles.nested_container}>
      {selectorInfo.map((value) => (
        <div key={value.title}>
          <span className={styles.title_nested}>{value.title}</span>
          <SingleSelector
            selectorInfo={value}
            onChange={(changedValue) => {
              const newOptionValue = { ...(currentOptionValue || {}) }
              if (changedValue === undefined) delete newOptionValue[value.title]
              else newOptionValue[value.title] = changedValue
              onChange(Object.keys(newOptionValue).length > 0 ? newOptionValue : undefined)
            }}
            defaultValue={value.defaults[currentStyle]}
            currentOptionValue={currentOptionValue === undefined ? undefined : currentOptionValue[value.title]}
          />
        </div>
      ))}
    </span>
  )
}

export default MapSelector;
