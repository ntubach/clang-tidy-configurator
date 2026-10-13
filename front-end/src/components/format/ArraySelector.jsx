import React from "react";
import { cloneDeep } from "lodash";
import styles from "../Selector.module.css";
import SingleSelector from "./SingleSelector";
import RawStringFormatsSelector from "./RawStringFormatsSelector"
import IncludeCategoriesSelector from "./IncludeCategoriesSelector";

const emptyElementFor = (argumentType) =>
  argumentType === "std::string" || argumentType === "std::vector<std::string>" ? "" : {}

// List options (IncludeCategories, RawStringFormats, plain string lists).
// Ported from clang-format-configurator-v2. Since this page's state is
// sparse, an unset list shows the style's default entries (read-only)
// and the first "+" starts from a copy of them rather than from scratch.
const ArraySelector = ({ selectorInfo, onChange, currentStyle, currentOptionValue }) => {
  const defaultValue = selectorInfo.defaults?.[currentStyle] === undefined ?
    undefined : selectorInfo.defaults[currentStyle].value
  const defaultList = Array.isArray(defaultValue) ? defaultValue : []

  const addButton = (
    <button
      className={styles.button_array}
      title={currentOptionValue === undefined && defaultList.length > 0
        ? "Customize, starting from the style's default entries"
        : "Add element to the array"}
      onClick={() => onChange([...(currentOptionValue ?? cloneDeep(defaultList)), emptyElementFor(selectorInfo.argument_type)])}
    >
      <img className={styles.image_button_array} src="./addIcon.svg" alt="Add element to the array" />
    </button>
  )

  if (currentOptionValue === undefined)
    return (
      <span>
        {defaultList.length > 0 ? (
          <div className={styles.title_nested} title={JSON.stringify(defaultList, null, 1)}>
            Style default: {defaultList.length} {defaultList.length === 1 ? "entry" : "entries"}
          </div>
        ) : null}
        {addButton}
      </span>
    )

  return (
    <span>
      {currentOptionValue.map((value, index) => {
        const onElementChange = (newValue) => {
          const newOptValue = [...currentOptionValue]
          newOptValue[index] = newValue
          onChange(newOptValue)
        }
        let element
        switch (selectorInfo.argument_type) {
          case "std::vector<RawStringFormat>":
            element = <RawStringFormatsSelector selectorInfo={selectorInfo} currentStyle={currentStyle}
              currentOptionValue={value} onChange={onElementChange} />
            break
          case "std::vector<IncludeCategory>":
            element = <IncludeCategoriesSelector selectorInfo={selectorInfo}
              currentOptionValue={value} onChange={onElementChange} />
            break
          default:
            element = <SingleSelector
              selectorInfo={{ ...selectorInfo, argument_type: "std::string" }}
              currentOptionValue={value}
              notDisableable={true}
              onChange={onElementChange}
            />
            break
        }
        return (
          <div key={selectorInfo.title + index}>
            {element}
            <button
              className={styles.button_array}
              title="Delete array element"
              onClick={() => onChange(currentOptionValue.length === 1
                ? undefined
                : currentOptionValue.filter((_, filterIndex) => index !== filterIndex))}
            >
              <img className={styles.image_button_array} src="./deleteIcon.svg" alt="Delete array element" />
            </button>
          </div>
        )
      })}
      {addButton}
    </span>
  )
}

export default ArraySelector;
