/**
 * Shared parser module
 * This is a simplified version of the parser for use in the LSP
 */

export * from './types';

import {
  createList,
  createLiteral,
  createNilLiteral,
  createSymbol,
  createStringLiteral,
  createNumberLiteral,
  createBooleanLiteral,
  SExp,
  SList,
  SourcePosition
} from './types';

/**
 * Parser error class
 */
export class ParseError extends Error {
  constructor(
    message: string, 
    public position: SourcePosition,
    public source?: string
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

/**
 * Basic token types for the lexer
 */
enum TokenType {
  LeftParen,
  RightParen,
  LeftBracket,
  RightBracket,
  LeftBrace,
  RightBrace,
  String,
  Number,
  Symbol,
  Comment,
  Whitespace,
}

interface Token {
  type: TokenType;
  value: string;
  position: SourcePosition;
}

const TOKEN_PATTERNS = {
  SPECIAL_TOKENS: /^(\(|\)|\[|\]|\{|\})/,
  STRING: /^"(?:\\.|[^\\"])*"/,
  COMMENT: /^(;.*|\/\/.*|\/\*[\s\S]*?\*\/)/,
  WHITESPACE: /^\s+/,
  SYMBOL: /^[^\s\(\)\[\]\{\}"';]+/,
};

/**
 * Parse a string into S-expressions
 * @param input The string to parse
 * @param tolerant Whether to tolerate syntax errors and return partial results
 */
export function parse(input: string, tolerant: boolean = false): SExp[] {
  try {
    const tokens = tokenize(input);
    return parseTokens(tokens, input, tolerant);
  } catch (error) {
    if (tolerant) {
      // In tolerant mode, return as much as we can
      return [createSymbol("error")];
    }
    if (error instanceof ParseError) {
      throw error;
    }
    throw new ParseError(
      String(error), 
      { line: 1, column: 1, offset: 0 },
      input
    );
  }
}

/**
 * Tokenize an input string
 */
function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let remaining = input, line = 1, column = 1, offset = 0;
  
  while (remaining.length > 0) {
    // Match whitespace
    let match = remaining.match(TOKEN_PATTERNS.WHITESPACE);
    if (match) {
      const value = match[0];
      // Count newlines for position tracking
      const newlines = (value.match(/\n/g) || []).length;
      if (newlines > 0) {
        line += newlines;
        const lastNewlineIndex = value.lastIndexOf('\n');
        column = value.length - lastNewlineIndex;
      } else {
        column += value.length;
      }
      offset += value.length;
      remaining = remaining.substring(value.length);
      continue;
    }
    
    // Match comments
    match = remaining.match(TOKEN_PATTERNS.COMMENT);
    if (match) {
      const value = match[0];
      // Count newlines for position tracking
      const newlines = (value.match(/\n/g) || []).length;
      if (newlines > 0) {
        line += newlines;
        const lastNewlineIndex = value.lastIndexOf('\n');
        column = value.length - lastNewlineIndex;
      } else {
        column += value.length;
      }
      offset += value.length;
      remaining = remaining.substring(value.length);
      continue;
    }
    
    // Match string literals
    match = remaining.match(TOKEN_PATTERNS.STRING);
    if (match) {
      const value = match[0];
      tokens.push({
        type: TokenType.String,
        value,
        position: { line, column, offset }
      });
      column += value.length;
      offset += value.length;
      remaining = remaining.substring(value.length);
      continue;
    }
    
    // Match special tokens (parentheses, brackets)
    match = remaining.match(TOKEN_PATTERNS.SPECIAL_TOKENS);
    if (match) {
      const value = match[0];
      let type: TokenType;
      
      switch (value) {
        case '(': type = TokenType.LeftParen; break;
        case ')': type = TokenType.RightParen; break;
        case '[': type = TokenType.LeftBracket; break;
        case ']': type = TokenType.RightBracket; break;
        case '{': type = TokenType.LeftBrace; break;
        case '}': type = TokenType.RightBrace; break;
        default: throw new Error(`Unknown special token: ${value}`);
      }
      
      tokens.push({
        type,
        value,
        position: { line, column, offset }
      });
      column += value.length;
      offset += value.length;
      remaining = remaining.substring(value.length);
      continue;
    }
    
    // Match symbols and numbers
    match = remaining.match(TOKEN_PATTERNS.SYMBOL);
    if (match) {
      const value = match[0];
      const type = !isNaN(Number(value)) ? TokenType.Number : TokenType.Symbol;
      
      tokens.push({
        type,
        value,
        position: { line, column, offset }
      });
      column += value.length;
      offset += value.length;
      remaining = remaining.substring(value.length);
      continue;
    }
    
    // If nothing matched, skip one character
    tokens.push({
      type: TokenType.Symbol,
      value: remaining[0],
      position: { line, column, offset }
    });
    column += 1;
    offset += 1;
    remaining = remaining.substring(1);
  }
  
  return tokens;
}

interface ParserState {
  tokens: Token[];
  currentPos: number;
  input: string;
  tolerant?: boolean;
}

/**
 * Parse tokens into S-expressions
 */
