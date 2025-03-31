// src/s-exp/parser.ts - Clean implementation focused on chain method invocation

import {
  createList,
  createLiteral,
  createNilLiteral,
  createSymbol,
  SExp,
  SList,
} from "./types.ts";
import { ParseError } from "../transpiler/errors.ts";
import { perform } from "../transpiler/error-utils.ts";

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
  Whitespace,
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
  SYMBOL: /^[^\s\(\)\[\]\{\}"'`,;]+/,
};

/**
 * Parse HQL source into S-expressions with error location context
 */
export function parse(input: string): SExp[] {
  const tokens = tokenize(input);
  return parseTokens(tokens, input);
}

/**
 * Tokenize the input string using regex patterns.
 */
function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let remaining = input;
  let line = 1;
  let column = 1;
  let offset = 0;

  while (remaining.length > 0) {
    const token = matchNextToken(remaining, line, column, offset);

    // Skip comments and whitespace
    if (
      token.type === TokenType.Comment ||
      token.type === TokenType.Whitespace
    ) {
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
}

/**
 * Match the next token in the input string
 */
function matchNextToken(
  input: string,
  line: number,
  column: number,
  offset: number,
): Token {
  const position = { line, column, offset };

  // Try to match special tokens first
  let match = input.match(TOKEN_PATTERNS.SPECIAL_TOKENS);
  if (match) {
    return {
      type: getTokenTypeForSpecial(match[0]),
      value: match[0],
      position,
    };
  }

  // Try to match string literals
  match = input.match(TOKEN_PATTERNS.STRING);
  if (match) {
    return {
      type: TokenType.String,
      value: match[0],
      position,
    };
  }

  // Try to match comments
  match = input.match(TOKEN_PATTERNS.COMMENT);
  if (match) {
    return {
      type: TokenType.Comment,
      value: match[0],
      position,
    };
  }

  // Try to match whitespace
  match = input.match(TOKEN_PATTERNS.WHITESPACE);
  if (match) {
    return {
      type: TokenType.Whitespace,
      value: match[0],
      position,
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
        position,
      };
    }
    return {
      type: TokenType.Symbol,
      value,
      position,
    };
  }

  // If we get here, we have an unexpected character
  throw new ParseError(
    `Unexpected character: ${input[0]}`,
    position,
    input,
  );
}

/**
 * Get token type for special tokens
 */
function getTokenTypeForSpecial(value: string): TokenType {
  switch (value) {
    case "(":
      return TokenType.LeftParen;
    case ")":
      return TokenType.RightParen;
    case "[":
      return TokenType.LeftBracket;
    case "]":
      return TokenType.RightBracket;
    case "{":
      return TokenType.LeftBrace;
    case "}":
      return TokenType.RightBrace;
    case "#[":
      return TokenType.HashLeftBracket;
    case ".":
      return TokenType.Dot;
    case ":":
      return TokenType.Colon;
    case ",":
      return TokenType.Comma;
    case "'":
      return TokenType.Quote;
    case "`":
      return TokenType.Backtick;
    case "~":
      return TokenType.Unquote;
    case "~@":
      return TokenType.UnquoteSplicing;
    default:
      return TokenType.Symbol; // Should never happen
  }
}

/**
 * Update line and column information as we process tokens
 */
