import {
  SemanticTokens,
  SemanticTokensBuilder,
  SemanticTokensLegend,
  TextDocument
} from 'vscode-languageserver/node';

// Define token types that map to VS Code's semantic token types
export const tokenTypes = [
  'keyword',      // keywords (prioritized first)
  'function',     // functions
  'variable',     // variables
  'parameter',    // function parameters
  'property',     // properties, fields
  'type',         // type references
  'enum',         // enum case
  'comment',      // comments
  'string',       // strings
  'number'        // numbers
];

// Define token modifiers that map to VS Code's semantic token modifiers
export const tokenModifiers = [
  'declaration',  // declarations
  'definition',   // definitions
  'readonly'      // constants
];

// Create a legend for semantic tokens
export const legend: SemanticTokensLegend = {
  tokenTypes,
  tokenModifiers
};

// Keywords in HQL for highlighting
const HQL_KEYWORDS = [
  // Core language keywords
  'import', 'export', 'from', 'as', 'module',
  'def', 'var', 'let', 'fx', 'fn', 'defmacro', 'macro',
  'if', 'loop', 'recur', 'cond', 'when', 'unless', 'else',
  'for', 'while', 'class', 'method', 'constructor',
  'do', 'repeat', 'set!', 'return', '->', '&', 
  'from:', 'to:', 'by:', 'enum', 'case', 
  
  // Control flow related
  'if-let', 'when-let', 'and', 'or', 'not',
  
  // Types
  'Any', 'Int', 'Double', 'String', 'Bool', 'Array',
  
  // Common HQL macros
  'str', 'inc', 'dec', 'contains?', 'eq?'
];

// Special constants
const HQL_CONSTANTS = [
  'nil', 'null', 'true', 'false',
  'undefined', 'NaN', 'Infinity'
];

export class SemanticTokenProvider {
  
  /**
   * Provide semantic tokens for a document
   */
  public provideSemanticTokens(document: TextDocument): SemanticTokens {
    const builder = new SemanticTokensBuilder();
    const text = document.getText();
    
    // Process keywords - this is the most important part for highlighting
    this.processKeywords(document, text, builder);
    
    return builder.build();
  }
  
  /**
   * Process HQL keywords
   */
  private processKeywords(document: TextDocument, text: string, builder: SemanticTokensBuilder): void {
    // Create a set for faster lookup
    const keywordSet = new Set(HQL_KEYWORDS);
    
    // First pass: Process all keywords directly without conditions
    // This ensures we catch all keywords regardless of position
    const allKeywordsRegex = new RegExp(`\\b(${HQL_KEYWORDS.join('|')})\\b`, 'g');
    
    let match;
    while ((match = allKeywordsRegex.exec(text)) !== null) {
      const startPos = match.index;
      const word = match[0];
      const line = document.positionAt(startPos).line;
      const character = document.positionAt(startPos).character;
      
      // Always add keyword tokens - no conditions
      builder.push(line, character, word.length, this.getTokenTypeIndex('keyword'), 0);
    }
    
    // Special handling for parenthesized keywords to ensure they're caught
    const parenKeywordRegex = /\((\s*)([a-zA-Z\-_][a-zA-Z0-9\-_\?!]*)/g;
    
    while ((match = parenKeywordRegex.exec(text)) !== null) {
      const keywordStart = match.index + match[1].length + 1; // +1 for opening paren
      const keyword = match[2];
      
      // Only process if it's a known keyword
      if (keywordSet.has(keyword)) {
        const line = document.positionAt(keywordStart).line;
        const character = document.positionAt(keywordStart).character;
        
        // Add token as 'keyword'
        builder.push(line, character, keyword.length, this.getTokenTypeIndex('keyword'), 0);
      }
    }
  }
  
  /**
   * Get the index of a token type in our legend
   */
  private getTokenTypeIndex(tokenType: string): number {
    const index = tokenTypes.indexOf(tokenType);
    return index !== -1 ? index : 0;
  }
  
  /**
   * Get the index of a token modifier in our legend
   */
  private getTokenModifierIndex(tokenModifier: string): number {
    const index = tokenModifiers.indexOf(tokenModifier);
    return index !== -1 ? index : 0;
  }
} 