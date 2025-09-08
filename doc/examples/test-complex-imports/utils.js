// utils.js - JavaScript utility module

export function formatMessage(msg) {
  return `[JS Utils] ${msg}`;
}

export function processData(data) {
  return data.reduce((sum, val) => sum + val, 0);
}
