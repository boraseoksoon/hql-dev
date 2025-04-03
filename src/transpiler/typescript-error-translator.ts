// src/transpiler/typescript-error-translator.ts
import { enhanceError } from "./enhanced-errors.ts";
import { Logger } from "../logger.ts";

// Initialize logger
const logger = new Logger(Deno.env.get("HQL_DEBUG") === "1");

// TypeScript error codes and their user-friendly descriptions
const TS_ERROR_MESSAGES: Record<string, string> = {
  "2304": "Cannot find name '{0}'. Did you forget to define this variable or import it?",
  "2339": "Property '{0}' does not exist on type '{1}'. Check your spelling or make sure the object has this property.",
  "2345": "Argument of type '{0}' is not assignable to parameter of type '{1}'. The types are incompatible.",
  "2322": "Type '{0}' is not assignable to type '{1}'. Check that your values match the expected types.",
  "2695": "Cannot extend interface '{0}'. Did you mean 'implements'?",
  "2554": "Expected {0} arguments, but got {1}. Check your function call.",
  "2531": "Object is possibly 'null'. Add a null check before using this value.",
  "2532": "Object is possibly 'undefined'. Add an undefined check before using this value.",
  "2349": "This expression is not callable. Type '{0}' has no call signatures.",
  "2551": "Property '{0}' does not exist on type '{1}'. Did you mean '{2}'?",
  "2365": "Operator '{0}' cannot be applied to types '{1}' and '{2}'.",
  "2366": "Function lacks ending return statement and return type does not include 'undefined'.",
  "2571": "Object is of type 'unknown'. Did you forget to cast it to a specific type?",
  "2339_ALT": "Property '{0}' does not exist on type '{1}'. Did you mean '{2}'?",
  "2448": "Block-scoped variable '{0}' used before its declaration.",
  "2451": "Cannot redeclare block-scoped variable '{0}'.",
  "2454": "Variable '{0}' is used before being assigned.",
  "7009": "'{0}' is declared but its value is never read.",
  "7005": "Variable '{0}' implicitly has an '{1}' type.",
  "7015": "Element implicitly has an 'any' type because index expression is not of type 'number'.",
  "7053": "Element implicitly has an 'any' type because expression of type '{0}' can't be used to index type '{1}'."
};

// Pattern to match TypeScript diagnostic formats
const TS_ERROR_REGEX = /TS(\d+):\s*(.*?)(?:\s*\|\s*'(.*?)'\s*)?$/;

/**
 * Extract parameters from TypeScript error messages
 */
function extractTsErrorParams(message: string): string[] {
  const params: string[] = [];
  const paramRegex = /'([^']+)'/g;
  let match: RegExpExecArray | null;
  
  while ((match = paramRegex.exec(message)) !== null) {
    params.push(match[1]);
  }
  
  return params;
}

/**
 * Format a message template with parameters
 */
function formatMessage(template: string, params: string[]): string {
  return template.replace(/\{(\d+)\}/g, (_, index) => {
    const paramIndex = parseInt(index, 10);
    return paramIndex < params.length ? params[paramIndex] : `{${index}}`;
  });
}

/**
 * Translate TypeScript errors to more user-friendly messages
 */
export function translateTypeScriptError(error: Error): Error {
  try {
    const match = error.message.match(TS_ERROR_REGEX);
    if (!match) return error;
    
    const [, errorCode, errorMessage] = match;
    
    // If we have a translation for this error code
    if (errorCode && TS_ERROR_MESSAGES[errorCode]) {
      const params = extractTsErrorParams(errorMessage);
      const translatedMessage = formatMessage(TS_ERROR_MESSAGES[errorCode], params);
      
      // Create a new error with the translated message
      const translatedError = new Error(`${translatedMessage} (TS${errorCode})`);
      translatedError.stack = error.stack;
      
      return translatedError;
    }
    
    return error;
  } catch (e) {
    // If anything goes wrong, return the original error
    logger.debug(`Error translating TypeScript error: ${e instanceof Error ? e.message : String(e)}`);
    return error;
  }
}

/**
 * Apply TypeScript error translation to a function
 */
export function withTypeScriptErrorTranslation<T, Args extends unknown[]>(
  fn: (...args: Args) => Promise<T> | T
): (...args: Args) => Promise<T> {
  return async (...args: Args): Promise<T> => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof Error && error.message.includes("TS")) {
        throw translateTypeScriptError(error);
      }
      throw error;
    }
  };
}

/**
 * Generic type for a function with variable arguments and any return type
 */
type GenericFunction = (...args: unknown[]) => unknown;

/**
 * Enhance TypeScript generate function with better error messages
 */
export function enhanceTypeScriptGeneration(
  generateFunction: GenericFunction, 
  sourceFilePath?: string, 
  sourceContent?: string
): GenericFunction {
  return async (...args: unknown[]) => {
    try {
      return await generateFunction(...args);
    } catch (error) {
      // First translate the error
      const translatedError = translateTypeScriptError(error instanceof Error ? error : new Error(String(error)));
      
      // Then enhance it with source context if available
      if (sourceFilePath && sourceContent) {
        return enhanceError(translatedError, {
          filePath: sourceFilePath,
          source: sourceContent
        });
      }
      
      return translatedError;
    }
  };
}