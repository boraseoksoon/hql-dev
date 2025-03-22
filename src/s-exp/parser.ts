// src/s-exp/parser.ts - Refactored with better modularity and error handling

import { SExp, SList, isSymbol, createSymbol, createList, createLiteral, createNilLiteral } from './types.ts';
import { ParseError } from '../transpiler/errors.ts';
import { perform } from '../transpiler/error-utils.ts';

// Token types for better categorization
enum TokenType {
  LeftParen,
  RightParen,
  LeftBracket,
  RightBracket,
  LeftBrace,
  RightBrace,
  HashLeftBracket,
  String,
  Number,
  Symbol,
  Quote,
  Backtick,
  Unquote,
  UnquoteSplicing,
  Dot,
  Colon,
  Comma,
  Comment,
  Whitespace
}

// Token interface for cleaner type handling
interface Token {
  type: TokenType;
  value: string;
  position: SourcePosition;
}

// Position tracking for error reporting
interface SourcePosition {
  line: number;
  column: number;
  offset: number;
}

// Parser state interface for clean encapsulation of parse state
interface ParserState {
  tokens: Token[];
  currentPos: number;
  input: string;
}

// Regular expressions for tokenization
const TOKEN_PATTERNS = {
  // Special tokens
  SPECIAL_TOKENS: /^(#\[|\(|\)|\[|\]|\{|\}|\.|\:|,|'|`|~@|~)/,
  // String literals with escape handling
  STRING: /^"(?:\\.|[^\\"])*"/,
  // Comments (single line and multi-line)
  COMMENT: /^(;.*|\/\/.*|\/\*[\s\S]*?\*\/)/,
  // Whitespace
  WHITESPACE: /^\s+/,
  // Symbols and other tokens
  SYMBOL: /^[^\s\(\)\[\]\{\}"'`,;]+/
};

/**
 * Parse HQL source into S-expressions with error location context
 */
export function parse(input: string): SExp[] {
  return perform(() => {
    const tokens = tokenize(input);
    return parseTokens(tokens, input);
  }, "Failed to parse input", ParseError, [{ line: 1, column: 1, offset: 0 }, input]);
}

/**
 * Tokenize the input string using regex patterns.
 * This is a major improvement over character-by-character processing.
 */
function tokenize(input: string): Token[] {
  return perform(() => {
    const tokens: Token[] = [];
    let remaining = input;
    let line = 1;
    let column = 1;
    let offset = 0;
    
    while (remaining.length > 0) {
      const token = matchNextToken(remaining, line, column, offset);
      
      // Skip comments and whitespace
      if (token.type === TokenType.Comment || token.type === TokenType.Whitespace) {
        // Update tracking info
        updatePositionInfo(token.value, token.position);
      } else {
        tokens.push(token);
      }
      
      // Update position tracking and remaining input
      offset += token.value.length;
      remaining = remaining.substring(token.value.length);
      line = token.position.line;
      column = token.position.column + token.value.length;
    }
    
    return tokens;
  }, "Failed to tokenize input", ParseError, [{ line: 1, column: 1, offset: 0 }, input]);
}

/**
 * Match the next token in the input string
 */
function matchNextToken(input: string, line: number, column: number, offset: number): Token {
  const position = { line, column, offset };
  
  // Try to match special tokens first
  let match = input.match(TOKEN_PATTERNS.SPECIAL_TOKENS);
  if (match) {
    return {
      type: getTokenTypeForSpecial(match[0]),
      value: match[0],
      position
    };
  }
  
  // Try to match string literals
  match = input.match(TOKEN_PATTERNS.STRING);
  if (match) {
    return {
      type: TokenType.String,
      value: match[0],
      position
    };
  }
  
  // Try to match comments
  match = input.match(TOKEN_PATTERNS.COMMENT);
  if (match) {
    return {
      type: TokenType.Comment,
      value: match[0],
      position
    };
  }
  
  // Try to match whitespace
  match = input.match(TOKEN_PATTERNS.WHITESPACE);
  if (match) {
    return {
      type: TokenType.Whitespace,
      value: match[0],
      position
    };
  }
  
  // Try to match symbols and other tokens
  match = input.match(TOKEN_PATTERNS.SYMBOL);
  if (match) {
    const value = match[0];
    // Determine if it's a number
    if (!isNaN(Number(value))) {
      return {
        type: TokenType.Number,
        value,
        position
      };
    }
    return {
      type: TokenType.Symbol,
      value,
      position
    };
  }
  
  // If we get here, we have an unexpected character
  throw new ParseError(
    `Unexpected character: ${input[0]}`,
    position,
    input
  );
}

