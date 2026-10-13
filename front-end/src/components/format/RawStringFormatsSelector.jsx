import styles from "../Selector.module.css";
import SingleSelector from "./SingleSelector";
import ArraySelector from "./ArraySelector";

// One RawStringFormats entry. Ported from clang-format-configurator-v2
// (with its "Delimeters" label typo fixed).
const RawStringFormatsSelector = ({ selectorInfo, onChange, currentStyle, currentOptionValue }) => {
  const setField = (name) => (newValue) => onChange({ ...currentOptionValue, [name]: newValue })
  const stringField = (name) => (
    <>
      <div className={styles.title_nested}>{name}</div>
      <SingleSelector
        selectorInfo={{ argument_type: "std::string" }}
        currentOptionValue={currentOptionValue[name]}
        notDisableable={true}
        onChange={setField(name)}
      />
    </>
  )
  const listField = (name) => (
    <>
      <div className={styles.title_nested}>{name}</div>
      <ArraySelector
        selectorInfo={{ title: name, argument_type: "std::string" }}
        onChange={setField(name)}
        currentOptionValue={currentOptionValue[name]}
        currentStyle={currentStyle}
      />
    </>
  )
  return (
    <div key={selectorInfo.title} className={styles.nested_container}>
      {stringField("Language")}
      {listField("Delimiters")}
      {listField("EnclosingFunctions")}
      {stringField("CanonicalDelimiter")}
      {stringField("BasedOnStyle")}
    </div>
  )
}

export default RawStringFormatsSelector;
