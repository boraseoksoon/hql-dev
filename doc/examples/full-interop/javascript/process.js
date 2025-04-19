// JavaScript Processing Module
// Demonstrates JS importing HQL and TypeScript

// Import from TypeScript module for type information
import { User, ProcessedUser, APP_VERSION } from '../typescript/shared-types.ts';

// Import from HQL file (showing JS -> HQL interop)
import { createUser } from '../hql/user-service.hql';

// Process a user and add JS-specific data
export function processData(user) {
  console.log("Processing user data in JavaScript");
  console.log("TypeScript APP_VERSION:", APP_VERSION);
  
  // Create a processed user (would match ProcessedUser type)
  const processed = {
    ...user,
    lastProcessed: new Date(),
    // These will be overwritten in HQL
    displayName: user.name,
    permissions: []
  };
  
  return processed;
}

// Filter active users
export function filterActive(users) {
  console.log("Filtering active users in JavaScript");
  return users.filter(user => user.isActive);
}

// Create a test user using the HQL function
export function createTestUser() {
  console.log("Creating test user from JavaScript using HQL function");
  // Call HQL function
  const user = createUser(999, "JS Test User", "tester");
  return user;
}

// Export an object with app info
export const jsModuleInfo = {
  name: "JS Processing Module",
  importedFrom: ["TypeScript", "HQL"],
  processingVersion: "1.2.0"
}; 