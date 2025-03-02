
  // HQL Core Functions
  function createList(...items) { return Array.from(items); }
  function createVector(...items) { return [...items]; }
  function createMap(entries) { return Object.fromEntries(entries); }
  function createSet(...items) { return new Set(items); }
  
  // Helper function for string operations
  function str(...args) { return args.join(''); }
  
import * as strUtils_module from "https://esm.sh/lodash";
const strUtils = strUtils_module.default !== undefined ? strUtils_module.default : strUtils_module;
function normalizeFormat(format) {
  {
  const lowerFormat = strUtils.lowerCase(format);
  return (lowerFormat === "json") ? "json" : (lowerFormat === "xml") ? "xml" : (lowerFormat === "yaml") ? "yaml" : (lowerFormat === "yml") ? "yaml" : (lowerFormat === "csv") ? "csv" : true ? "text" : null;
}
}
function getExtensionForFormat(format) {
  {
  const normalizedFormat = normalizeFormat(format);
  return (normalizedFormat === "json") ? ".json" : (normalizedFormat === "xml") ? ".xml" : (normalizedFormat === "yaml") ? ".yaml" : (normalizedFormat === "csv") ? ".csv" : true ? ".txt" : null;
}
}
function generateFileName(baseName, format) { return baseName + getExtensionForFormat(format); }
export { normalizeFormat };
export { getExtensionForFormat };
export { generateFileName };
