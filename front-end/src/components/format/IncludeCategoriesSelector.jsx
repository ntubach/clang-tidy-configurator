import React from "react";
import styles from "../Selector.module.css";
import SingleSelector from "./SingleSelector";

const FIELDS = [
  { name: "Regex", argument_type: "std::string" },
  { name: "Priority", argument_type: "int" },
  { name: "SortPriority", argument_type: "int" },
  { name: "CaseSensitive", argument_type: "bool" },
]

// One IncludeCategories entry. Ported from clang-format-configurator-v2.
const IncludeCategoriesSelector = ({ selectorInfo, onChange, currentOptionValue }) => (
  <div key={selectorInfo.title} className={styles.nested_container}>
    {FIELDS.map((field) => (
      <React.Fragment key={field.name}>
        <div className={styles.title_nested}>{field.name}</div>
        <SingleSelector
          selectorInfo={{ argument_type: field.argument_type }}
          currentOptionValue={currentOptionValue[field.name]}
          notDisableable={true}
          onChange={(newValue) => onChange({ ...currentOptionValue, [field.name]: newValue })}
        />
      </React.Fragment>
    ))}
  </div>
)

export default IncludeCategoriesSelector;
