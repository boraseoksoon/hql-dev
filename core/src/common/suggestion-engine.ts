/**
 * suggestion-engine.ts
 * 
 * Provides intelligent suggestions for common HQL errors
 * to help users quickly identify and fix issues.
 */

// Registry of valid HQL identifiers (functions, variables, keywords)
// This should be populated during initialization or from the standard library
const knownIdentifiers = new Set<string>([
  // Common HQL functions
  'print', 'println', 'js-call', 'js-eval', 'import', 'export',
  'fn', 'let', 'const', 'var', 'if', 'else', 'cond', 'when', 'do',
  'while', 'for', 'match', 'case', 'enum', 'type', 'interface',
  // Math functions
  'add', 'sub', 'mul', 'div', 'mod', 'pow',
  // Logical operators
  'and', 'or', 'not', 'xor',
  // Comparison operators
  '=', '!=', '>', '<', '>=', '<=',
  // Collection operations
  'map', 'filter', 'reduce', 'forEach', 'some', 'every',
]);

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Find closest matching identifiers
 */
export function findSimilarIdentifiers(
  name: string, 
  maxDistance: number = 2
): string[] {
  const candidates: Array<{ name: string; distance: number }> = [];

  for (const id of knownIdentifiers) {
    // Skip if the length difference is too great
    if (Math.abs(id.length - name.length) > maxDistance) {
      continue;
    }

    const distance = levenshteinDistance(name, id);
    if (distance <= maxDistance) {
      candidates.push({ name: id, distance });
    }
  }

  // Sort by distance (closest first)
  candidates.sort((a, b) => a.distance - b.distance);

  // Return just the names, limited to top 3
  return candidates.slice(0, 3).map(c => c.name);
}

/**
 * Add an identifier to the known identifiers registry
 */
export function registerIdentifier(name: string): void {
  knownIdentifiers.add(name);
}

/**
 * Register multiple identifiers
 */
export function registerIdentifiers(names: string[]): void {
  for (const name of names) {
    knownIdentifiers.add(name);
  }
}

/**
 * Generate a suggestion for undefined identifier errors
 */
export function suggestForUndefinedIdentifier(name: string): string {
  const similarIds = findSimilarIdentifiers(name);
  
  if (similarIds.length > 0) {
    if (similarIds.length === 1) {
      return `Did you mean '${similarIds[0]}'?`;
    } else {
      return `Did you mean one of these: ${similarIds.join(', ')}?`;
    }
  }
  
  // Basic suggestions based on common patterns
  if (name.startsWith('get')) {
    return `Check if '${name}' is defined. For property access, try using dot notation or (get obj "property").`;
  }
  
  if (name.endsWith('s') && knownIdentifiers.has(name.slice(0, -1))) {
    return `Did you mean '${name.slice(0, -1)}'? (without the 's')`;
  }
  
  if (!name.includes('-') && name.includes('_')) {
    const kebabCase = name.replace(/_/g, '-');
    if (knownIdentifiers.has(kebabCase)) {
      return `Did you mean '${kebabCase}'? (HQL uses kebab-case, not snake_case)`;
    }
  }
  
  return `Make sure '${name}' is defined before use, or check for typos.`;
}

/**
 * Suggest fixes for syntax errors
 */
export function suggestForSyntaxError(message: string): string {
  // Unclosed delimiters
  if (message.includes('unclosed') || message.includes('missing closing')) {
    const delimMap: Record<string, string> = {
      'parenthesis': ')',
      'bracket': ']',
      'brace': '}',
      'string': '"',
    };
    
    for (const [name, char] of Object.entries(delimMap)) {
      if (message.includes(name)) {
        return `Make sure all ${name} are properly closed with '${char}'.`;
      }
    }
    
    return 'Check for missing closing delimiters like ), ], }, or ".';
  }
  
  // Unexpected tokens
  if (message.includes('unexpected token') || message.includes('unexpected character')) {
    for (const token of [')', ']', '}']) {
      if (message.includes(`unexpected '${token}'`)) {
        const openingChar = token === ')' ? '(' : token === ']' ? '[' : '{';
        return `Check for a missing opening '${openingChar}' or an extra '${token}'.`;
      }
    }
    
    return 'Check for typos or incorrect syntax at this location.';
  }
  
  // Expected but got
  if (message.includes('expected') && message.includes('but got')) {
    return 'The syntax is incorrect. Check the HQL documentation for the correct syntax.';
  }
  
  // Default
  return 'Check the syntax around this location for errors.';
}

/**
 * Generate suggestion based on error type and message
 */
export function generateSuggestion(errorType: string, message: string, identifier?: string): string {
  // Handle reference errors (undefined variables/functions)
  if (errorType === 'ReferenceError' || message.includes('is not defined')) {
    if (identifier) {
      return suggestForUndefinedIdentifier(identifier);
    }
    
    // Try to extract the identifier from the message
    const match = message.match(/(?:'|"|`)([^'"`]+)(?:'|"|`)\s+is\s+not\s+defined/);
    if (match && match[1]) {
      return suggestForUndefinedIdentifier(match[1]);
    }
  }
  
  // Handle syntax errors
  if (errorType === 'SyntaxError' || errorType === 'ParseError') {
    return suggestForSyntaxError(message);
  }
  
  // Handle type errors
  if (errorType === 'TypeError') {
    if (message.includes('is not a function')) {
      const match = message.match(/([^\s]+)\s+is\s+not\s+a\s+function/);
      if (match && match[1]) {
        return `'${match[1]}' is not a function. Check if it's spelled correctly or if you need to import it.`;
      }
    }
    
    return 'Check the types of your values and make sure they match the expected types.';
  }
  
  // Default suggestion
  return 'Check your code for syntax errors or incorrect types.';
} 