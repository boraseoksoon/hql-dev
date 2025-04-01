
function get(obj, key, notFound = null) {
  if (obj == null) return notFound;
  // Coerce primitive types (string, number, boolean) to objects
  if (typeof obj !== "object" && typeof obj !== "function") {
    obj = Object(obj);
  }
  const propKey = typeof key === "number" ? String(key) : key;
  return propKey in obj ? obj[propKey] : notFound;
}



export enum OsType {
    macOS = "macOS",
    windowOS = "windowOS",
    linux = "linux"
}
