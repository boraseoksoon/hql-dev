// src/transpiler/pipeline/parser.ts - Comprehensive implementation with enhanced error detection and reporting

import {
  createList,
  createLiteral,
  createNilLiteral,
  createSymbol,
  SExp,
  SList,
  SSymbol
} from "../../s-exp/types.ts";
import { ParseError } from "../error/errors.ts";

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
  // No hardcoded filenames - use the path as provided
  const tokens = tokenize(input, filePath);
  
  // Validate token balance before parsing to detect missing opening parentheses
  validateTokenBalance(tokens, input, filePath);
  
  return parseTokens(tokens, input, filePath);
}

function tokenize(input: string, filePath: string): Token[] {
  const tokens: Token[] = [];
  let remaining = input, line = 1, column = 1, offset = 0;
  while (remaining.length > 0) {
    const token = matchNextToken(remaining, line, column, offset, filePath);
    if (token.type === TokenType.Comment || token.type === TokenType.Whitespace) {
      updatePositionInfo(token.value, token.position);
    } else {
      tokens.push(token);
    }
    offset += token.value.length;
    remaining = remaining.substring(token.value.length);
    line = token.position.line;
    column = token.position.column + token.value.length;
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
    throw new ParseError("Unexpected end of input", lastPos, state.input);
  }
  const token = state.tokens[state.currentPos++];
  return parseExpressionByTokenType(token, state);
}

function parseExpressionByTokenType(token: Token, state: ParserState): SExp {
  switch (token.type) {
    case TokenType.LeftParen: return parseList(state);
    case TokenType.RightParen: {
      const lineContext = getLineContext(state.input, token.position.line);
      throw new ParseError(
        `Unexpected ')' - Check for a missing opening '(' in previous lines.\nContext: ${lineContext}`, 
        token.position, 
        state.input
      ); 
    }
    case TokenType.LeftBracket: return parseVector(state);
    case TokenType.RightBracket: 
      // Improved error message for unexpected closing bracket
      throw new ParseError(
        `Unexpected ']' - Check for a missing opening '[' in previous lines.`, 
        token.position, 
        state.input
      );
    case TokenType.LeftBrace: return parseMap(state);
    case TokenType.RightBrace: 
      // Improved error message for unexpected closing brace
      throw new ParseError(
        `Unexpected '}' - Check for a missing opening '{' in previous lines.`, 
        token.position, 
        state.input
      );
    case TokenType.HashLeftBracket: return parseSet(state);
    case TokenType.Quote: return createList(createSymbol("quote"), parseExpression(state));
    case TokenType.Backtick: return createList(createSymbol("quasiquote"), parseExpression(state));
    case TokenType.Unquote: return createList(createSymbol("unquote"), parseExpression(state));
    case TokenType.UnquoteSplicing: return createList(createSymbol("unquote-splicing"), parseExpression(state));
    case TokenType.Comma: return createSymbol(",");
    case TokenType.Dot: return parseDotAccess(state, token);
    case TokenType.String: return parseStringLiteral(token.value);
    case TokenType.Number: return createLiteral(Number(token.value));
    case TokenType.Symbol: return parseSymbol(token.value);
    default: throw new ParseError(`Unexpected token type: ${token.type}`, token.position, state.input);
  }
}

function parseDotAccess(state: ParserState, dotToken: Token): SExp {
  if (state.currentPos < state.tokens.length) {
    const nextToken = state.tokens[state.currentPos++];
    return createSymbol("." + nextToken.value);
  }
  throw new ParseError("Expected property name after '.'", dotToken.position, state.input);
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
  return propertyPath.includes("-")
    ? createList(createSymbol("get"), createSymbol(objectName), createLiteral(propertyPath))
    : createSymbol(tokenValue);
}

/**
 * Parse a list expression
 */
