// core/src/error/error-manager.ts
// Central error management system for the HQL compiler

import { HQLError, SourceLocation, ParseError, MacroError, TransformError, 
    TypeError, CodeGenError, RuntimeError, ImportError, ValidationError } from './error-types.ts';
import { formatError, formatErrorAsJson } from './error-formatter.ts';
import { sourceMapper } from './source-mapper.ts';
import { addSuggestionToError } from './error-suggestions.ts';

/**
* Central error management for the HQL compiler
*/
export class ErrorManager {
// Collection of errors encountered during compilation
private errors: HQLError[] = [];

// Whether to throw immediately on first error
private throwImmediately: boolean = false;

// Whether to output JSON instead of formatted text
private jsonOutput: boolean = false;

// Singleton instance
private static instance: ErrorManager | null = null;

private constructor() {}

/**
* Get the singleton instance
*/
public static getInstance(): ErrorManager {
if (!ErrorManager.instance) {
 ErrorManager.instance = new ErrorManager();
}
return ErrorManager.instance;
}

/**
* Configure the error manager
*/
configure({
throwImmediately = false,
jsonOutput = false
}: {
throwImmediately?: boolean;
jsonOutput?: boolean;
} = {}): void {
this.throwImmediately = throwImmediately;
this.jsonOutput = jsonOutput;
}

/**
* Should stop on first error check
*/
shouldStopOnFirstError(): boolean {
return this.throwImmediately;
}

/**
* Clear all tracked errors
*/
clearErrors(): void {
this.errors = [];
}

/**
* Report an error through the system
*/
reportError(error: HQLError): void {
// Add suggestion if not present
addSuggestionToError(error);

// Add to error collection
this.errors.push(error);

// Output immediately if verbose mode
console.error(this.formatError(error));

// Throw immediately if configured to
if (this.throwImmediately) {
 throw error;
}
}

/**
* Format an error according to current settings
*/
formatError(error: HQLError): string {
return this.jsonOutput 
 ? formatErrorAsJson(error) 
 : formatError(error);
}

/**
* Check if any errors have been reported
*/
hasErrors(): boolean {
return this.errors.length > 0;
}

/**
* Get all reported errors
*/
getErrors(): HQLError[] {
return [...this.errors];
}

/**
* Print all collected errors
*/
printErrors(): void {
if (this.errors.length === 0) return;

for (const error of this.errors) {
 console.error(this.formatError(error));
 console.error(''); // Add blank line between errors
}
}

/**
* Throw the first error or a combined error if multiple exist
*/
throwIfErrors(): void {
if (this.errors.length === 0) return;

if (this.errors.length === 1) {
 throw this.errors[0];
}

// Create a combined error message
const combinedMessage = `${this.errors.length} errors occurred during compilation`;
throw new HQLError(
 combinedMessage,
 'CompilationError',
 this.errors[0].location
);
}

/**
* Create a parse error with source information
*/
createParseError(
message: string,
location: SourceLocation,
suggestion?: string
): ParseError {
const sourceCode = sourceMapper.getSourceFileContent(location.filePath);
return new ParseError(message, location, suggestion, sourceCode);
}

/**
* Create a macro error with source information
*/
createMacroError(
message: string,
location: SourceLocation,
macroName: string,
suggestion?: string
): MacroError {
const sourceCode = sourceMapper.getSourceFileContent(location.filePath);
return new MacroError(message, location, macroName, suggestion, sourceCode);
}

/**
* Create a validation error with source information
*/
createValidationError(
message: string,
location: SourceLocation,
expected?: string,
received?: string,
suggestion?: string
): ValidationError {
const sourceCode = sourceMapper.getSourceFileContent(location.filePath);
return new ValidationError(message, location, expected, received, suggestion, sourceCode);
}

/**
* Create a transform error with source information
*/
createTransformError(
message: string,
location: SourceLocation,
suggestion?: string
): TransformError {
const sourceCode = sourceMapper.getSourceFileContent(location.filePath);
return new TransformError(message, location, suggestion, sourceCode);
}

/**
* Create a type error with source information
*/
createTypeError(
message: string,
location: SourceLocation,
expectedType?: string,
actualType?: string,
suggestion?: string
): TypeError {
const sourceCode = sourceMapper.getSourceFileContent(location.filePath);
return new TypeError(message, location, expectedType, actualType, suggestion, sourceCode);
}

/**
* Create a code generation error with source information
*/
createCodeGenError(
message: string,
location: SourceLocation,
suggestion?: string
): CodeGenError {
const sourceCode = sourceMapper.getSourceFileContent(location.filePath);
return new CodeGenError(message, location, suggestion, sourceCode);
}

/**
* Create an import error with source information
*/
createImportError(
message: string,
location: SourceLocation,
importPath: string,
suggestion?: string
): ImportError {
const sourceCode = sourceMapper.getSourceFileContent(location.filePath);
return new ImportError(message, location, importPath, suggestion, sourceCode);
}

/**
* Create a runtime error with source information
*/
createRuntimeError(
message: string,
location: SourceLocation,
suggestion?: string,
originalError?: Error
): RuntimeError {
const sourceCode = sourceMapper.getSourceFileContent(location.filePath);
return new RuntimeError(message, location, suggestion, sourceCode, originalError);
}

/**
* Process a JavaScript error by mapping it back to HQL source
*/
processJsError(
jsError: Error,
jsFile: string,
jsLine: number,
jsColumn: number
): HQLError {
// Try to map back to HQL source
const hqlLocation = sourceMapper.findOriginalLocation(jsFile, jsLine, jsColumn);

if (hqlLocation) {
 // Create a runtime error with HQL source information
 return this.createRuntimeError(
   jsError.message,
   hqlLocation,
   undefined,
   jsError
 );
}

// Fallback when mapping fails - create error with JS location
return this.createRuntimeError(
 jsError.message,
 {
   filePath: jsFile,
   line: jsLine,
   column: jsColumn
 },
 undefined,
 jsError
);
}
}

// Convenience function to get the singleton instance
export const errorManager = ErrorManager.getInstance();