function parseTokens(tokens: Token[], input: string, tolerant: boolean = false): SExp[] {
  const state: ParserState = { tokens, currentPos: 0, input, tolerant };
  const expressions: SExp[] = [];
  
  while (state.currentPos < tokens.length) {
    try {
      expressions.push(parseExpression(state));
    } catch (error) {
      if (tolerant) {
        // In tolerant mode, skip to the next expression on error
        state.currentPos++;
        continue;
      }
      throw error;
    }
  }
  
  return expressions;
}

/**
 * Parse a single expression
 */
function parseExpression(state: ParserState): SExp {
  if (state.currentPos >= state.tokens.length) {
    throw new ParseError(
      "Unexpected end of input",
      state.tokens.length > 0 
        ? state.tokens[state.tokens.length - 1].position 
        : { line: 1, column: 1, offset: 0 },
      state.input
    );
  }
  
  const token = state.tokens[state.currentPos++];
  
  switch (token.type) {
    case TokenType.LeftParen:
      return parseList(state, token.position);
    
    case TokenType.RightParen:
      throw new ParseError("Unexpected ')'", token.position, state.input);
      
    case TokenType.LeftBracket:
      return parseVector(state, token.position);
      
    case TokenType.RightBracket:
      throw new ParseError("Unexpected ']'", token.position, state.input);
      
    case TokenType.LeftBrace:
      return parseMap(state, token.position);
      
    case TokenType.RightBrace:
      throw new ParseError("Unexpected '}'", token.position, state.input);
      
    case TokenType.String:
      return parseString(token.value, token.position);
      
    case TokenType.Number:
      return createNumberLiteral(Number(token.value), token.position);
      
    case TokenType.Symbol:
      return parseSymbol(token.value, token.position);
      
    default:
      throw new ParseError(`Unknown token type: ${token.type}`, token.position, state.input);
  }
}

/**
 * Parse a list (expressions in parentheses)
 */
function parseList(state: ParserState, position: SourcePosition): SList {
  const elements: SExp[] = [];
  
  while (state.currentPos < state.tokens.length) {
    const token = state.tokens[state.currentPos];
    
    if (token.type === TokenType.RightParen) {
      state.currentPos++;
      return createList(elements, position);
    }
    
    try {
      elements.push(parseExpression(state));
    } catch (error) {
      if (state.tolerant) {
        // In tolerant mode, skip problematic tokens
        state.currentPos++;
        // Add a placeholder for the skipped element
        elements.push(createSymbol("error", token.position));
        continue;
      }
      throw error;
    }
  }
  
  if (state.tolerant) {
    // In tolerant mode, just return the partial list
    return createList(elements, position);
  }
  
  throw new ParseError(
    "Unclosed parenthesis",
    state.tokens[state.currentPos - 1].position,
    state.input
  );
}

/**
 * Parse a vector (expressions in square brackets)
 */
function parseVector(state: ParserState, position: SourcePosition): SList {
  const elements: SExp[] = [];
  elements.push(createSymbol("vector", position));
  
  while (state.currentPos < state.tokens.length) {
    const token = state.tokens[state.currentPos];
    
    if (token.type === TokenType.RightBracket) {
      state.currentPos++;
      return createList(elements, position);
    }
    
    try {
      elements.push(parseExpression(state));
    } catch (error) {
      if (state.tolerant) {
        // In tolerant mode, skip problematic tokens
        state.currentPos++;
        // Add a placeholder for the skipped element
        elements.push(createSymbol("error", token.position));
        continue;
      }
      throw error;
    }
  }
  
  if (state.tolerant) {
    // In tolerant mode, just return the partial vector
    return createList(elements, position);
  }
  
  throw new ParseError(
    "Unclosed bracket",
    state.tokens[state.currentPos - 1].position,
    state.input
  );
}

/**
 * Parse a map (expressions in curly braces)
 */
function parseMap(state: ParserState, position: SourcePosition): SList {
  const elements: SExp[] = [];
  elements.push(createSymbol("hash-map", position));
  
  while (state.currentPos < state.tokens.length) {
    const token = state.tokens[state.currentPos];
    
    if (token.type === TokenType.RightBrace) {
      state.currentPos++;
      return createList(elements, position);
    }
    
    try {
      elements.push(parseExpression(state));
    } catch (error) {
      if (state.tolerant) {
        // In tolerant mode, skip problematic tokens
        state.currentPos++;
        // Add a placeholder for the skipped element
        elements.push(createSymbol("error", token.position));
        continue;
      }
      throw error;
    }
  }
  
  if (state.tolerant) {
    // In tolerant mode, just return the partial map
    return createList(elements, position);
  }
  
  throw new ParseError(
    "Unclosed brace",
    state.tokens[state.currentPos - 1].position,
    state.input
  );
}

/**
 * Parse a string literal
 */
function parseString(value: string, position: SourcePosition): SExp {
  // Remove quotes and handle basic escaping
  const content = value.slice(1, -1)
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
  return createStringLiteral(content, position);
}

/**
 * Parse a symbol or literal value
 */
function parseSymbol(value: string, position: SourcePosition): SExp {
  if (value === "true") return createBooleanLiteral(true, position);
  if (value === "false") return createBooleanLiteral(false, position);
  if (value === "nil") return createNilLiteral(position);
  
  const num = Number(value);
  if (!isNaN(num) && value.trim() !== '') {
    return createNumberLiteral(num, position);
  }
  
  return createSymbol(value, position);
} 