function parseList(state: ParserState): SList {
  const listStartPos = state.tokens[state.currentPos - 1].position;
  const elements: SExp[] = [];
  
  // Check if this might be an enum declaration
  let isEnum = false;
  if (state.currentPos < state.tokens.length && 
      state.tokens[state.currentPos].type === TokenType.Symbol &&
      state.tokens[state.currentPos].value === "enum") {
    isEnum = true;
  }

  let fnKeywordFound = false;
  
  if (state.currentPos < state.tokens.length && 
      state.tokens[state.currentPos].type === TokenType.Symbol &&
      (state.tokens[state.currentPos].value === "fn" || 
       state.tokens[state.currentPos].value === "fx")) {
    fnKeywordFound = true;
  }
  
  // Track list starting line and current line to detect missing closing parentheses
  // across multiple lines
  const listStartLine = listStartPos.line;
  let currentLine = listStartLine;
  
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
        const enumNameSym = elements[1] as SSymbol;
        const typeName = state.tokens[state.currentPos].value;
        
        // Replace the enum name with combined enum name and type
        elements[1] = createSymbol(`${enumNameSym.name}:${typeName}`);
        
        // Skip the type token since we've incorporated it
        state.currentPos++;
      } else {
        throw new ParseError(
          "Expected type name after colon in enum declaration", 
          state.tokens[state.currentPos - 1].position, 
          state.input
        );
      }
    }
    
    // Special handling for named parameters in function calls
    else if (elements.length >= 1 && 
             state.currentPos < state.tokens.length &&
             state.tokens[state.currentPos].type === TokenType.Symbol && 
             state.tokens[state.currentPos].value.endsWith(":")) {
      
      // Create a parameter name symbol (with the colon)
      elements.push(createSymbol(state.tokens[state.currentPos].value));
      state.currentPos++;
      
      // Parse the expression that follows the parameter name
      if (state.currentPos < state.tokens.length) {
        elements.push(parseExpression(state));
      } else {
        throw new ParseError(
          `Expected value after parameter name '${state.tokens[state.currentPos-1].value}'`, 
          state.tokens[state.currentPos-1].position,
          state.input
        );
      }
    }
    
    // Special handling for function type expressions like (-> [String])
    else if (fnKeywordFound && 
             elements.length > 0 && 
             state.currentPos < state.tokens.length && 
             state.tokens[state.currentPos].type === TokenType.Symbol && 
             state.tokens[state.currentPos].value === "->") {
      // Skip the -> token
      state.currentPos++;
      
      // Parse the return type (which follows the arrow)
      elements.push(createSymbol("->"));
      elements.push(parseExpression(state));
    } else {
      elements.push(parseExpression(state));
    }
    
    // Update the current line tracking without triggering unnecessary errors
    if (state.currentPos < state.tokens.length) {
      const currentToken = state.tokens[state.currentPos];
      currentLine = currentToken.position.line;
    }
  }
  
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
      }, state.input);
    } else {
      // Fallback to less precise position if input source isn't available
      const lastTokenPos = state.tokens.length > 0 
        ? state.tokens[state.tokens.length - 1].position 
        : listStartPos;
        
      throw new ParseError(errorMessage, lastTokenPos, state.input);
    }
  }
  
  state.currentPos++;
  
  return createList(...elements);
}

/**
 * Match the next token from the input
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
  
  throw new ParseError(`Unexpected character: ${input[0]}`, position, input);
}

function parseVector(state: ParserState): SList {
  const startPos = state.tokens[state.currentPos - 1].position;
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
    throw new ParseError("Unclosed vector", startPos, state.input);
  state.currentPos++;
  return elements.length === 0
    ? createList(createSymbol("empty-array"))
    : createList(createSymbol("vector"), ...elements);
}

function parseMap(state: ParserState): SList {
  const startPos = state.tokens[state.currentPos - 1].position;
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
      throw new ParseError("Expected ':' in map literal", errorPos, state.input);
    }
    state.currentPos++;
    const value = parseExpression(state);
    entries.push(key, value);
    if (state.currentPos < state.tokens.length && state.tokens[state.currentPos].type === TokenType.Comma)
      state.currentPos++;
  }
  if (state.currentPos >= state.tokens.length)
    throw new ParseError("Unclosed map", startPos, state.input);
  state.currentPos++;
  return entries.length === 0
    ? createList(createSymbol("empty-map"))
    : createList(createSymbol("hash-map"), ...entries);
}

function parseSet(state: ParserState): SList {
  const startPos = state.tokens[state.currentPos - 1].position;
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
    throw new ParseError("Unclosed set", startPos, state.input);
  state.currentPos++;
  return elements.length === 0
    ? createList(createSymbol("empty-set"))
    : createList(createSymbol("hash-set"), ...elements);
}

/**
 * Validate the balance of parentheses, brackets, and braces in the token stream
 * This helps catch missing opening delimiters before actual parsing
 */
