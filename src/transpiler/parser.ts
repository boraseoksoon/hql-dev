// src/transpiler/parser.ts - Updated with fixes for parameter handling

import { HQLNode, LiteralNode, SymbolNode, ListNode, JsonObjectLiteralNode, JsonArrayLiteralNode } from "./hql_ast.ts";
import { ParseError } from "./errors.ts";

// Constants for character handling
const WHITESPACE_CHARS = new Set([' ', '\t', '\n', '\r', ',']);

// Track parsing state
let tokens: string[] = [];
let positions: { line: number; column: number; offset: number; }[] = [];
let pos = 0;

/**
 * Check if a character is whitespace
 */
function isWhitespace(ch: string): boolean {
  return WHITESPACE_CHARS.has(ch);
}

/**
 * Process string literals, handling escape sequences properly.
 */
function processStringLiteral(
  str: string,
  position: { line: number; column: number; offset: number; }
): string {
  if (!str.startsWith('"') || !str.endsWith('"') || str.length < 2) {
    throw new ParseError(
      "Malformed string literal - missing quotes", 
      position
    );
  }
  
  // Remove the surrounding quotes
  const content = str.slice(1, -1);
  let result = "";
  
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\\' && i + 1 < content.length) {
      const next = content[i + 1];
      switch (next) {
        case 'n': result += '\n'; break;
        case 't': result += '\t'; break;
        case 'r': result += '\r'; break;
        case '\\': result += '\\'; break;
        case '"': result += '"'; break;
        case '(': result += '('; break;
        case ')': result += ')'; break;
        default:
          throw new ParseError(
            `Invalid escape sequence \\${next} in string`, 
            {
              line: position.line,
              column: position.column + i,
              offset: position.offset + i
            }
          );
      }
      i++; // Skip the escaped character
    } else {
      result += content[i];
    }
  }
  
  return result;
}

/**
 * Remove inline comments from a line
 */
function removeInlineComments(line: string): string {
  let inString = false;
  let commentStart = -1;
  
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    
    if (ch === '"' && (i === 0 || line[i - 1] !== "\\")) {
      inString = !inString;
    } else if (!inString && ch === ";") {
      // Once a semicolon is found outside a string, stop and return the prefix
      commentStart = i;
      break;
    }
  }
  
  // If no comment found, return the original line
  if (commentStart === -1) return line;
  
  // Otherwise, return everything up to the comment
  return line.substring(0, commentStart);
}

/**
 * Tokenize the input string into tokens
 */
