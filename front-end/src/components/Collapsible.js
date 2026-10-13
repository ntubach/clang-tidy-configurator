import CollapsibleModule from "react-collapsible";

// react-collapsible ships a webpack UMD bundle whose module.exports is
// { __esModule: true, default: Collapsible }, with __esModule set at
// runtime where the bundler can't see it. Vite 8 (Rolldown) therefore hands
// a default import the whole exports object rather than the component, so
// unwrap it here once instead of at every use.
const Collapsible = CollapsibleModule.default ?? CollapsibleModule

export default Collapsible