/**
 * Get token type for special tokens
 */
function getTokenTypeForSpecial(value: string): TokenType {
  switch (value) {
    case '(': return TokenType.LeftParen;
    case ')': return TokenType.RightParen;
    case '[': return TokenType.LeftBracket;
    case ']': return TokenType.RightBracket;
    case '{': return TokenType.LeftBrace;
    case '}': return TokenType.RightBrace;
    case '#[': return TokenType.HashLeftBracket;
    case '.': return TokenType.Dot;
    case ':': return TokenType.Colon;
    case ',': return TokenType.Comma;
    case "'": return TokenType.Quote;
    case '`': return TokenType.Backtick;
    case '~': return TokenType.Unquote;
    case '~@': return TokenType.UnquoteSplicing;
    default: return TokenType.Symbol; // Should never happen
  }
}

/**
 * Update line and column information as we process tokens
 */
function updatePositionInfo(value: string, position: SourcePosition): void {
  for (const char of value) {
    if (char === '\n') {
      position.line++;
      position.column = 1;
    } else {
      position.column++;
    }
  }
}

/**
 * Parse the tokens into S-expressions
 */
function parseTokens(tokens: Token[], input: string): SExp[] {
  const state: ParserState = {
    tokens,
    currentPos: 0,
    input
  };
  
  const nodes: SExp[] = [];
  
  while (state.currentPos < state.tokens.length) {
    nodes.push(parseExpression(state));
  }
  
  return nodes;
}

/**
 * Parse a single expression from the token stream
 */
function parseExpression(state: ParserState): SExp {
  return perform(() => {
    if (state.currentPos >= state.tokens.length) {
      const lastPos = state.tokens.length > 0 
        ? state.tokens[state.tokens.length - 1].position 
        : { line: 1, column: 1, offset: 0 };
      
      throw new ParseError(
        "Unexpected end of input",
        lastPos,
        state.input
      );
    }
    
    const token = state.tokens[state.currentPos++];
    
    return parseExpressionByTokenType(token, state);
  }, "Error parsing expression", ParseError, [
    state.currentPos < state.tokens.length 
      ? state.tokens[state.currentPos].position 
      : { line: 1, column: 1, offset: 0 },
    state.input
  ]);
}

/**
 * Parse an expression based on the token type
 */
function parseExpressionByTokenType(token: Token, state: ParserState): SExp {
  return perform(() => {
    switch (token.type) {
      case TokenType.LeftParen:
        return parseList(state);
      
      case TokenType.RightParen:
        throw new ParseError("Unexpected ')'", token.position, state.input);
      
      case TokenType.LeftBracket:
        return parseVector(state);
      
      case TokenType.RightBracket:
        throw new ParseError("Unexpected ']'", token.position, state.input);
      
      case TokenType.LeftBrace:
        return parseMap(state);
      
      case TokenType.RightBrace:
        throw new ParseError("Unexpected '}'", token.position, state.input);
      
      case TokenType.HashLeftBracket:
        return parseSet(state);
      
      case TokenType.Quote:
        return createList(createSymbol('quote'), parseExpression(state));
      
      case TokenType.Backtick:
        return createList(createSymbol('quasiquote'), parseExpression(state));
      
      case TokenType.Unquote:
        return createList(createSymbol('unquote'), parseExpression(state));
      
      case TokenType.UnquoteSplicing:
        return createList(createSymbol('unquote-splicing'), parseExpression(state));
      
      case TokenType.Comma:
        return createSymbol(',');
      
      case TokenType.Dot:
        return parseDotAccess(state, token);
      
      case TokenType.String:
        return parseStringLiteral(token.value);
      
      case TokenType.Number:
        return createLiteral(Number(token.value));
      
      case TokenType.Symbol:
        return parseSymbol(token.value);
      
      default:
        throw new ParseError(`Unexpected token type: ${token.type}`, token.position, state.input);
    }
  }, `Error parsing ${TokenType[token.type]}`, ParseError, [token.position, state.input]);
}