function tokenize(input: string): { tokens: string[], positions: { line: number; column: number; offset: number; }[] } {
  // Pre-split lines and pre-filter comment-only lines for efficiency
  const rawLines = input.split("\n");
  const lines: string[] = [];
  
  // We need to keep track of original line numbers for error reporting
  const lineMap: number[] = [];
  
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (line.length > 0 && !line.startsWith(";")) {
      lines.push(line);
      lineMap.push(i);
    }
  }
  
  const tokens: string[] = [];
  const positions: { line: number; column: number; offset: number; }[] = [];
  
  let current = "";
  let inString = false;
  let stringStartLine = 0;
  let stringStartColumn = 0;
  let totalOffset = 0;
  
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const actualLineIndex = lineMap[lineIndex];
    const line = inString ? lines[lineIndex] : removeInlineComments(lines[lineIndex]);
    const lineOffset = totalOffset;
    
    for (let colIndex = 0; colIndex < line.length; colIndex++) {
      const ch = line[colIndex];
      totalOffset++; // Track absolute position in the input
      
      // Check for the set literal marker #[
      if (!inString && ch === '#' && colIndex + 1 < line.length && line[colIndex + 1] === '[') {
        if (current.length > 0) {
          tokens.push(current);
          positions.push({
            line: actualLineIndex + 1,
            column: colIndex - current.length + 1,
            offset: lineOffset + colIndex - current.length
          });
          current = "";
        }
        
        tokens.push("#[");
        positions.push({
          line: actualLineIndex + 1,
          column: colIndex + 1,
          offset: lineOffset + colIndex
        });
        colIndex++; // Skip the next character as we've processed it
        totalOffset++; // Skip this character in the offset count
        continue;
      }
      
      if (inString) {
        current += ch;
        if (ch === '"' && colIndex > 0 && line[colIndex - 1] !== "\\") {
          tokens.push(current);
          positions.push({
            line: stringStartLine + 1,
            column: stringStartColumn + 1,
            offset: lineOffset + stringStartColumn
          });
          current = "";
          inString = false;
        }
      } else {
        if (ch === '"') {
          if (current.length > 0) {
            tokens.push(current);
            positions.push({
              line: actualLineIndex + 1,
              column: colIndex - current.length + 1,
              offset: lineOffset + colIndex - current.length
            });
            current = "";
          }
          current += ch;
          inString = true;
          stringStartLine = actualLineIndex;
          stringStartColumn = colIndex;
        } else if (ch === '(' || ch === ')' || ch === '[' || ch === ']' || ch === '{' || ch === '}') {
          // Handle all bracket and brace tokens
          if (current.length > 0) {
            tokens.push(current);
            positions.push({
              line: actualLineIndex + 1,
              column: colIndex - current.length + 1,
              offset: lineOffset + colIndex - current.length
            });
            current = "";
          }
          tokens.push(ch);
          positions.push({
            line: actualLineIndex + 1,
            column: colIndex + 1,
            offset: lineOffset + colIndex
          });
        } else if (ch === ':') {
          // Special case: For JSON literals, handle colon as a separator
          // For named parameters, keep the colon as part of the token
          
          // Named parameter case - symbol ending with colon
          if (current.length > 0) {
            // Named parameter syntax - if we're in a context like (fn name:)
            // We collect the colon as part of the symbol
            current += ":";
            tokens.push(current);
            positions.push({
              line: actualLineIndex + 1,
              column: colIndex - current.length + 2, // +2 to include the colon
              offset: lineOffset + colIndex - current.length + 1
            });
            current = "";
          } else {
            // JSON colon separator - standalone token for use in JSON objects
            tokens.push(":");
            positions.push({
              line: actualLineIndex + 1,
              column: colIndex + 1,
              offset: lineOffset + colIndex
            });
          }
        } else if (isWhitespace(ch)) {
          if (current.length > 0) {
            tokens.push(current);
            positions.push({
              line: actualLineIndex + 1,
              column: colIndex - current.length + 1,
              offset: lineOffset + colIndex - current.length
            });
            current = "";
          }
        } else {
          current += ch;
        }
      }
    }
    
    if (inString) {
      current += "\n";
      totalOffset++; // Count the newline as a character
    } else if (current.length > 0) {
      tokens.push(current);
      positions.push({
        line: actualLineIndex + 1,
        column: line.length - current.length + 1,
        offset: lineOffset + line.length - current.length
      });
      current = "";
    }
    
    totalOffset++; // Count the newline at the end of each line
  }
  
  if (current.length > 0) {
    tokens.push(current);
    positions.push({
      line: lines.length,
      column: lines[lines.length - 1].length - current.length + 1,
      offset: totalOffset - current.length
    });
  }
  
  if (inString) {
    throw new ParseError("Unclosed string literal", {
      line: stringStartLine + 1,
      column: stringStartColumn + 1,
      offset: positions[positions.length - 1].offset - current.length
    });
  }
  
  return { tokens, positions };
}

/**
 * Parse a JSON object literal into a JsonObjectLiteralNode
 */
