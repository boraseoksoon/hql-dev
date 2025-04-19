function formatString(input) {
  return `[TS] ${input}`;
}
function uppercaseString(input) {
  return input.toUpperCase();
}
const TS_INFO = {
  version: "1.0.0",
  language: "TypeScript",
  timestamp: (/* @__PURE__ */ new Date()).toISOString()
};
export {
  TS_INFO,
  formatString,
  uppercaseString
};
