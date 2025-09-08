// end.js - JavaScript file in circular dependency chain
// This imports back to HQL: JS → HQL

import { add_hql } from './entry.hql';

export function processValue(value) {
  // Use the HQL function to double the value
  return add_hql(value, value);
}