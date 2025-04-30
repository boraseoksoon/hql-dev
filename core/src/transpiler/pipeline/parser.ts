// core/src/transpiler/pipeline/parser.ts

import {
  createList,
  createLiteral,
  createNilLiteral,
  createSymbol,
  SExp,
  SList,
  SSymbol,
  isSymbol
} from "../../s-exp/types.ts";
import { ParseError } from "../../common/error.ts";
import { attachSourceLocation } from "../../common/syntax-error-handler.ts";

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

interface Token {
  type: TokenType;
  value: string;
  position: SourcePosition;
}

interface SourcePosition {
  line: number;
  column: number;
  offset: number;
  filePath: string;
}

const TOKEN_PATTERNS = {
  SPECIAL_TOKENS: /^(#\[|\(|\)|\[|\]|\{|\}|\.|\:|,|'|`|~@|~)/,
  STRING: /^"(?:\\.|[^\\"])*"/,
  COMMENT: /^(;.*|\/\/.*|\/\*[\s\S]*?\*\/)/,
  WHITESPACE: /^\s+/,
  SYMBOL: /^[^\s\(\)\[\]\{\}"'`,;]+/,
};

export function parse(input: string, filePath: string = ""): SExp[] {
  const tokens = tokenize(input, filePath);
  
  // We don't call validateTokenBalance here to avoid regressions
  
  return parseTokens(tokens, input, filePath);
}

function tokenize(input: string, filePath: string): Token[] {
  const tokens: Token[] = [];
  let remaining = input, line = 1, column = 1, offset = 0;
  
  while (remaining.length > 0) {
    const token = matchNextToken(remaining, line, column, offset, filePath);
    
    if (token.type === TokenType.Comment || token.type === TokenType.Whitespace) {
      // Update position info but don't add these token types
      for (const char of token.value) {
        if (char === "\n") {
          line++;
          column = 1;
        } else {
          column++;
        }
      }
    } else {
      tokens.push(token);
    }
    
    offset += token.value.length;
    remaining = remaining.substring(token.value.length);
    if (token.type !== TokenType.Comment && token.type !== TokenType.Whitespace) {
      column += token.value.length;
    }
  }
  
  return tokens;
}

function getTokenTypeForSpecial(value: string): TokenType {
  switch (value) {
    case "(": return TokenType.LeftParen;
    case ")": return TokenType.RightParen;
    case "[": return TokenType.LeftBracket;
    case "]": return TokenType.RightBracket;
    case "{": return TokenType.LeftBrace;
    case "}": return TokenType.RightBrace;
    case "#[": return TokenType.HashLeftBracket;
    case ".": return TokenType.Dot;
    case ":": return TokenType.Colon;
    case ",": return TokenType.Comma;
    case "'": return TokenType.Quote;
    case "`": return TokenType.Backtick;
    case "~": return TokenType.Unquote;
    case "~@": return TokenType.UnquoteSplicing;
    default: return TokenType.Symbol;
  }
}

function parseTokens(tokens: Token[], input: string, filePath: string): SExp[] {
  const state: ParserState = { tokens, currentPos: 0, input, filePath };
  const nodes: SExp[] = [];
  
  while (state.currentPos < state.tokens.length) {
    nodes.push(parseExpression(state));
  }
  
  return nodes;
}

interface ParserState {
  tokens: Token[];
  currentPos: number;
  input: string;
  filePath: string;
}

function parseExpression(state: ParserState): SExp {
  if (state.currentPos >= state.tokens.length) {
    const lastPos = state.tokens.length > 0
      ? state.tokens[state.tokens.length - 1].position
      : { line: 1, column: 1, offset: 0, filePath: state.filePath };
    throw new ParseError("Unexpected end of input", lastPos);
  }
  
  const token = state.tokens[state.currentPos++];
  return parseExpressionByTokenType(token, state);
}

