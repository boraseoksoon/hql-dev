// TypeScript User Manager
// Integrates functionality from HQL and JavaScript modules

// Import type definitions
import { User, ProcessedUser, Result, APP_VERSION } from './shared-types.ts';

// Import from HQL
import { createUser, enrichUserData } from '../hql/user-service.hql';

// Import from JavaScript
import { filterActive, jsModuleInfo } from '../javascript/process.js';

/**
 * User manager class that combines functionality from multiple languages
 */
export class UserManager {
  private users: User[] = [];
  private readonly appVersion: string;
  
  constructor() {
    this.appVersion = APP_VERSION;
    console.log(`TypeScript UserManager initialized with version ${this.appVersion}`);
    console.log(`JS Module info:`, jsModuleInfo);
  }
  
  /**
   * Add a new user using HQL function
   */
  addUser(id: number, name: string, role: string): Result<User> {
    try {
      console.log(`TS: Adding user ${name} with role ${role}`);
      
      // Use HQL function to create user
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
  processUsers(): Result<ProcessedUser[]> {
    try {
      console.log('TS: Processing all users');
      
      // Use JavaScript function to filter active users
      const activeUsers = filterActive(this.users);
      console.log(`TS: Found ${activeUsers.length} active users out of ${this.users.length} total`);
      
      // Use HQL function to enrich user data
      const processedUsers: ProcessedUser[] = activeUsers.map(user => enrichUserData(user));
      
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
  getUserStats(): { total: number, active: number, roles: Record<string, number> } {
    const active = filterActive(this.users).length;
    
    // Group users by role
    const roles: Record<string, number> = {};
    this.users.forEach(user => {
      roles[user.role] = (roles[user.role] || 0) + 1;
    });
    
    return {
      total: this.users.length,
      active,
      roles
    };
  }
}

// Create and export manager instance
export const userManager = new UserManager();

// Export version for reference
export { APP_VERSION }; 