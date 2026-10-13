import React from "react";
import styles from "../Selector.module.css";

// Firefox ignores CSS color/background/font-style on <option>, so the
// style's default value is marked with an asterisk there instead.
const isFirefox = /firefox|fxios/i.test(navigator.userAgent)
const markDefault = (label, isDefault) => (isDefault && isFirefox ? label + " *" : label)

// Simple values: int/unsigned, bool, string, enum. Ported from
// clang-format-configurator-v2 (hover popups swapped for native titles, so
// this page doesn't need reactjs-popup's global stylesheet).
const SingleSelector = ({ selectorInfo, onChange, defaultValue, currentOptionValue, notDisableable }) => {
  const defValue = defaultValue === undefined ? undefined : defaultValue.value

  switch (selectorInfo.argument_type) {
    case "unsigned":
    case "int8_t":
    case "int":
      return (
        <div>
          <input
            type="number"
            className={styles.selector}
            placeholder={defValue === undefined ? "" : defValue}
            onChange={(event) => onChange(event.target.value === "" ? undefined : parseInt(event.target.value))}
            value={currentOptionValue === undefined ? "" : currentOptionValue}
          />
        </div>
      );
    case "bool":
      return (
        <div>
          <select
            value={currentOptionValue === undefined ? "" : String(currentOptionValue)}
            className={styles.selector}
            onChange={(event) => {
              const val = event.target.value
              onChange(val === "true" ? true : val === "false" ? false : undefined)
            }}>
            <option value=""></option>
            <option value="true" className={true === defValue ? styles.dropdown_option_default : null}>
              {markDefault("true", true === defValue)}
            </option>
            <option value="false" className={false === defValue ? styles.dropdown_option_default : null}>
              {markDefault("false", false === defValue)}
            </option>
          </select>
        </div>
      );
    case "std::string":
      if (notDisableable)
        return (
          <div>
            <input
              type="text"
              className={styles.selector}
              placeholder={defValue}
              value={currentOptionValue || ""}
              onChange={(event) => onChange(event.target.value)} />
          </div>
        )
      return (
        <div>
          <input
            type="text"
            className={[styles.selector, styles.selector_disableable].join(' ')}
            placeholder={currentOptionValue === undefined ? "Option unset" : defValue}
            disabled={currentOptionValue === undefined}
            value={currentOptionValue || ""}
            onChange={(event) => onChange(event.target.value)} />
          <button
            onClick={() => onChange(currentOptionValue === undefined ? "" : undefined)}
            className={styles.button_activeness}
            title={currentOptionValue === undefined ? "Activate option" : "Set value to undefined"}>
            <img
              alt={currentOptionValue === undefined ? "option inactive" : "option active"}
              src={currentOptionValue === undefined ? "./inactiveFieldIcon.svg" : "./activeFieldIcon.svg"}
            ></img>
          </button>
        </div>
      );
    default:
      return (
        <div>
          <select
            value={currentOptionValue || ""}
            className={styles.selector}
            onChange={(event) => onChange(event.target.value === "" ? undefined : event.target.value)}>
            {selectorInfo.arg_val_enum.map((value) => (
              <option
                key={value}
                value={value}
                className={value === defValue ? styles.dropdown_option_default : null}>
                {markDefault(value, value === defValue)}
              </option>
            ))}
          </select>
        </div>
      );
  }
};

export default SingleSelector;