function parseExpressionByTokenType(token: Token, state: ParserState): SExp {
  let result: SExp;
  
  switch (token.type) {
    case TokenType.LeftParen: 
      result = parseList(state, token.position);
      break;
    case TokenType.RightParen: {
      const lineContext = getLineContext(state.input, token.position.line);
      throw new ParseError(
        `Unexpected ')' - Check for a missing opening '(' in previous lines.\nContext: ${lineContext}`, 
        token.position
      ); 
    }
    case TokenType.LeftBracket: 
      result = parseVector(state, token.position);
      break;
    case TokenType.RightBracket: 
      throw new ParseError(
        `Unexpected ']' - Check for a missing opening '[' in previous lines.`, 
        token.position
      );
    case TokenType.LeftBrace: 
      result = parseMap(state, token.position);
      break;
    case TokenType.RightBrace: 
      throw new ParseError(
        `Unexpected '}' - Check for a missing opening '{' in previous lines.`, 
        token.position
      );
    case TokenType.HashLeftBracket: 
      result = parseSet(state, token.position);
      break;
    case TokenType.Quote: {
      const quotedExpr = parseExpression(state);
      result = createList(createSymbol("quote"), quotedExpr);
      break;
    }
    case TokenType.Backtick: {
      const expr = parseExpression(state);
      result = createList(createSymbol("quasiquote"), expr);
      break;
    }
    case TokenType.Unquote: {
      const expr = parseExpression(state);
      result = createList(createSymbol("unquote"), expr);
      break;
    }
    case TokenType.UnquoteSplicing: {
      const expr = parseExpression(state);
      result = createList(createSymbol("unquote-splicing"), expr);
      break;
    }
    case TokenType.Comma: 
      result = createSymbol(",");
      break;
    case TokenType.Dot: 
      result = parseDotAccess(state, token);
      break;
    case TokenType.String: 
      result = parseStringLiteral(token.value);
      break;
    case TokenType.Number: 
      result = createLiteral(Number(token.value));
      break;
    case TokenType.Symbol: 
      result = parseSymbol(token.value);
      break;
    default: 
      throw new ParseError(`Unexpected token type: ${token.type}`, token.position);
  }
  
  // Attach source location to result
  attachSourceLocation(result, state.filePath, token.position.line, token.position.column);
  
  return result;
}

/**
 * Enhanced Import Statement Processing - Detects and validates import statements
 * Uses a more general approach to check structure without hardcoding specific typos
 */
// core/src/transpiler/pipeline/parser.ts
// Only showing the key function that needs updating:

/**
 * Enhanced Import Statement Processing - Detects and validates import statements
 * Uses a more general approach to check structure without hardcoding specific typos
 */
function parseImportStatement(elements: SExp[]): SList {
  // Check if we're parsing an import statement
  if (elements.length > 0 && 
      isSymbol(elements[0]) && 
      elements[0].name === "import") {
    
    // Check for the length to determine the type of import
    if (elements.length >= 3) {
      // We have at least three elements
      const secondElement = elements[1];
      
      // Case 1: Named import with vector like (import [hello] from "./module.hql")
      if (secondElement.type === "list") {
        // Check if we have the 'from' keyword at index 2
        const thirdElement = elements[2];
        if (isSymbol(thirdElement)) {
          // Check if this is 'from' or a typo like 'fom'
          const keyword = (thirdElement as SSymbol).name;
          
          if (keyword !== 'from') {
            // This is a typo - throw a more specific error
            throw new ParseError(
              `Invalid import statement: expected 'from' but got '${keyword}'`,
              {
                line: (thirdElement._meta?.line || 1),
                column: (thirdElement._meta?.column || 1),
                filePath: (thirdElement._meta?.filePath || "")
              }
            );
          }
        }
        // This is a named import - it's already structured correctly
        return createList(...elements);
      }
      
      // Case 2: Namespace import like (import module from "./module.hql")
      if (isSymbol(secondElement)) {
        const thirdElement = elements[2];
        
        if (isSymbol(thirdElement)) {
          const keyword = (thirdElement as SSymbol).name;
          
          if (keyword !== 'from') {
            // This is a typo in the 'from' keyword
            throw new ParseError(
              `Invalid import statement: expected 'from' but got '${keyword}'`,
              {
                line: (thirdElement._meta?.line || 1),
                column: (thirdElement._meta?.column || 1),
                filePath: (thirdElement._meta?.filePath || "")
              }
            );
          }
          
          // Valid namespace import pattern
          return createList(...elements);
        }
      }
    }
    
    // If we get here, the import statement is malformed
    throw new ParseError(
      "Invalid import statement format. Expected either (import module from \"./path\") or (import [symbols] from \"./path\")",
      {
        line: (elements[0]._meta?.line || 1),
        column: (elements[0]._meta?.column || 1),
        filePath: (elements[0]._meta?.filePath || "")
      }
    );
  }
  
  // If we get here, it's not a special case or not an import, so just return a normal list
  return createList(...elements);
}

