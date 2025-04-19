// ../doc/examples/full-interop/typescript/shared-types.ts
var APP_VERSION = "1.0.0";
var MAX_USERS = 100;
var SAMPLE_USER = {
  id: 1,
  name: "Test User",
  role: "admin",
  isActive: true,
  createdAt: /* @__PURE__ */ new Date()
};

// ../doc/examples/full-interop/javascript/simple-process.js
function formatMessage(message) {
  return `[JS] ${message.toUpperCase()}`;
}
var jsInfo = {
  name: "Simple JS Module",
  version: "1.0.0",
  features: ["Interop with HQL", "Simple formatting", "TypeScript support"]
};

// ../.hql-cache/doc/examples/full-interop/simple-test.ts
console.log("\\n=== TYPESCRIPT IMPORT TEST ===\\n");
console.log("App Version from TypeScript:", APP_VERSION);
console.log("Max Users Constant:", MAX_USERS);
console.log("Sample User from TypeScript:");
console.log("  - ID:", SAMPLE_USER.id);
console.log("  - Name:", SAMPLE_USER.name);
console.log("  - Role:", SAMPLE_USER.role);
console.log("  - Active:", SAMPLE_USER.isActive);
console.log("\\n=== TYPESCRIPT IMPORT TEST COMPLETED ===\\n");
console.log("\\n=== JAVASCRIPT IMPORT TEST ===\\n");
console.log("Message formatted by JS:", formatMessage("hello from hql"));
console.log("JS Module Info:");
console.log("  - Name:", jsInfo.name);
console.log("  - Version:", jsInfo.version);
console.log("  - Features:", JSON.stringify(jsInfo.features));
console.log("\\n=== JAVASCRIPT IMPORT TEST COMPLETED ===\\n");
console.log("\\n=== FULL INTEROP TEST SUCCESSFUL ===\\n");