/**
 * Parse a dot access expression
 */
function parseDotAccess(state: ParserState, dotToken: Token): SExp {
  // Handle property access after a parenthesized expression
  if (state.currentPos < state.tokens.length) {
    const nextToken = state.tokens[state.currentPos++];
    return createSymbol("." + nextToken.value);
  } else {
    throw new ParseError("Expected property name after '.'", dotToken.position, state.input);
  }
}

/**
 * Parse a string literal
 */
function parseStringLiteral(tokenValue: string): SExp {
  const str = tokenValue.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  return createLiteral(str);
}

/**
 * Parse a symbol
 */
function parseSymbol(tokenValue: string): SExp {
  if (tokenValue === "true") {
    return createLiteral(true);
  } else if (tokenValue === "false") {
    return createLiteral(false);
  } else if (tokenValue === "nil") {
    return createNilLiteral();
  } else {
    // Handle dot notation with dashed properties
    if (tokenValue.includes('.') && !tokenValue.startsWith('.') && !tokenValue.endsWith('.')) {
      return parseDotNotation(tokenValue);
    }
    
    return createSymbol(tokenValue);
  }
}

/**
 * Parse dot notation in symbols
 */
function parseDotNotation(tokenValue: string): SExp {
  const parts = tokenValue.split('.');
  const objectName = parts[0];
  const propertyPath = parts.slice(1).join('.');
  
  // If property contains dashes, transform to a get call
  if (propertyPath.includes('-')) {
    // Return a list that represents (get objectName "propertyPath")
    return createList(
      createSymbol("get"),
      createSymbol(objectName),
      createLiteral(propertyPath)
    );
  }
  
  return createSymbol(tokenValue);
}

/**
 * Parse a list expression: (element1 element2 ...)
 */
function parseList(state: ParserState): SList {
  return perform(() => {
    const listStartPos = state.tokens[state.currentPos - 1].position;
    const elements: SExp[] = [];
    
    // Process the first token to see if it's a dot notation
    if (state.currentPos < state.tokens.length && 
        state.tokens[state.currentPos].type !== TokenType.RightParen &&
        isDotNotation(state.tokens[state.currentPos].value)) {
      
      const dotElements = parseDotNotationCall(state);
      elements.push(...dotElements);
    } else {
      // Standard list parsing
      parseStandardList(state, elements);
    }
    
    ensureClosingParenthesis(state, listStartPos);
    
    // Check if there's a dot after the list
    if (hasDotAccess(state)) {
      return parsePropertyAccessOnList(state, elements);
    }
    
    return createList(...elements);
  }, "Error parsing list", ParseError, [state.tokens[state.currentPos - 1].position, state.input]);
}

/**
 * Check if token value is dot notation
 */
function isDotNotation(value: string): boolean {
  return value.includes('.') && !value.startsWith('.') && !value.endsWith('.');
}

/**
 * Parse dot notation call
 */
function parseDotNotationCall(state: ParserState): SExp[] {
  // This is a dot notation expression - handle it explicitly
  const dotToken = state.tokens[state.currentPos++].value;
  
  // Split by dots to handle multi-part property paths
  const parts = dotToken.split('.');
  
  if (parts.length > 2) {
    // Multi-part property path like "obj.prop1.prop2"
    return parseMultiPartPropertyPath(parts, state);
  } else {
    // Simple property path like "obj.prop"
    return parseSimplePropertyPath(parts, state);
  }
}

/**
 * Parse multi-part property path
 */
function parseMultiPartPropertyPath(parts: string[], state: ParserState): SExp[] {
  const objectName = parts[0];
  const propPath = parts.slice(1);
  const elements: SExp[] = [];
  
  // Create expression based on whether it has arguments
  if (hasArguments(state)) {
    // Set up base elements for js-call
    elements.push(createSymbol("js-call"));
    elements.push(createSymbol(objectName));
    elements.push(createLiteral(propPath.join('.')));
    
    // Parse arguments
    while (state.currentPos < state.tokens.length && 
           state.tokens[state.currentPos].type !== TokenType.RightParen) {
      elements.push(parseExpression(state));
    }
  } else {
    // Property access without arguments
    elements.push(createSymbol("js-get-invoke"));
    elements.push(createSymbol(objectName));
    elements.push(createLiteral(propPath.join('.')));
  }
  
  return elements;
}

