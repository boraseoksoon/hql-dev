import { APP_VERSION } from "./shared-types.ts";
import { createUser, enrichUserData } from "../hql/user-service.hql";
import { filterActive, jsModuleInfo } from "../javascript/process.js";
class UserManager {
  constructor() {
    this.users = [];
    this.appVersion = APP_VERSION;
    console.log(`TypeScript UserManager initialized with version ${this.appVersion}`);
    console.log(`JS Module info:`, jsModuleInfo);
  }
  /**
   * Add a new user using HQL function
   */
  addUser(id, name, role) {
    try {
      console.log(`TS: Adding user ${name} with role ${role}`);
      const user = createUser(id, name, role);
      this.users.push(user);
      return {
        success: true,
        data: user
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  /**
   * Process users using both HQL and JS functions
   */
  processUsers() {
    try {
      console.log("TS: Processing all users");
      const activeUsers = filterActive(this.users);
      console.log(`TS: Found ${activeUsers.length} active users out of ${this.users.length} total`);
      const processedUsers = activeUsers.map((user) => enrichUserData(user));
      return {
        success: true,
        data: processedUsers
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  /**
   * Get statistics about users
   */
  getUserStats() {
    const active = filterActive(this.users).length;
    const roles = {};
    this.users.forEach((user) => {
      roles[user.role] = (roles[user.role] || 0) + 1;
    });
    return {
      total: this.users.length,
      active,
      roles
    };
  }
}
const userManager = new UserManager();
export {
  APP_VERSION,
  UserManager,
  userManager
};