function validateTokenBalance(tokens: Token[], input: string, filePath: string): void {
  const bracketStack: { type: TokenType, token: Token }[] = [];
  
  // Define bracket pairs using a Map instead of Record for enum keys
  const bracketPairs = new Map<TokenType, TokenType>([
    [TokenType.LeftParen, TokenType.RightParen],
    [TokenType.LeftBracket, TokenType.RightBracket],
    [TokenType.LeftBrace, TokenType.RightBrace]
  ]);
  
  const closingToOpening = new Map<TokenType, TokenType>([
    [TokenType.RightParen, TokenType.LeftParen],
    [TokenType.RightBracket, TokenType.LeftBracket],
    [TokenType.RightBrace, TokenType.LeftBrace]
  ]);
  
  // Track incomplete expressions - but don't overeagerly detect let expressions
  let lastExprStart: Token | null = null;
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    
    // If it's an opening bracket, push to stack
    if (token.type === TokenType.LeftParen || 
        token.type === TokenType.LeftBracket || 
        token.type === TokenType.LeftBrace) {
      bracketStack.push({ type: token.type, token });
      lastExprStart = token;
    }
    // If it's a closing bracket, check if it matches the last opening bracket
    else if (token.type === TokenType.RightParen || 
             token.type === TokenType.RightBracket || 
             token.type === TokenType.RightBrace) {
      
      if (bracketStack.length === 0) {
        // No matching opening bracket - throw detailed error
        const bracketChar = token.type === TokenType.RightParen ? ")" : 
                          token.type === TokenType.RightBracket ? "]" : "}";
        const expectedOpening = token.type === TokenType.RightParen ? "(" : 
                              token.type === TokenType.RightBracket ? "[" : "{";
        
        // Get line context for better error reporting
        const lineContext = getLineContext(input, token.position.line);
        
        // Look for missing opening bracket location
        const missingOpeningLocation = findLikelyMissingOpeningLocation(input, token, tokens, i);
        if (missingOpeningLocation) {
          throw new ParseError(
            `Missing opening '${expectedOpening}' before '${missingOpeningLocation.context}'. Check for a missing opening parenthesis.`, 
            missingOpeningLocation.position,
            input
          );
        } else {
          throw new ParseError(
            `Missing opening '${expectedOpening}' for this closing '${bracketChar}'. Check previous lines for balanced parentheses.\nContext: ${lineContext}`, 
            token.position, 
            input
          );
        }
      }
      
      const lastOpening = bracketStack.pop();
      if (lastOpening && closingToOpening.get(token.type) !== lastOpening.type) {
        // Mismatched bracket types
        const openChar = lastOpening.type === TokenType.LeftParen ? "(" : 
                       lastOpening.type === TokenType.LeftBracket ? "[" : "{";
        const closeChar = token.type === TokenType.RightParen ? ")" : 
                        token.type === TokenType.RightBracket ? "]" : "}";
        
        throw new ParseError(
          `Mismatched brackets: '${openChar}' is closed by '${closeChar}'`, 
          token.position, 
          input
        );
      }
    }
  }
  
  // Check for unclosed opening brackets
  if (bracketStack.length > 0) {
    const lastUnclosed = bracketStack[bracketStack.length - 1];
    const openChar = lastUnclosed.type === TokenType.LeftParen ? "(" : 
                   lastUnclosed.type === TokenType.LeftBracket ? "[" : "{";
    
    // Get the line of text for better context
    const unclosedLine = lastUnclosed.token.position.line;
    const unclosedLineContent = input.split('\n')[unclosedLine - 1];
    
    // Extract surrounding code context with proper codeblock highlighting
    const lines = input.split('\n');
    const startLine = Math.max(1, unclosedLine - 2);
    const endLine = Math.min(lines.length, unclosedLine + 2);
    let contextLines = '';
    
    for (let i = startLine; i <= endLine; i++) {
      if (i === unclosedLine) {
        // Highlight the unclosed bracket line
        contextLines += `→ ${lines[i-1]}\n`;
      } else if (lines[i-1].trim()) { 
        // Only include non-empty lines
        contextLines += `  ${lines[i-1]}\n`;
      }
    }
    
    throw new ParseError(
      `Unclosed '${openChar}' at line ${unclosedLine}. Missing closing delimiter.\nContext:\n${contextLines}`, 
      lastUnclosed.token.position, 
      input
    );
  }
}

