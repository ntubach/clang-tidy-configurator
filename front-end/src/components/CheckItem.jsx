import React from "react";
import Collapsible from "react-collapsible";
import styles from "./CheckItem.module.css";
import CheckOptionInput from "./CheckOptionInput";

const CheckItem = ({ checkInfo, enabled, checkOptionOverrides, onToggle, onOptionChange }) => {
  const [showDocString, setShowDocString] = React.useState(false);

  return (
    <section className={styles.check}>
      <div className={styles.check_row}>
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={enabled}
          onChange={(event) => onToggle(event.target.checked)}
        />
        <span className={styles.title_container}>
          <button
            className={styles.info_button}
            alt="Show docstring"
            onClick={() => setShowDocString(!showDocString)}
          >
            <img className={styles.info_button} alt="show info" src="./questionIcon.svg" />
          </button>
          <span className={styles.title}>{checkInfo.name}</span>
          {checkInfo.offersFixes ? <span className={styles.fix_badge}>fix</span> : null}
        </span>
      </div>

      <Collapsible open={showDocString} transitionTime={100}>
        <div
          hidden={showDocString ? "" : "hidden"}
          className={styles.docstring}
          dangerouslySetInnerHTML={{ __html: checkInfo.docstring || checkInfo.shortDescription || "No documentation available." }}
        />
      </Collapsible>

      {enabled && checkInfo.options.length > 0 ? (
        <div className={styles.options_container}>
          {checkInfo.options.map((optionInfo) => {
            const key = `${checkInfo.name}.${optionInfo.name}`
            return (
              <div className={styles.option_row} key={key}>
                <span className={styles.option_name} title={optionInfo.docstring.replace(/<[^>]+>/g, "")}>
                  {optionInfo.name}
                </span>
                <CheckOptionInput
                  optionInfo={optionInfo}
                  currentValue={checkOptionOverrides[key]}
                  onChange={(value) => onOptionChange(key, value)}
                />
              </div>
            )
          })}
        </div>
      ) : null}
    </section>
  );
}

export default CheckItem;
