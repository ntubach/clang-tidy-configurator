import Option from "./Option";

// Option whose value only takes effect when another option is set to
// Custom; flagged in the UI the same way clang-format-configurator-v2 does.
function overriddenBy(title, effectiveValue) {
  switch (title) {
    case "BraceWrapping":
      return effectiveValue("BreakBeforeBraces") !== "Custom" ? "BreakBeforeBraces" : undefined
    case "SpaceBeforeParensOptions":
      return effectiveValue("SpaceBeforeParens") !== "Custom" ? "SpaceBeforeParens" : undefined
    default:
      return undefined
  }
}

// Every clang-format option for one version, BasedOnStyle first and
// deprecated options last, filtered by a search string. Adapted from
// clang-format-configurator-v2's OptionList for this page's sparse state
// (see formatConfigStuff.js) - picking a style doesn't touch the options
// already set, it only changes what the unset ones fall back to.
const FormatOptionList = ({ versionOptions, formatOptions, search, onOptionChange }) => {
  const [basedOnStyleOption, ...options] = versionOptions
  const currentStyle = formatOptions.BasedOnStyle || "LLVM"
  const effectiveValue = (title) => {
    if (formatOptions[title] !== undefined) return formatOptions[title]
    const option = options.find((o) => o.title === title)
    return option && !option.nested ? option.values[0].defaults?.[currentStyle]?.value : undefined
  }

  const searchLower = search.trim().toLowerCase()
  const visible = options.filter((option) => !searchLower || option.title.toLowerCase().includes(searchLower))
  const sorted = [...visible.filter((o) => !o.deprecated), ...visible.filter((o) => o.deprecated)]

  return (
    <div>
      {!searchLower || "basedonstyle".includes(searchLower) ? (
        <Option
          optionInfo={basedOnStyleOption}
          currentOptionValue={formatOptions.BasedOnStyle}
          onChange={onOptionChange}
        />
      ) : null}
      {sorted.map((option) => (
        <Option
          key={option.title}
          optionInfo={option}
          currentStyle={currentStyle}
          overriddenBy={overriddenBy(option.title, effectiveValue)}
          currentOptionValue={formatOptions[option.title]}
          onChange={onOptionChange}
        />
      ))}
    </div>
  )
}

export default FormatOptionList;