/**
 * Attempts to find where a missing opening bracket is likely needed
 * This uses structural analysis rather than hardcoded keywords
 */
function findLikelyMissingOpeningLocation(input: string, closingToken: Token, tokens: Token[], closingTokenIndex: number): { position: SourcePosition, context: string } | null {
  const lines = input.split('\n');
  
  // First, check for common structural patterns indicating a missing opening parenthesis
  // This approach involves analyzing token sequences and indentation patterns
  
  // Look for lines that start a new indented block but don't have an opening parenthesis
  const lineNumber = closingToken.position.line;
  let indentationLevel = -1;
  let lastSymbolLine = -1;
  let lastSymbolValue = "";
  let lastSymbolColumn = -1;
  
  // Scan backwards from the closing token to find potential structural issues
  for (let lineIndex = lineNumber - 1; lineIndex >= 0; lineIndex--) {
    const line = lines[lineIndex].trimRight();
    if (line.trim().length === 0 || line.trim().startsWith(";")) continue; // Skip comments and empty lines
    
    // Calculate indentation level for this line
    const currentIndent = line.length - line.trimLeft().length;
    
    // If this is the first line we're checking, establish the expected indentation
    if (indentationLevel === -1) {
      indentationLevel = currentIndent;
    }
    
    // Look for a line that has a symbol at the start (potential function call or expression)
    // but doesn't have an opening parenthesis
    if (!line.trimLeft().startsWith("(") && !line.includes("(")) {
      // This line has text but no parenthesis - potential error location
      const symbolMatch = line.trim().match(/^([^\s\(\)\[\]\{\}"'`,;]+)/);
      if (symbolMatch) {
        lastSymbolLine = lineIndex;
        lastSymbolValue = symbolMatch[1];
        lastSymbolColumn = line.indexOf(symbolMatch[1]) + 1; // 1-based columns
        
        // Check if next non-empty line is indented (suggesting this is a missing opening paren)
        let nextLineIndex = lineIndex + 1;
        while (nextLineIndex < lines.length) {
          const nextLine = lines[nextLineIndex].trimRight();
          if (nextLine.trim().length === 0 || nextLine.trim().startsWith(";")) {
            nextLineIndex++;
            continue;
          }
          
          const nextIndent = nextLine.length - nextLine.trimLeft().length;
          if (nextIndent > currentIndent) {
            // Found a pattern: symbol followed by indented block without opening parenthesis
            return {
              position: {
                line: lastSymbolLine + 1, // 1-based line numbers
                column: lastSymbolColumn,
                offset: 0, // We don't need the exact offset for this error
                filePath: closingToken.position.filePath
              },
              context: lastSymbolValue
            };
          }
          break;
        }
      }
    }
    
    // Look for a break in indentation pattern (outdent) that might indicate
    // a different structural level where an opening parenthesis is missing
    if (currentIndent < indentationLevel) {
      // Check if this line has a standalone symbol
      const symbolOnlyMatch = line.trim().match(/^([^\s\(\)\[\]\{\}"'`,;]+)\s*$/);
      if (symbolOnlyMatch) {
        return {
          position: {
            line: lineIndex + 1, // 1-based line numbers
            column: line.indexOf(symbolOnlyMatch[1]) + 1,
            offset: 0,
            filePath: closingToken.position.filePath
          },
          context: symbolOnlyMatch[1]
        };
      }
    }
  }
  
  // If we didn't find structural issues, check token sequence patterns
  // Look for symbol tokens that are followed by token patterns suggesting
  // they should have been wrapped in parentheses
  if (closingTokenIndex > 0) {
    for (let i = closingTokenIndex - 1; i >= 0; i--) {
      const token = tokens[i];
      
      // Check if this is a symbol followed by tokens that suggest it should have been wrapped in parens
      if (token.type === TokenType.Symbol) {
        // Look at the sequence that follows this symbol
        const tokenSequence = tokens.slice(i + 1, Math.min(i + 5, closingTokenIndex));
        
        // If there are multiple expressions following this symbol, it might need parens
        if (tokenSequence.length > 1 && 
            tokenSequence.some(t => t.type === TokenType.LeftParen)) {
          return {
            position: token.position,
            context: token.value
          };
        }
      }
    }
  }
  
  return null;
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