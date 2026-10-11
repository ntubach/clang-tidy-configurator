import React from "react";
import styles from "./DiagnosticsList.module.css";

const severityClass = {
  error: styles.severity_error,
  warning: styles.severity_warning,
  note: styles.severity_note,
}

const DiagnosticsList = ({ diagnostics, hasAnalyzed, onJumpTo }) => {
  const sorted = React.useMemo(
    () => [...diagnostics].sort((a, b) => a.line - b.line || a.column - b.column),
    [diagnostics]
  )

  return (
    <div className={styles.container}>
      {sorted.length === 0 ? (
        <div className={styles.empty}>
          {hasAnalyzed ? "No diagnostics found." : "Click Analyze to run clang-tidy."}
        </div>
      ) : (
        sorted.map((d, i) => (
          <div className={styles.row} key={i} onClick={() => onJumpTo(d.line, d.column)}>
            <span className={severityClass[d.severity] || styles.severity_warning}>{d.severity}</span>
            <span className={styles.location}>{d.line}:{d.column}</span>
            <span className={styles.check}>[{d.check || "clang-diagnostic"}]</span>
            <span className={styles.message}>{d.message}</span>
          </div>
        ))
      )}
    </div>
  )
}

export default DiagnosticsList;