function parseDotAccess(state: ParserState, dotToken: Token): SExp {
  if (state.currentPos < state.tokens.length) {
    const nextToken = state.tokens[state.currentPos++];
    const result = createSymbol("." + nextToken.value);
    
    // Attach location info - for dot access, use the dot's position
    attachSourceLocation(result, state.filePath, dotToken.position.line, dotToken.position.column);
    
    return result;
  }
  throw new ParseError("Expected property name after '.'", dotToken.position);
}

function parseStringLiteral(tokenValue: string): SExp {
  const str = tokenValue.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  return createLiteral(str);
}

function parseSymbol(tokenValue: string): SExp {
  if (tokenValue === "true") return createLiteral(true);
  if (tokenValue === "false") return createLiteral(false);
  if (tokenValue === "nil") return createNilLiteral();
  
  if (tokenValue.startsWith(".")) return createSymbol(tokenValue);
  
  if (tokenValue.includes(".") && !tokenValue.startsWith(".") && !tokenValue.endsWith("."))
    return parseDotNotation(tokenValue);
  
  return createSymbol(tokenValue);
}

function parseDotNotation(tokenValue: string): SExp {
  const parts = tokenValue.split(".");
  const objectName = parts[0];
  const propertyPath = parts.slice(1).join(".");
  
  // For property access with dashes, use get function
  if (propertyPath.includes("-")) {
    return createList(createSymbol("get"), createSymbol(objectName), createLiteral(propertyPath));
  }
  
  // Otherwise use normal dot notation
  return createSymbol(tokenValue);
}

/**
 * Enhanced parse list function with special handling for imports and syntax errors
 */
