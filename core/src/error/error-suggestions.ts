// core/src/error/error-suggestions.ts
// Generates helpful suggestions for common HQL errors

import { ParseError, MacroError, ValidationError, TransformError, 
    TypeError, CodeGenError, RuntimeError, ImportError } from './error-types.ts';

/**
* Interface for error pattern matching rules
*/
interface ErrorPattern {
// Function to test if pattern matches
test: (error: any) => boolean;
// Function to generate suggestion
generateSuggestion: (error: any) => string;
}

/**
* Collection of error pattern matchers for common errors
*/
const ERROR_PATTERNS: Record<string, ErrorPattern[]> = {
// Parse errors
'ParseError': [
// Mismatched parentheses
{
 test: (error: ParseError) => 
   error.message.includes('unexpected )') || error.message.includes('unclosed list'),
 generateSuggestion: () => 
   "Check for mismatched parentheses. Make sure every opening '(' has a matching closing ')'."
},
// Unexpected token
{
 test: (error: ParseError) => 
   error.message.includes('unexpected token'),
 generateSuggestion: (error: ParseError) => {
   const tokenMatch = error.message.match(/unexpected token: '(.+?)'/i);
   const token = tokenMatch ? tokenMatch[1] : 'token';
   return `Unexpected token '${token}'. Check your syntax at the indicated position.`;
 }
},
// Common typos in HQL syntax
{
 test: (error: ParseError) => 
   /expected\s+(symbol|identifier)/i.test(error.message),
 generateSuggestion: () => 
   "Expected a symbol or identifier. Make sure you're using valid HQL syntax (e.g., 'fn' not 'def')."
},
// Equality check using = instead of ===
{
 test: (error: ParseError) => {
   if (error.sourceCode && error.location) {
     const line = error.sourceCode[error.location.line - 1] || '';
     return line.includes(' = ') && /(if|when|unless|cond)\b/.test(line);
   }
   return false;
 },
 generateSuggestion: (error: ParseError) => {
   if (error.sourceCode && error.location) {
     const line = error.sourceCode[error.location.line - 1] || '';
     const ifMatch = line.match(/(if|when|unless|cond)\s+\(\s*([^\s]+)\s+=\s+([^\s]+)/);
     if (ifMatch) {
       const [, cond, left, right] = ifMatch;
       return `Use '===' for equality comparison: (${cond} (=== ${left} ${right}) ...)`;
     }
   }
   return "Use '===' for equality comparison instead of '='";
 }
}
],

// Macro errors
'MacroError': [
// Undefined macro
{
 test: (error: MacroError) => 
   error.message.includes('undefined') || error.message.includes('not found'),
 generateSuggestion: (error: MacroError) => 
   `Macro '${error.macroName}' is not defined. Make sure it's defined before use or import it from a module.`
},
// Wrong number of arguments
{
 test: (error: MacroError) => 
   error.message.includes('wrong number') || error.message.includes('expects') || error.message.includes('arguments'),
 generateSuggestion: (error: MacroError) => 
   `Check the arguments for macro '${error.macroName}'. The number of arguments doesn't match the macro definition.`
},
// Syntax error in quasiquote
{
 test: (error: MacroError) => 
   error.message.includes('quasiquote') || error.message.includes('unquote'),
 generateSuggestion: () => 
   "Check your quasiquote/unquote syntax. Use backtick (`) for quasiquote and tilde (~) for unquote."
}
],

// Validation errors
'ValidationError': [
// Type mismatch
{
 test: (error: ValidationError) => 
   error.expected && error.received,
 generateSuggestion: (error: ValidationError) => 
   `Expected ${error.expected} but got ${error.received}. Ensure the types match.`
},
// Missing required property
{
 test: (error: ValidationError) => 
   error.message.includes('missing') || error.message.includes('required'),
 generateSuggestion: (error: ValidationError) => {
   const propMatch = error.message.match(/missing.*?['"]([^'"]+)['"]/i);
   if (propMatch) {
     return `Add the required property '${propMatch[1]}' to complete the structure.`;
   }
   return `Make sure all required properties are included.`;
 }
},
// Invalid usage pattern
{
 test: (error: ValidationError) => 
   error.message.includes('invalid') || error.message.includes('cannot'),
 generateSuggestion: () => 
   `Check the usage pattern. This operation might not be valid in this context.`
}
],

// Transform errors
'TransformError': [
// Errors related to let binding
{
 test: (error: TransformError) => 
   error.message.toLowerCase().includes('let') && error.message.includes('binding'),
 generateSuggestion: () => 
   `Check your 'let' syntax. Should be either '(let name value)' or '(let (name1 value1 name2 value2) body...)'.`
},
// Function definition errors
{
 test: (error: TransformError) => 
   (error.message.toLowerCase().includes('fn') || error.message.toLowerCase().includes('function')) && 
   (error.message.includes('parameter') || error.message.includes('argument')),
 generateSuggestion: () => 
   `Check your function definition. The syntax should be '(fn name (param1 param2...) body...)'.`
},
// Property access errors
{
 test: (error: TransformError) => 
   error.message.includes('property') || error.message.includes('attribute'),
 generateSuggestion: () => 
   `Use '.' for property access (e.g., obj.property) or 'get' for computed properties (e.g., (get obj "property-name")).`
}
],

// Type errors
'TypeError': [
// Function expects different type
{
 test: (error: TypeError) => 
   error.expectedType && error.actualType,
 generateSuggestion: (error: TypeError) => 
   `Expected type ${error.expectedType} but got ${error.actualType}. Try converting the value to the expected type.`
},
// Cannot perform operation on type
{
 test: (error: TypeError) => 
   error.message.includes('cannot') && error.message.includes('on'),
 generateSuggestion: (error: TypeError) => {
   const typeMatch = error.message.match(/cannot.*?on\s+(?:type\s+)?['"]?([^'"]+)['"]?/i);
   const operationMatch = error.message.match(/cannot\s+([^\s]+)/i);
   
   if (typeMatch && operationMatch) {
     return `Cannot perform '${operationMatch[1]}' on type '${typeMatch[1]}'. Check if you're using the right type for this operation.`;
   }
   return `Check if you're using the right type for this operation.`;
 }
},
// Numeric operation on non-numeric value
{
 test: (error: TypeError) => 
   /(?:addition|subtraction|multiplication|division)/i.test(error.message) && 
   /(?:string|boolean|null|undefined)/i.test(error.message),
 generateSuggestion: () => 
   `Make sure you're using numeric values for arithmetic operations. Try converting to numbers first.`
}
],

// Code generation errors
'CodeGenError': [
// Invalid AST structure
{
 test: (error: CodeGenError) => 
   error.message.includes('AST') || error.message.includes('node'),
 generateSuggestion: () => 
   `This is likely an internal compiler error. Please report this issue with a minimal reproduction case.`
},
// Function related errors
{
 test: (error: CodeGenError) => 
   error.message.toLowerCase().includes('function') || error.message.toLowerCase().includes('method'),
 generateSuggestion: () => 
   `Check your function or method definition syntax. This might be a compiler limitation with complex function forms.`
}
],

// Import errors
'ImportError': [
// Module not found
{
 test: (error: ImportError) => 
   error.message.includes('not found') || error.message.includes('cannot find'),
 generateSuggestion: (error: ImportError) => 
   `Could not find module '${error.importPath}'. Check that the file exists and the path is correct.`
},
// Circular dependency
{
 test: (error: ImportError) => 
   error.message.includes('circular') || error.message.includes('cyclic'),
 generateSuggestion: () => 
   `Detected a circular dependency. Restructure your imports to break the circular reference.`
},
// Export not found in module
{
 test: (error: ImportError) => 
   error.message.includes('export'),
 generateSuggestion: (error: ImportError) => {
   const exportMatch = error.message.match(/export\s+['"]([^'"]+)['"]/i);
   if (exportMatch) {
     return `Could not find export '${exportMatch[1]}' in module '${error.importPath}'. Make sure it's exported correctly.`;
   }
   return `The requested export was not found in module '${error.importPath}'.`;
 }
}
],

// Runtime errors
'RuntimeError': [
// Undefined variable
{
 test: (error: RuntimeError) => 
   error.message.includes('undefined') || error.message.includes('not defined'),
 generateSuggestion: () => 
   `Variable is not defined. Make sure it's declared before use or check for typos in the variable name.`
},
// Cannot read property
{
 test: (error: RuntimeError) => 
   error.message.includes('cannot read') || error.message.includes('undefined') || error.message.includes('null'),
 generateSuggestion: () => 
   `Trying to access a property on undefined or null. Check that the object exists before accessing its properties.`
},
// Type error at runtime
{
 test: (error: RuntimeError) => 
   error.message.includes('is not a function') || error.message.includes('is not a constructor'),
 generateSuggestion: () => 
   `Type error at runtime. Make sure you're using the correct type and calling functions properly.`
}
]
};

/**
* Generate a suggestion for a given error
*/
export function generateSuggestion(error: any): string | undefined {
if (!error) return undefined;

// Get the error type from the error object
const errorType = error.name || 'UnknownError';

// Get patterns for this error type
const patterns = ERROR_PATTERNS[errorType] || [];

// Try to match a pattern
for (const pattern of patterns) {
if (pattern.test(error)) {
 return pattern.generateSuggestion(error);
}
}

// No specific pattern matched, try generic suggestions
if (error.message) {
if (error.message.includes('expected') && error.message.includes('got')) {
 return `Check your syntax. The compiler expected something different at this location.`;
}

if (error.message.includes('reference') || error.message.includes('undefined')) {
 return `Make sure all variables and functions are defined before they're used.`;
}
}

// No suggestion found
return undefined;
}

/**
* Add a suggestion to an error if it doesn't already have one
*/
export function addSuggestionToError(error: any): any {
if (!error || error.suggestion) return error;

const suggestion = generateSuggestion(error);
if (suggestion) {
error.suggestion = suggestion;
}

return error;
}