function parseJsonObject(): JsonObjectLiteralNode {
  const properties: { [key: string]: HQLNode } = {};
  
  const startPos = pos - 1; // Position of the opening brace
  
  while (pos < tokens.length && tokens[pos] !== "}") {
    // Parse the key (must be a string literal for JSON objects)
    if (pos >= tokens.length) {
      throw new ParseError(
        `Unexpected end of input in object literal starting at line ${positions[startPos].line}, column ${positions[startPos].column}`, 
        positions[startPos]
      );
    }
    
    // Get key
    const keyToken = tokens[pos];
    if (!keyToken.startsWith('"')) {
      throw new ParseError(
        "Object literal keys must be string literals",
        positions[pos]
      );
    }
    pos++;
    
    // Process key string
    const keyStr = processStringLiteral(keyToken, positions[pos-1]);
    
    // Expect colon separator
    if (pos >= tokens.length || tokens[pos] !== ":") {
      throw new ParseError(
        "Missing colon after property name in object literal", 
        pos > 0 ? positions[pos - 1] : positions[0]
      );
    }
    pos++; // Skip the colon token
    
    // Parse the value
    if (pos >= tokens.length) {
      throw new ParseError(
        `Unexpected end of input in object literal value starting at line ${positions[startPos].line}, column ${positions[startPos].column}`, 
        positions[startPos]
      );
    }
    const value = parseExpression();
    
    // Add key-value pair to the properties
    properties[keyStr] = value;
  }
  
  if (pos >= tokens.length) {
    throw new ParseError(
      `Unclosed curly brace starting at line ${positions[startPos].line}, column ${positions[startPos].column}`, 
      positions[startPos]
    );
  }
  
  pos++; // skip the closing brace
  
  return { type: "jsonObjectLiteral", properties };
}

/**
 * Parse a JSON array literal into a JsonArrayLiteralNode
 */
function parseJsonArray(): JsonArrayLiteralNode {
  const elements: HQLNode[] = [];
  const startPos = pos - 1; // Position of the opening bracket
  
  while (pos < tokens.length && tokens[pos] !== "]") {
    elements.push(parseExpression());
  }
  
  if (pos >= tokens.length) {
    throw new ParseError(
      `Unclosed square bracket starting at line ${positions[startPos].line}, column ${positions[startPos].column}`,
      positions[startPos]
    );
  }
  
  pos++; // Skip the closing bracket
  
  return { type: "jsonArrayLiteral", elements };
}

/**
 * Parse a standard list with a given closing delimiter
 * Also handles special cases like parameter lists in fx forms
 */
function parseList(): ListNode {
  const elements: HQLNode[] = [];
  const startPos = pos - 1; // Position of the opening delimiter
  
  // Check if this might be an fx form
  const isFxForm = pos < tokens.length && tokens[pos] === "fx";
  
  // Process the elements of the list
  while (pos < tokens.length && tokens[pos] !== ")") {
    // Special handling for fx form's parameter list
    if (isFxForm && elements.length === 2 && tokens[pos] === "(" && elements[0].type === "symbol" && (elements[0] as SymbolNode).name === "fx") {
      // This is a parameter list in an fx form, so we need to parse it specially
      pos++; // Skip the opening parenthesis
      const params = parseParameterList();
      elements.push(params);
    } else {
      elements.push(parseExpression());
    }
  }
  
  if (pos >= tokens.length) {
    throw new ParseError(
      `Unclosed parenthesis starting at line ${positions[startPos].line}, column ${positions[startPos].column}`,
      positions[startPos]
    );
  }
  
  // Validate fx form - should have at least 3 elements: fx, name, and params
  if (isFxForm && elements.length < 3) {
    throw new ParseError(
      `Invalid fx form - not enough elements`,
      positions[startPos]
    );
  }
  
  pos++; // Skip the closing delimiter
  
  return { type: "list", elements };
}

/**
 * Parse a parameter list, handling type annotations
 */
