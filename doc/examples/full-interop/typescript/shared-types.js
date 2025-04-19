const APP_VERSION = "1.0.0";
const MAX_USERS = 100;
const SAMPLE_USER = {
  id: 1,
  name: "Test User",
  role: "admin",
  isActive: true,
  createdAt: /* @__PURE__ */ new Date()
};
var shared_types_default = {
  version: APP_VERSION,
  constants: {
    MAX_USERS
  },
  createDefaultUser: () => ({
    id: 0,
    name: "New User",
    role: "user",
    isActive: true,
    createdAt: /* @__PURE__ */ new Date()
  })
};
export {
  APP_VERSION,
  MAX_USERS,
  SAMPLE_USER,
  shared_types_default as default
};
