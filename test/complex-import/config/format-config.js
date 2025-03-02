
  // HQL Core Functions
  function createList(...items) { return Array.from(items); }
  function createVector(...items) { return [...items]; }
  function createMap(entries) { return Object.fromEntries(entries); }
  function createSet(...items) { return new Set(items); }
  
  // Helper function for string operations
  function str(...args) { return args.join(''); }
  
import * as sharedUtils_module from "../utils/shared-utils.js";
const sharedUtils = sharedUtils_module.default !== undefined ? sharedUtils_module.default : sharedUtils_module;
const formatSettings = {
  json: {indent: 2, pretty: true, contentType: "application/json"},
  xml: {indent: 4, header: true, contentType: "application/xml"},
  yaml: {indent: 2, flowStyle: false, contentType: "application/yaml"},
  csv: {delimiter: ",", header: true, contentType: "text/csv"},
  text: {encoding: "utf-8", contentType: "text/plain"}
};
function getFormatSettings(format) {
  {
  const normalizedFormat = sharedUtils.normalizeFormat(format);
  return formatSettings[normalizedFormat] ? formatSettings[normalizedFormat] : true ? formatSettings.text : null;
}
}
function getContentType(format) {
  {
  const settings = getFormatSettings(format);
  return settings.contentType;
}
}
export { getFormatSettings };
export { getContentType };
export { formatSettings };
