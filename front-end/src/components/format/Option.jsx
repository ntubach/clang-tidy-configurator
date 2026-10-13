import React from "react";
import Collapsible from "../Collapsible";
import styles from "./Option.module.css";
import SingleSelector from "./SingleSelector";
import MapSelector from "./MapSelector";
import ArraySelector from "./ArraySelector";

// One clang-format option: title, collapsible docstring and the selector
// matching its type. Ported from clang-format-configurator-v2.
const Option = ({ optionInfo, currentOptionValue, currentStyle, onChange, overriddenBy }) => {
  const [showDocString, setShowDocString] = React.useState(false);

  const placeSelector = () => {
    const onChangeFunc = (newOptionValue) => { onChange(optionInfo.title, newOptionValue) }
    switch (optionInfo.title) {
      case "AlignTrailingComments":
        if (!optionInfo.nested)
          return (<SingleSelector
            selectorInfo={optionInfo.values[0]}
            defaultValue={optionInfo.values[0].defaults[currentStyle]}
            currentOptionValue={currentOptionValue}
            onChange={onChangeFunc}
          />)
      // else fallthrough
      // eslint-disable-next-line no-fallthrough
      case "BraceWrapping":
      case "SpaceBeforeParensOptions":
      case "SpacesInLineCommentPrefix":
        return (<MapSelector
          selectorInfo={optionInfo.values}
          currentOptionValue={currentOptionValue}
          currentStyle={currentStyle}
          onChange={onChangeFunc}
        />)
      default:
        if (optionInfo.values[0].argument_type.includes("std::vector<"))
          return (<ArraySelector
            selectorInfo={optionInfo.values[0]}
            currentStyle={currentStyle}
            currentOptionValue={currentOptionValue}
            onChange={onChangeFunc}
          />)

        if (optionInfo.nested || optionInfo.values.length >= 2)
          return (<MapSelector
            selectorInfo={optionInfo.values}
            currentOptionValue={currentOptionValue}
            currentStyle={currentStyle}
            onChange={onChangeFunc}
          />)

        return (<SingleSelector
          selectorInfo={optionInfo.values[0]}
          defaultValue={optionInfo.values[0].defaults[currentStyle]}
          currentOptionValue={currentOptionValue}
          onChange={onChangeFunc}
        />)
    }
  }

  return (
    <section className={styles.option}>
      <span className={styles.title_container}>
        <button
          className={styles.info_button}
          title="Show description"
          onClick={() => setShowDocString(!showDocString)}
        >
          <img className={styles.info_button} alt="show info" src="./questionIcon.svg" />
        </button>
        <span className={optionInfo.deprecated ? styles.title_deprecated : styles.title}>{optionInfo.title}</span>
        {overriddenBy ? <span className={styles.overridden_warning}> overridden by {overriddenBy}</span> : null}
        <Collapsible open={showDocString} transitionTime={100}>
          <div
            hidden={showDocString ? "" : "hidden"}
            className={styles.docstring}
            dangerouslySetInnerHTML={{ __html: optionInfo.docstring }}
          ></div>
        </Collapsible>
      </span>
      {placeSelector()}
    </section>
  );
}

export default Option;