function parseList(state: ParserState, listStartPos: SourcePosition): SList {
  const elements: SExp[] = [];
  
  // Check if this might be an enum declaration
  let isEnum = false;
  if (state.currentPos < state.tokens.length && 
      state.tokens[state.currentPos].type === TokenType.Symbol &&
      state.tokens[state.currentPos].value === "enum") {
    isEnum = true;
  }

  // Check if this might be a function declaration
  let fnKeywordFound = false;
  if (state.currentPos < state.tokens.length && 
      state.tokens[state.currentPos].type === TokenType.Symbol &&
      (state.tokens[state.currentPos].value === "fn" || 
       state.tokens[state.currentPos].value === "fx")) {
    fnKeywordFound = true;
  }
  
  // Check if this might be an import declaration
  let importKeywordFound = false;
  if (state.currentPos < state.tokens.length && 
      state.tokens[state.currentPos].type === TokenType.Symbol &&
      state.tokens[state.currentPos].value === "import") {
    importKeywordFound = true;
  }

  const listStartLine = listStartPos.line;
  let currentLine = listStartLine;

  // Process all tokens until we reach the closing parenthesis
  while (
    state.currentPos < state.tokens.length &&
    state.tokens[state.currentPos].type !== TokenType.RightParen
  ) {
    // Special handling for enum syntax with separate colon
    if (isEnum && elements.length === 2 && 
        state.tokens[state.currentPos].type === TokenType.Colon) {
      
      // Skip the colon token
      state.currentPos++;
      
      // Ensure we have a type after the colon
      if (state.currentPos < state.tokens.length && 
          state.tokens[state.currentPos].type === TokenType.Symbol) {
        
        // Get the enum name (already parsed) and the type
        const enumNameSym = elements[1];
        if (isSymbol(enumNameSym)) {
          const typeName = state.tokens[state.currentPos].value;
          
          // Replace the enum name with combined enum name and type
          elements[1] = createSymbol(`${enumNameSym.name}:${typeName}`);
          
          // Skip the type token since we've incorporated it
          state.currentPos++;
        }
      } else {
        throw new ParseError(
          "Expected type name after colon in enum declaration", 
          state.tokens[state.currentPos - 1].position
        );
      }
    }
    
    // Special handling for named parameters in function calls
    else if (elements.length >= 1 && 
             state.currentPos < state.tokens.length &&
             state.tokens[state.currentPos].type === TokenType.Symbol && 
             state.tokens[state.currentPos].value.endsWith(":")) {
      
      // Get the token position for better error location
      const paramNamePos = state.tokens[state.currentPos].position;
      
      // Create a parameter name symbol (with the colon)
      const paramSymbol = createSymbol(state.tokens[state.currentPos].value);
      
      // Attach location information 
      attachSourceLocation(
        paramSymbol, 
        state.filePath, 
        paramNamePos.line, 
        paramNamePos.column
      );
      
      elements.push(paramSymbol);
      state.currentPos++;
      
      // Parse the expression that follows the parameter name
      if (state.currentPos < state.tokens.length) {
        elements.push(parseExpression(state));
      } else {
        throw new ParseError(
          `Expected value after parameter name '${state.tokens[state.currentPos-1].value}'`, 
          state.tokens[state.currentPos-1].position
        );
      }
    }
    
    // Special handling for function type expressions like (-> [String])
    else if (fnKeywordFound && 
             elements.length > 0 && 
             state.currentPos < state.tokens.length && 
             state.tokens[state.currentPos].type === TokenType.Symbol && 
             state.tokens[state.currentPos].value === "->") {
      // Get position for better error location
      const arrowPos = state.tokens[state.currentPos].position;
      
      // Create arrow symbol with location
      const arrowSymbol = createSymbol("->");
      attachSourceLocation(
        arrowSymbol,
        state.filePath,
        arrowPos.line,
        arrowPos.column
      );
      
      // Skip the -> token
      state.currentPos++;
      
      // Add the arrow symbol
      elements.push(arrowSymbol);
      
      // Parse the return type (which follows the arrow)
      elements.push(parseExpression(state));
    } else {
      elements.push(parseExpression(state));
    }
    
    // Update the current line tracking for better error messaging
    if (state.currentPos < state.tokens.length) {
      const currentToken = state.tokens[state.currentPos];
      currentLine = currentToken.position.line;
    }
  }
  
  // Check for unclosed list
  if (state.currentPos >= state.tokens.length) {
    // Extract file information from the source if available
    let errorMessage = "Unclosed list";
    
    if (state.input) {
      // Get a more accurate column position
      // First, determine the line where the unclosed list starts
      const lines = state.input.split('\n');
      const lineNumber = listStartPos.line;
      
      // Get the line of text where the error occurred
      const errorLine = lines[lineNumber - 1] || "";
      
      // For better error reporting, identify the full expression that is unclosed
      // Point to the end of the line where the closing parenthesis should be
      const lastColumn = errorLine.length;
      
      // Add more context to the error message
      errorMessage = `Unclosed list starting at line ${lineNumber}. Check for a missing closing parenthesis ')'`;
      
      // Create a precise error position that points to the end of the line
      // where the closing parenthesis is likely missing
      throw new ParseError(errorMessage, {
        line: lineNumber,
        column: lastColumn, // Point to the end of the line
        offset: listStartPos.offset + errorLine.length,
        filePath: state.filePath
      });
    } else {
      // Fallback to less precise position if input source isn't available
      const lastTokenPos = state.tokens.length > 0 
        ? state.tokens[state.tokens.length - 1].position 
        : listStartPos;
        
      throw new ParseError(errorMessage, lastTokenPos);
    }
  }
  
  // Get the closing position for better error location
  const closePos = state.tokens[state.currentPos].position;
  
  // Move past the closing parenthesis
  state.currentPos++;
  
  // Check if this is an import statement and handle it specially
  let result: SList;
  if (importKeywordFound) {
    result = parseImportStatement(elements);
  } else {
    result = createList(...elements);
  }
  
  // Attach source location (using both start and end positions)
  attachSourceLocation(
    result,
    state.filePath,
    listStartPos.line,
    listStartPos.column
  );
  
  return result;
}

/**
 * Match the next token from the input string with enhanced error context
 * Improves error messages and location tracking
 */
function matchNextToken(input: string, line: number, column: number, offset: number, filePath: string): Token {
  const position: SourcePosition = { line, column, offset, filePath };
  
  // Define patterns to match
  let match;
  
  // First check for special tokens
  match = input.match(TOKEN_PATTERNS.SPECIAL_TOKENS);
  if (match) return { type: getTokenTypeForSpecial(match[0]), value: match[0], position };
  
  // Then check for strings
  match = input.match(TOKEN_PATTERNS.STRING);
  if (match) return { type: TokenType.String, value: match[0], position };
  
  // Then check for comments
  match = input.match(TOKEN_PATTERNS.COMMENT);
  if (match) return { type: TokenType.Comment, value: match[0], position };
  
  // Then check for whitespace
  match = input.match(TOKEN_PATTERNS.WHITESPACE);
  if (match) return { type: TokenType.Whitespace, value: match[0], position };
  
  // Finally check for symbols
  match = input.match(TOKEN_PATTERNS.SYMBOL);
  if (match) {
    const value = match[0];
    // If it's a number, return as number token
    if (!isNaN(Number(value))) return { type: TokenType.Number, value, position };
    // Otherwise return as symbol token
    return { type: TokenType.Symbol, value, position };
  }
  
  // If we get here, there's an unexpected character
  // Provide enhanced error context
  let unexpectedChar = input[0] || "end of file";
  let errorContext = "";
  
  // Get some context for a better error message
  try {
    if (filePath) {
      const content = Deno.readTextFileSync(filePath);
      const lines = content.split('\n');
      
      if (line > 0 && line <= lines.length) {
        const lineContent = lines[line - 1];
        // Create a pointer to the unexpected character
        const pointer = ' '.repeat(column - 1) + '^';
        errorContext = `\n${lineContent}\n${pointer}`;
      }
    }
  } catch (_e) {
    // If we can't read the file, continue without extra context
  }
  
  throw new ParseError(
    `Unexpected character: '${unexpectedChar}' at line ${line}, column ${column}${errorContext}`, 
    position, 
    input
  );
}

