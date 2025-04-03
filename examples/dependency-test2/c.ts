
function get(obj, key, notFound = null) {
  if (obj == null) return notFound;
  if (typeof obj !== "object" && typeof obj !== "function") {
    obj = Object(obj);
  }
  const propKey = typeof key === "number" ? String(key) : key;
  return propKey in obj ? obj[propKey] : notFound;
}


import { minus } from "./d.hql";
export { minus };
