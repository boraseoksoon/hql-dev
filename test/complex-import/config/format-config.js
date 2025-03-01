import * as sharedUtils from "../utils/shared-utils.js";
const formatSettings = {[":json"]: {[":indent"]: 2, [":pretty"]: true, [":contentType"]: "application/json"}, [":xml"]: {[":indent"]: 4, [":header"]: true, [":contentType"]: "application/xml"}, [":yaml"]: {[":indent"]: 2, [":flowStyle"]: false, [":contentType"]: "application/yaml"}, [":csv"]: {[":delimiter"]: ",", [":header"]: true, [":contentType"]: "text/csv"}, [":text"]: {[":encoding"]: "utf-8", [":contentType"]: "text/plain"}};
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