/**
 * Parse simple property path
 */
function parseSimplePropertyPath(parts: string[], state: ParserState): SExp[] {
  const objectName = parts[0];
  const property = parts[1];
  const elements: SExp[] = [];
  
  // If there are no additional arguments, treat it as a property access
  if (!hasArguments(state)) {
    // Create a property access node (using js-get-invoke)
    elements.push(createSymbol("js-get-invoke"));
    elements.push(createSymbol(objectName));
    elements.push(createLiteral(property));
  } else {
    // Otherwise, it's a method call - create a method call node (using js-call)
    elements.push(createSymbol("js-call"));
    elements.push(createSymbol(objectName));
    elements.push(createLiteral(property));
    
    // Parse arguments for the method call
    while (state.currentPos < state.tokens.length && 
           state.tokens[state.currentPos].type !== TokenType.RightParen) {
      elements.push(parseExpression(state));
    }
  }
  
  return elements;
}

/**
 * Check if there are arguments in the list
 */
function hasArguments(state: ParserState): boolean {
  return state.currentPos < state.tokens.length && 
         state.tokens[state.currentPos].type !== TokenType.RightParen;
}

/**
 * Parse standard list elements
 */
function parseStandardList(state: ParserState, elements: SExp[]): void {
  while (state.currentPos < state.tokens.length && 
         state.tokens[state.currentPos].type !== TokenType.RightParen) {
    elements.push(parseExpression(state));
  }
}

/**
 * Ensure closing parenthesis for a list
 */
function ensureClosingParenthesis(state: ParserState, listStartPos: SourcePosition): void {
  if (state.currentPos >= state.tokens.length) {
    throw new ParseError(
      "Unclosed list",
      listStartPos,
      state.input
    );
  }
  
  state.currentPos++; // Skip the closing parenthesis
}

/**
 * Check if there's a dot access after a list
 */
function hasDotAccess(state: ParserState): boolean {
  return state.currentPos < state.tokens.length && 
         state.tokens[state.currentPos].type === TokenType.Dot;
}

/**
 * Parse property access on a list result
 */
function parsePropertyAccessOnList(state: ParserState, elements: SExp[]): SList {
  state.currentPos++; // Skip the dot
  
  if (state.currentPos >= state.tokens.length) {
    throw new ParseError(
      "Expected property name after dot",
      state.tokens[state.currentPos - 1].position,
      state.input
    );
  }
  
  // Get the property/method name
  const propName = state.tokens[state.currentPos++].value;
  
  // Create a new list that represents property access on the original list result
  return createList(
    createSymbol("js-get-invoke"),
    createList(...elements), // Original list becomes the object
    createLiteral(propName)
  );
}

/**
 * Parse a vector: [element1, element2, ...]
 */
function parseVector(state: ParserState): SList {
  return perform(() => {
    const startPos = state.tokens[state.currentPos - 1].position;
    const elements: SExp[] = [];
    
    // Parse vector elements, handling 'as' aliases
    parseVectorElements(state, elements);
    
    // Ensure closing bracket
    if (state.currentPos >= state.tokens.length) {
      throw new ParseError(
        "Unclosed vector",
        startPos,
        state.input
      );
    }
    
    state.currentPos++; // Skip the closing bracket
    
    // For empty vector, return a special empty array literal
    if (elements.length === 0) {
      return createList(createSymbol("empty-array"));
    }
    
    // Return a vector with all elements
    return createList(createSymbol("vector"), ...elements);
  }, "Error parsing vector", ParseError, [state.tokens[state.currentPos - 1].position, state.input]);
}

/**
 * Parse vector elements, handling 'as' aliases
 */
function parseVectorElements(state: ParserState, elements: SExp[]): void {
  while (state.currentPos < state.tokens.length && 
         state.tokens[state.currentPos].type !== TokenType.RightBracket) {
    // Parse the current element
    const expr = parseExpression(state);
    elements.push(expr);
    
    // Check if this might be an 'as' alias construct
    if (isAsAliasConstruct(expr, state)) {
      parseAsAliasConstruct(state, elements);
    }
    
    // Skip comma if present
    skipComma(state);
  }
}

/**
 * Check if this is an 'as' alias construct
 */