function parseParameterList(): ListNode {
  const elements: HQLNode[] = [];
  const startPos = pos - 1; // Position of the opening parenthesis
  
  while (pos < tokens.length && tokens[pos] !== ")") {
    // Check if this is a parameter with a type annotation
    if (pos + 1 < tokens.length && tokens[pos].endsWith(":") && tokens[pos + 1] !== ")") {
      // This is a parameter with a type annotation
      const paramName = tokens[pos].slice(0, -1); // Remove the colon
      const colonSymbol = ":";
      const typeName = tokens[pos + 1];
      
      // Create a list node for the parameter with type annotation
      const paramElements: HQLNode[] = [
        { type: "symbol", name: paramName } as SymbolNode,
        { type: "symbol", name: colonSymbol } as SymbolNode,
        { type: "symbol", name: typeName } as SymbolNode
      ];
      
      elements.push({ type: "list", elements: paramElements } as ListNode);
      
      pos += 2; // Skip the parameter name and type
    } else {
      // Regular parameter
      elements.push(parseExpression());
    }
  }
  
  if (pos >= tokens.length) {
    throw new ParseError(
      `Unclosed parameter list starting at line ${positions[startPos].line}, column ${positions[startPos].column}`,
      positions[startPos]
    );
  }
  
  pos++; // Skip the closing parenthesis
  
  return { type: "list", elements };
}

/**
 * Parse a set literal (#[...]) into a properly structured ListNode
 */
function parseSetLiteral(): ListNode {
  // Use the js-set macro call structure
  const setElements: HQLNode[] = [
    { type: "symbol", name: "js-set" } as SymbolNode
  ];
  
  const startPos = pos - 1; // Position of the opening #[
  
  while (pos < tokens.length && tokens[pos] !== "]") {
    setElements.push(parseExpression());
  }
  
  if (pos >= tokens.length) {
    throw new ParseError(
      `Unclosed set literal starting at line ${positions[startPos].line}, column ${positions[startPos].column}`, 
      positions[startPos]
    );
  }
  
  pos++; // Skip the closing bracket
  
  return { type: "list", elements: setElements };
}

/**
 * Parse an expression from the token stream
 */
function parseExpression(): HQLNode {
  if (pos >= tokens.length) {
    throw new ParseError(
      "Unexpected end of input", 
      pos > 0 ? positions[pos - 1] : { line: 1, column: 1, offset: 0 }
    );
  }
  
  const token = tokens[pos];
  const position = positions[pos];
  pos++;
  
  // Handle special data structure literals and special forms
  if (token === "(") {
    // Parse as a list
    return parseList();
  } else if (token === "[") {
    // Parse as a JSON array literal
    return parseJsonArray();
  } else if (token === "{") {
    // Parse as a JSON object literal
    return parseJsonObject();
  } else if (token === "#[") {
    // Parse as a set literal
    return parseSetLiteral();
  } else if (token === ")" || token === "]" || token === "}" || token === "#]") {
    throw new ParseError(
      `Unexpected '${token}'`, 
      position
    );
  } else if (token === ":") {
    // Standalone colon token - used in JSON object parsing
    return { type: "symbol", name: ":" } as SymbolNode;
  } else if (token.startsWith('"')) {
    try {
      const processedString = processStringLiteral(token, position);
      return { type: "literal", value: processedString } as LiteralNode;
    } catch (error) {
      if (error instanceof ParseError) throw error;
      throw new ParseError(
        `Error processing string: ${error instanceof Error ? error.message : String(error)}`, 
        position
      );
    }
  } else if (token === "true") {
    return { type: "literal", value: true } as LiteralNode;
  } else if (token === "false") {
    return { type: "literal", value: false } as LiteralNode;
  } else if (token === "null" || token === "nil") {
    return { type: "literal", value: null } as LiteralNode;
  } else if (!isNaN(Number(token))) {
    return { type: "literal", value: Number(token) } as LiteralNode;
  } else {
    return { type: "symbol", name: token } as SymbolNode;
  }
}

/**
 * The main parse function, which tokenizes and parses HQL code into an AST
 */
export function parse(input: string): HQLNode[] {
  const result = tokenize(input);
  tokens = result.tokens;
  positions = result.positions;
  pos = 0;
  
  // Parse the input
  const expressions: HQLNode[] = [];
  while (pos < tokens.length) {
    expressions.push(parseExpression());
  }
  
  // Reset global variables to avoid memory leaks
  tokens = [];
  positions = [];
  pos = 0;
  
  return expressions;
}