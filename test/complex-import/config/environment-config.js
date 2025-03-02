
  // HQL Core Functions
  function createList(...items) { return Array.from(items); }
  function createVector(...items) { return [...items]; }
  function createMap(entries) { return Object.fromEntries(entries); }
  function createSet(...items) { return new Set(items); }
  
  // Helper function for string operations
  function str(...args) { return args.join(''); }
  
const environments = ["development", "testing", "staging", "production"];
const defaultEnvironment = environments[0];
function getCurrentEnvironment() {
  {
  const envVar = Deno.env.get("APP_ENV");
  return (envVar === "development") ? environments[0] : (envVar === "testing") ? environments[1] : (envVar === "staging") ? environments[2] : (envVar === "production") ? environments[3] : true ? defaultEnvironment : null;
}
}
function getEnvironmentConfig() {
  {
  const currentEnv = getCurrentEnvironment();
  return (currentEnv === environments[0]) ? {debug: true, logLevel: "debug", apiBase: "http://localhost:3000"} : (currentEnv === environments[1]) ? {debug: true, logLevel: "info", apiBase: "http://test-api.example.com"} : (currentEnv === environments[2]) ? {debug: false, logLevel: "warn", apiBase: "https://staging-api.example.com"} : (currentEnv === environments[3]) ? {debug: false, logLevel: "error", apiBase: "https://api.example.com"} : true ? {debug: true, logLevel: "debug", apiBase: "http://localhost:3000"} : null;
}
}
export { getCurrentEnvironment };
export { getEnvironmentConfig };
export { environments };
export { defaultEnvironment };
