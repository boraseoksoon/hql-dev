import * as sharedUtils from "./shared-utils.js";
function formatData(data, format) {
  {
  const normalizedFormat = sharedUtils.normalizeFormat(format);
  return "Data formatted as " + normalizedFormat + ": " + data.name;
}
}
function truncate(str, maxLength) {
  return (String(str.length) <= maxLength) ? str : true ? String(str.substring, 0, (maxLength - 3), "...") : null;
}
function padLeft(str, minLength, padChar) {
  {
  const padding = String("", "padStart", (minLength - String(str.length)), padChar);
  return String(padding + str);
}
}
function padRight(str, minLength, padChar) {
  {
  const padding = String("", "padEnd", (minLength - String(str.length)), padChar);
  return String(str + padding);
}
}
export { formatData };
export { truncate };
export { padLeft };
export { padRight };