function updatePositionInfo(value: string, position: SourcePosition): void {
  for (const char of value) {
    if (char === "\n") {
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
    input,
  };

  const nodes: SExp[] = [];

  while (state.currentPos < state.tokens.length) {
    nodes.push(parseExpression(state));
  }

  return nodes;
}

// Parser state interface for clean encapsulation of parse state
interface ParserState {
  tokens: Token[];
  currentPos: number;
  input: string;
}

/**
 * Parse a single expression from the token stream
 */
function parseExpression(state: ParserState): SExp {
  return perform(
    () => {
      if (state.currentPos >= state.tokens.length) {
        const lastPos = state.tokens.length > 0
          ? state.tokens[state.tokens.length - 1].position
          : { line: 1, column: 1, offset: 0 };

        throw new ParseError(
          "Unexpected end of input",
          lastPos,
          state.input,
        );
      }

      const token = state.tokens[state.currentPos++];

      return parseExpressionByTokenType(token, state);
    },
    "Error parsing expression",
    ParseError,
    [
      state.currentPos < state.tokens.length
        ? state.tokens[state.currentPos].position
        : { line: 1, column: 1, offset: 0 },
      state.input,
    ],
  );
}

/**
 * Parse an expression based on the token type
 */
function parseExpressionByTokenType(token: Token, state: ParserState): SExp {
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
      return createList(createSymbol("quote"), parseExpression(state));

    case TokenType.Backtick:
      return createList(createSymbol("quasiquote"), parseExpression(state));

    case TokenType.Unquote:
      return createList(createSymbol("unquote"), parseExpression(state));

    case TokenType.UnquoteSplicing:
      return createList(
        createSymbol("unquote-splicing"),
        parseExpression(state),
      );

    case TokenType.Comma:
      return createSymbol(",");

    case TokenType.Dot:
      // Special handling for dot notation
      return parseDotAccess(state, token);

    case TokenType.String:
      return parseStringLiteral(token.value);

    case TokenType.Number:
      return createLiteral(Number(token.value));

    case TokenType.Symbol:
      return parseSymbol(token.value);

    default:
      throw new ParseError(
        `Unexpected token type: ${token.type}`,
        token.position,
        state.input,
      );
  }
}

/**
 * Parse a dot access expression
 */
function parseDotAccess(state: ParserState, dotToken: Token): SExp {
  // Handle property access after a parenthesized expression
  if (state.currentPos < state.tokens.length) {
    const nextToken = state.tokens[state.currentPos++];
    // Create a dot-prefixed symbol for the method (e.g., .methodName)
    // This enables the syntax transformer to detect chain methods
    return createSymbol("." + nextToken.value);
  } else {
    throw new ParseError(
      "Expected property name after '.'",
      dotToken.position,
      state.input,
    );
  }
}

/**
 * Parse a string literal
 */
function parseStringLiteral(tokenValue: string): SExp {
  const str = tokenValue.slice(1, -1).replace(/\\"/g, '"').replace(
    /\\\\/g,
    "\\",
  );
  return createLiteral(str);
}

/**
 * Parse a symbol
 * This is a key function for chain method invocation
 */
function parseSymbol(tokenValue: string): SExp {
  if (tokenValue === "true") {
    return createLiteral(true);
  } else if (tokenValue === "false") {
    return createLiteral(false);
  } else if (tokenValue === "nil") {
    return createNilLiteral();
  } else if (tokenValue.startsWith(".")) {
    // Important for chain methods: preserve dot-prefixed method symbols
    return createSymbol(tokenValue);
  } else {
    // Handle dot notation in properties (obj.prop)
    if (
      tokenValue.includes(".") && !tokenValue.startsWith(".") &&
      !tokenValue.endsWith(".")
    ) {
      return parseDotNotation(tokenValue);
    }

    return createSymbol(tokenValue);
  }
}

/**
 * Parse dot notation in symbols (e.g., object.property)
 */
function parseDotNotation(tokenValue: string): SExp {
  const parts = tokenValue.split(".");
  const objectName = parts[0];
  const propertyPath = parts.slice(1).join(".");

  // If property contains dashes, transform to a get call
  if (propertyPath.includes("-")) {
    // Return a list that represents (get objectName "propertyPath")
    return createList(
      createSymbol("get"),
      createSymbol(objectName),
      createLiteral(propertyPath),
    );
  }

  // Return the symbol with dot notation preserved
  return createSymbol(tokenValue);
}

/**
 * Parse a list expression: (element1 element2 ...)
 */