function parseVector(state: ParserState, startPos: SourcePosition): SList {
  const elements: SExp[] = [];
  while (
    state.currentPos < state.tokens.length &&
    state.tokens[state.currentPos].type !== TokenType.RightBracket
  ) {
    elements.push(parseExpression(state));
    if (state.currentPos < state.tokens.length && state.tokens[state.currentPos].type === TokenType.Comma)
      state.currentPos++;
  }
  if (state.currentPos >= state.tokens.length)
    throw new ParseError("Unclosed vector", startPos);
  
  // Get end position for better error location
  const endPos = state.tokens[state.currentPos].position;
  
  // Move past the closing bracket
  state.currentPos++;
  
  let result: SList;
  if (elements.length === 0) {
    result = createList(createSymbol("empty-array"));
  } else {
    result = createList(createSymbol("vector"), ...elements);
  }
  
  // Attach source location
  attachSourceLocation(
    result,
    state.filePath,
    startPos.line,
    startPos.column
  );
  
  return result;
}

function parseMap(state: ParserState, startPos: SourcePosition): SList {
  const entries: SExp[] = [];
  while (
    state.currentPos < state.tokens.length &&
    state.tokens[state.currentPos].type !== TokenType.RightBrace
  ) {
    const key = parseExpression(state);
    if (
      state.currentPos >= state.tokens.length ||
      state.tokens[state.currentPos].type !== TokenType.Colon
    ) {
      const errorPos = state.currentPos < state.tokens.length
        ? state.tokens[state.currentPos].position
        : startPos;
      throw new ParseError("Expected ':' in map literal", errorPos);
    }
    state.currentPos++;
    const value = parseExpression(state);
    entries.push(key, value);
    if (state.currentPos < state.tokens.length && state.tokens[state.currentPos].type === TokenType.Comma)
      state.currentPos++;
  }
  if (state.currentPos >= state.tokens.length)
    throw new ParseError("Unclosed map", startPos);
  
  // Get end position
  const endPos = state.tokens[state.currentPos].position;
  
  // Move past the closing brace
  state.currentPos++;
  
  let result: SList;
  if (entries.length === 0) {
    result = createList(createSymbol("empty-map"));
  } else {
    result = createList(createSymbol("hash-map"), ...entries);
  }
  
  // Attach source location
  attachSourceLocation(
    result,
    state.filePath,
    startPos.line,
    startPos.column
  );
  
  return result;
}

function parseSet(state: ParserState, startPos: SourcePosition): SList {
  const elements: SExp[] = [];
  while (
    state.currentPos < state.tokens.length &&
    state.tokens[state.currentPos].type !== TokenType.RightBracket
  ) {
    elements.push(parseExpression(state));
    if (state.currentPos < state.tokens.length && state.tokens[state.currentPos].type === TokenType.Comma)
      state.currentPos++;
  }
  if (state.currentPos >= state.tokens.length)
    throw new ParseError("Unclosed set", startPos);
  
  // Get end position
  const endPos = state.tokens[state.currentPos].position;
  
  // Move past the closing bracket
  state.currentPos++;
  
  let result: SList;
  if (elements.length === 0) {
    result = createList(createSymbol("empty-set"));
  } else {
    result = createList(createSymbol("hash-set"), ...elements);
  }
  
  // Attach source location
  attachSourceLocation(
    result,
    state.filePath,
    startPos.line,
    startPos.column
  );
  
  return result;
}

/**
 * Get line context for better error messages
 */
function getLineContext(input: string, lineNumber: number): string {
  if (!input) return "";
  
  const lines = input.split('\n');
  if (lineNumber <= 0 || lineNumber > lines.length) return "";
  
  return lines[lineNumber - 1].trim();
}