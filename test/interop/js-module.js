import { goodbye } from "./hql-submodule.hql";
import { getTimestamp } from "./js-util.js";

// Use the imported HQL function
export function greet(name) {
  return \`JavaScript module says: \${goodbye(name)} (at \${getTimestamp()})\`;
}