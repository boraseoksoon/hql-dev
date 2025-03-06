// src/utils.ts
// Core utilities that don't have external dependencies

/**
 * Convert kebab-case to camelCase
 * @param name String to convert
 * @returns camelCase version of the input
 */
export function hyphenToCamel(name: string): string {
  if (!name || typeof name !== 'string') {
    return name;
  }
  
  // First handle special characters that aren't valid in JavaScript identifiers
  let result = name.replace(/\?/g, '_p')  // Replace ? with _p (predicate)
                   .replace(/!/g, '_')    // Replace ! with _ (mutation)
                   .replace(/&/g, '_rest'); // Replace & with _rest (rest params)
  
  // Then handle kebab-case to camelCase conversion
  result = result.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  
  // Check for JavaScript reserved keywords
  const reservedKeywords = [
    'var', 'let', 'const', 'function', 'class', 'return', 'if', 'else', 'switch', 'case',
    'break', 'continue', 'for', 'while', 'do', 'try', 'catch', 'finally', 'throw', 'new',
    'delete', 'typeof', 'instanceof', 'void', 'in', 'of', 'with', 'default', 'extends',
    'implements', 'interface', 'package', 'private', 'protected', 'public', 'static', 'yield',
    'await', 'enum', 'eval', 'arguments', 'debugger', 'export', 'import', 'super', 'this'
  ];
  
  if (reservedKeywords.includes(result)) {
    return `_${result}`;  // Prefix with underscore if it's a reserved keyword
  }
  
  return result;
}