// cli/publish/publish_errors.ts - Specialized error handling for the publishing system
// Leverages the existing HQL error infrastructure

import {
  TranspilerError,
  ImportError,
  ValidationError,
  report,
  createErrorReport,
  formatError
} from "../../src/transpiler/error/errors.ts";

/**
 * Error thrown during the publishing process
 */
export class PublishError extends TranspilerError {
  constructor(
    message: string,
    options: {
      source?: string;
      filePath?: string;
      platform?: string;
      phase?: string;
      useColors?: boolean;
    } = {}
  ) {
    // Add a bit more context to error messages
    const enhancedMessage = options.platform 
      ? `Publishing to ${options.platform} failed: ${message}`
      : `Publishing failed: ${message}`;
      
    super(enhancedMessage, {
      source: options.source,
      filePath: options.filePath,
      useColors: options.useColors ?? true
    });
    
    Object.setPrototypeOf(this, PublishError.prototype);
  }
  
  /**
   * Create a PublishError from any error
   */
  static fromError(
    error: Error | unknown,
    options: {
      source?: string;
      filePath?: string;
      platform?: string;
      phase?: string;
      useColors?: boolean;
    } = {}
  ): PublishError {
    const message = error instanceof Error 
      ? error.message 
      : String(error);
      
    return new PublishError(message, options);
  }
}

/**
 * Error thrown during package registry operations
 */
export class RegistryError extends PublishError {
  constructor(
    message: string,
    registryName: string,
    options: {
      source?: string;
      filePath?: string;
      useColors?: boolean;
    } = {}
  ) {
    super(message, {
      ...options,
      platform: registryName
    });
    
    Object.setPrototypeOf(this, RegistryError.prototype);
  }
}

/**
 * Error thrown during bundling for publishing
 */
export class BundleError extends PublishError {
  constructor(
    message: string,
    entryPoint: string,
    options: {
      source?: string;
      useColors?: boolean;
    } = {}
  ) {
    super(message, {
      ...options,
      filePath: entryPoint,
      phase: "bundling"
    });
    
    Object.setPrototypeOf(this, BundleError.prototype);
  }
}

/**
 * Error thrown when environment validation fails
 */
export class EnvironmentError extends PublishError {
  constructor(
    message: string,
    requirement: string,
    options: {
      useColors?: boolean;
    } = {}
  ) {
    super(`${requirement} requirement failed: ${message}`, {
      ...options,
      phase: "environment-check"
    });
    
    Object.setPrototypeOf(this, EnvironmentError.prototype);
  }
}

/**
 * Error thrown when package configuration is invalid
 */
export class ConfigurationError extends PublishError {
  constructor(
    message: string,
    configType: string,
    options: {
      filePath?: string;
      useColors?: boolean;
    } = {}
  ) {
    super(`${configType} configuration error: ${message}`, {
      ...options,
      phase: "configuration"
    });
    
    Object.setPrototypeOf(this, ConfigurationError.prototype);
  }
}

/**
 * Create a formatted error report for a publish error
 * Extends the existing error reporting with publishing-specific context
 */
export function createPublishErrorReport(
  error: Error | unknown,
  options: {
    filePath?: string;
    platform?: string;
    phase?: string;
    useColors?: boolean;
  } = {}
): string {
  // When we get a PublishError, just use it directly
  if (error instanceof PublishError) {
    return formatError(error);
  }
  
  // Otherwise create a new PublishError
  const publishError = PublishError.fromError(error, options);
  return formatError(publishError);
}

/**
 * Report a publish error with enhanced context
 */
export function reportPublishError(
  error: Error | unknown,
  options: {
    filePath?: string;
    platform?: string;
    phase?: string;
    useColors?: boolean;
  } = {}
): PublishError {
  // Create and format the error
  const publishError = error instanceof PublishError 
    ? error 
    : PublishError.fromError(error, options);
    
  // Print the error to the console
  console.error(formatError(publishError));
  
  // Return the error for potential re-throwing
  return publishError;
}

// Define useful error templates with pre-filled details
export const ErrorTemplates = {
  // Environment errors
  MISSING_CLI_TOOL: (tool: string, details: string) => 
    new EnvironmentError(`${tool} not found or not accessible. ${details}`, "CLI tool"),
    
  AUTH_NOT_CONFIGURED: (platform: string, details: string) => 
    new EnvironmentError(`Authentication for ${platform} is not properly configured. ${details}`, "Authentication"),
    
  // Configuration errors
  INVALID_PACKAGE_CONFIG: (configType: string, details: string, filePath?: string) => 
    new ConfigurationError(details, configType, { filePath }),
    
  INVALID_ENTRY_POINT: (path: string, details: string) => 
    new ConfigurationError(`Entry point ${path} is invalid: ${details}`, "Module entry"),
    
  // Bundle errors
  BUNDLE_FAILED: (entryPoint: string, details: string, source?: string) => 
    new BundleError(details, entryPoint, { source }),
    
  // Registry errors  
  PUBLISH_REJECTED: (registry: string, details: string) => 
    new RegistryError(`Publishing was rejected: ${details}`, registry),
};

// Re-export the base error reporting functions for convenience
export { report, createErrorReport };