function isAsAliasConstruct(expr: SExp, state: ParserState): boolean {
  return isSymbol(expr) && 
         state.currentPos < state.tokens.length && 
         state.tokens[state.currentPos].value === 'as';
}

/**
 * Parse an 'as' alias construct
 */
function parseAsAliasConstruct(state: ParserState, elements: SExp[]): void {
  // Add the 'as' symbol
  elements.push(createSymbol('as'));
  state.currentPos++; // Skip the 'as' token
  
  // Parse the alias name
  if (state.currentPos < state.tokens.length && 
      state.tokens[state.currentPos].type !== TokenType.Comma && 
      state.tokens[state.currentPos].type !== TokenType.RightBracket) {
    const alias = parseExpression(state);
    elements.push(alias);
  } else {
    const errorPos = state.currentPos < state.tokens.length 
      ? state.tokens[state.currentPos].position 
      : state.tokens[state.currentPos - 1].position;
    throw new ParseError(
      "Expected alias after 'as' keyword",
      errorPos,
      state.input
    );
  }
}

/**
 * Skip a comma token if present
 */
function skipComma(state: ParserState): void {
  if (state.currentPos < state.tokens.length && 
      state.tokens[state.currentPos].type === TokenType.Comma) {
    state.currentPos++;
  }
}

/**
 * Parse a map: {key1: value1, key2: value2, ...}
 */
function parseMap(state: ParserState): SList {
  return perform(() => {
    const startPos = state.tokens[state.currentPos - 1].position;
    const entries: SExp[] = [];
    
    // Parse key-value pairs
    parseMapEntries(state, entries, startPos);
    
    // Ensure closing brace
    if (state.currentPos >= state.tokens.length) {
      throw new ParseError(
        "Unclosed map",
        startPos,
        state.input
      );
    }
    
    state.currentPos++; // Skip the closing brace
    
    // For empty map, return a special empty map literal
    if (entries.length === 0) {
      return createList(createSymbol("empty-map"));
    }
    
    // For non-empty map, proceed with hash-map function
    return createList(createSymbol("hash-map"), ...entries);
  }, "Error parsing map", ParseError, [state.tokens[state.currentPos - 1].position, state.input]);
}

/**
 * Parse map entries (key-value pairs)
 */
function parseMapEntries(state: ParserState, entries: SExp[], startPos: SourcePosition): void {
  while (state.currentPos < state.tokens.length && 
         state.tokens[state.currentPos].type !== TokenType.RightBrace) {
    // Parse key
    const key = parseExpression(state);
    
    // Expect colon
    if (state.currentPos >= state.tokens.length || 
        state.tokens[state.currentPos].type !== TokenType.Colon) {
      const errorPos = state.currentPos < state.tokens.length 
        ? state.tokens[state.currentPos].position 
        : startPos;
      throw new ParseError(
        "Expected ':' in map literal",
        errorPos,
        state.input
      );
    }
    state.currentPos++; // Skip colon
    
    // Parse value
    const value = parseExpression(state);
    
    // Add key-value pair
    entries.push(key);
    entries.push(value);
    
    // Skip comma if present
    skipComma(state);
  }
}

/**
 * Parse a set: #[element1, element2, ...]
 */
function parseSet(state: ParserState): SList {
  return perform(() => {
    const startPos = state.tokens[state.currentPos - 1].position;
    const elements: SExp[] = [];
    
    // Parse set elements
    parseSetElements(state, elements);
    
    // Ensure closing bracket
    if (state.currentPos >= state.tokens.length) {
      throw new ParseError(
        "Unclosed set",
        startPos,
        state.input
      );
    }
    
    state.currentPos++; // Skip the closing bracket
    
    // For empty set, return a special empty set literal
    if (elements.length === 0) {
      return createList(createSymbol("empty-set"));
    }
    
    // For non-empty set, proceed with hash-set function
    return createList(createSymbol("hash-set"), ...elements);
  }, "Error parsing set", ParseError, [state.tokens[state.currentPos - 1].position, state.input]);
}

/**
 * Parse set elements
 */
function parseSetElements(state: ParserState, elements: SExp[]): void {
  while (state.currentPos < state.tokens.length && 
         state.tokens[state.currentPos].type !== TokenType.RightBracket) {
    elements.push(parseExpression(state));
    
    // Skip comma if present
    skipComma(state);
  }
}