function parseList(state: ParserState): SList {
  const listStartPos = state.tokens[state.currentPos - 1].position;
  const elements: SExp[] = [];

  while (
    state.currentPos < state.tokens.length &&
    state.tokens[state.currentPos].type !== TokenType.RightParen
  ) {
    elements.push(parseExpression(state));
  }

  // Ensure list is properly closed
  if (state.currentPos >= state.tokens.length) {
    throw new ParseError(
      "Unclosed list",
      listStartPos,
      state.input,
    );
  }

  state.currentPos++; // Skip closing parenthesis

  return createList(...elements);
}

/**
 * Parse a vector: [element1, element2, ...]
 */
function parseVector(state: ParserState): SList {
  const startPos = state.tokens[state.currentPos - 1].position;
  const elements: SExp[] = [];

  // Parse vector elements, handling commas
  while (
    state.currentPos < state.tokens.length &&
    state.tokens[state.currentPos].type !== TokenType.RightBracket
  ) {
    elements.push(parseExpression(state));

    // Skip comma if present
    if (
      state.currentPos < state.tokens.length &&
      state.tokens[state.currentPos].type === TokenType.Comma
    ) {
      state.currentPos++;
    }
  }

  // Ensure vector is properly closed
  if (state.currentPos >= state.tokens.length) {
    throw new ParseError(
      "Unclosed vector",
      startPos,
      state.input,
    );
  }

  state.currentPos++; // Skip closing bracket

  // For empty vector, return a special empty array literal
  if (elements.length === 0) {
    return createList(createSymbol("empty-array"));
  }

  // Return a vector with all elements
  return createList(createSymbol("vector"), ...elements);
}

/**
 * Parse a map: {key1: value1, key2: value2, ...}
 */
function parseMap(state: ParserState): SList {
  const startPos = state.tokens[state.currentPos - 1].position;
  const entries: SExp[] = [];

  // Parse key-value pairs
  while (
    state.currentPos < state.tokens.length &&
    state.tokens[state.currentPos].type !== TokenType.RightBrace
  ) {
    // Parse key
    const key = parseExpression(state);

    // Expect colon
    if (
      state.currentPos >= state.tokens.length ||
      state.tokens[state.currentPos].type !== TokenType.Colon
    ) {
      const errorPos = state.currentPos < state.tokens.length
        ? state.tokens[state.currentPos].position
        : startPos;
      throw new ParseError(
        "Expected ':' in map literal",
        errorPos,
        state.input,
      );
    }
    state.currentPos++; // Skip colon

    // Parse value
    const value = parseExpression(state);

    // Add key-value pair
    entries.push(key);
    entries.push(value);

    // Skip comma if present
    if (
      state.currentPos < state.tokens.length &&
      state.tokens[state.currentPos].type === TokenType.Comma
    ) {
      state.currentPos++;
    }
  }

  // Ensure map is properly closed
  if (state.currentPos >= state.tokens.length) {
    throw new ParseError(
      "Unclosed map",
      startPos,
      state.input,
    );
  }

  state.currentPos++; // Skip closing brace

  // For empty map, return a special empty map literal
  if (entries.length === 0) {
    return createList(createSymbol("empty-map"));
  }

  // Return a map with all entries
  return createList(createSymbol("hash-map"), ...entries);
}

/**
 * Parse a set: #[element1, element2, ...]
 */
function parseSet(state: ParserState): SList {
  const startPos = state.tokens[state.currentPos - 1].position;
  const elements: SExp[] = [];

  // Parse set elements
  while (
    state.currentPos < state.tokens.length &&
    state.tokens[state.currentPos].type !== TokenType.RightBracket
  ) {
    elements.push(parseExpression(state));

    // Skip comma if present
    if (
      state.currentPos < state.tokens.length &&
      state.tokens[state.currentPos].type === TokenType.Comma
    ) {
      state.currentPos++;
    }
  }

  // Ensure set is properly closed
  if (state.currentPos >= state.tokens.length) {
    throw new ParseError(
      "Unclosed set",
      startPos,
      state.input,
    );
  }

  state.currentPos++; // Skip closing bracket

  // For empty set, return a special empty set literal
  if (elements.length === 0) {
    return createList(createSymbol("empty-set"));
  }

  // Return a set with all elements
  return createList(createSymbol("hash-set"), ...elements);
}