// TypeScript shared type definitions
// This file defines types used across all languages in the interop test

// Interface representing a user in our system
export interface User {
  id: number;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
}

// Type for a processed user with additional information
export type ProcessedUser = User & {
  displayName: string;
  permissions: string[];
};

// Function signature for data transformation
export type DataTransformer<T, R> = (data: T) => R;

// Generic result wrapper
export interface Result<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Constants
export const APP_VERSION = "1.0.0";
export const MAX_USERS = 100;

// Sample user data
export const SAMPLE_USER: User = {
  id: 1,
  name: "Test User",
  role: "admin",
  isActive: true,
  createdAt: new Date()
};

// Default export for the module
export default {
  version: APP_VERSION,
  constants: {
    MAX_USERS
  },
  createDefaultUser: (): User => ({
    id: 0,
    name: "New User",
    role: "user",
    isActive: true,
    createdAt: new Date()
  })
}; 