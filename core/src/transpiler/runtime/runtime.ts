export const RUNTIME_FUNCTIONS = `
function get(obj, key, notFound = null) {
  if (obj == null) return notFound;
  
  // If obj is a function and key is anything but a property name,
  // treat this as a function call with key as the first argument
  if (typeof obj === "function" && 
      (typeof key === "number" || 
       typeof key === "string" && !isNaN(key) || 
       typeof key === "boolean" ||
       key === null ||
       key === undefined ||
       Array.isArray(key) ||
       typeof key === "object")) {
    return obj(key);
  }
  
  // Coerce primitive types (string, number, boolean) to objects
  if (typeof obj !== "object" && typeof obj !== "function") {
    obj = Object(obj);
  }
  
  const propKey = typeof key === "number" ? String(key) : key;
  return propKey in obj ? obj[propKey] : notFound;
}
`;
