// core/src/common/error-constants.ts
// Centralized error constants for better maintainability

/**
 * Error message patterns used for error detection and suggestion creation
 */
export const ERROR_PATTERNS = {
    // Property/null errors
    CANNOT_READ: "cannot read",
    PROPERTY_OF: "property",
    PROPERTIES_OF: "properties",
    
    // Reference errors
    IS_NOT_DEFINED: "is not defined",
    GET_FUNCTION: "get",
    
    // Function errors
    IS_NOT_FUNCTION: "is not a function",
    
    // Import errors
    NOT_FOUND_IN_MODULE: "not found in module",
    
    // Property errors
    PROPERTY_NOT_FOUND: "property not found",
    
    // Syntax errors
    UNEXPECTED_TOKEN: "unexpected token",
    
    // Argument errors 
    TOO_MANY_ARGUMENTS: "too many",
    ARGUMENTS: "arguments",
    
    // Invalid form errors
    INVALID: "invalid",
    FORM: "form",
    
    // JavaScript errors (keep exact case for better matching)
    PROPERTY_ACCESS_FAIL: "Cannot read property",
    NULL_ACCESS_FAIL: "Cannot read properties of",
    TYPE_ERROR: "TypeError",
    REFERENCE_ERROR: "ReferenceError"
  };
  
  /**
   * Error suggestion messages
   */
  export const ERROR_SUGGESTIONS = {
    // Property access
    NULL_PROPERTY: "Check that the object is not null or undefined before accessing its properties.",
    
    // Variable definition
    UNDEFINED_VAR: (varName: string) => 
      `Check ${varName} at line ${varName.length > 3 ? 'above' : 'below'}. Make sure '${varName}' is defined before using it. Did you forget to import it or declare it with 'let'?`,
    
    // Special case for "get" function
    GET_FUNCTION: "The 'get' function is used by the HQL transpiler for property access. Make sure your property access uses dot notation (e.g., 'b.hello' instead of 'bhello').",
    
    // Variable definition generic
    DEFINE_VARS: "Make sure all variables are defined before using them.",
    
    // Invalid function
    NOT_FUNCTION: "Verify that you're calling a valid function and check for typos in the function name or property name.",
    
    // Import
    IMPORT_SYMBOLS: "Check the imported file for exported symbols, or fix the property name.",
    
    // Property not found
    MISSING_PROPERTY: "Verify the property name and check if you have a typo or if the property exists on the object.",
    
    // Syntax
    SYNTAX_ERROR: "Check the syntax around this area for mismatched parentheses, brackets, or other syntax errors.",
    
    // Arguments
    TOO_MANY_ARGS: "Check the function signature and make sure you're passing the correct number of arguments.",
    
    // Form
    INVALID_FORM: "Check the syntax of this form and make sure it follows the correct pattern.",
    
    // Default
    DEFAULT: "Check runtime type mismatches or invalid operations."
  };
  
  /**
   * Error message regular expressions for extracting information
   */
  export const ERROR_REGEX = {
    // Extract variable name from "X is not defined"
    UNDEFINED_VAR: /(?:variable |['"](.*?)['"] )?is not defined/,
    
    // Extract function name from "X is not a function"
    NOT_FUNCTION: /([a-zA-Z0-9_$.]+) is not a function/,
    
    // Extract property from property errors
    PROPERTY: /'([^']+)'/,
    
    // Extract unexpected token
    TOKEN: /unexpected ['"]?([^'"]+)['"]?/i,
    
    // For import errors, extract the module and symbol
    IMPORT_SYMBOL: /['"](.*?)['"] not found/,
    MODULE_PATH: /['"]([^'"]+)['"]/,
    
    // Argument count errors
    ARGS_COUNT: /too many (?:positional )?arguments in call to function ['"]([^'"]+)['"]/i
  };
  
  /**
   * File path resolution constants
   */
  export const PATH_KEYS = {
    HQL_EXTENSION: ".hql",
    JS_EXTENSION: ".js",
    TRANSPILED_SUFFIX: ".transpiled.js",
    TEMP_MARKER: "_hql_/",
    TRANSPILED_MARKER: "hql-transpiled/"
  };
  
  /**
   * Common error types and categories
   */
  export const ERROR_TYPES = {
    SYNTAX: "syntax error",
    REFERENCE: "reference error",
    TYPE: "type error",
    IMPORT: "import error",
    VALIDATION: "validation error",
    TRANSFORMATION: "transformation error",
    RUNTIME: "runtime error"
  };