// src/transpiler/parser.ts
import { HQLNode, LiteralNode, SymbolNode, ListNode } from "./hql_ast.ts";
import { ParseError } from "./errors.ts";

// Constant for quickly checking whitespace characters
const WHITESPACE_CHARS = new Set([' ', '\t', '\n', '\r']);

/**
 * Check if a character is whitespace
 */
function isWhitespace(ch: string): boolean {
  return WHITESPACE_CHARS.has(ch);
}

/**
 * Process string literals, handling escape sequences properly.
 * Uses pre-allocated result string for better performance.
 */
function processStringLiteral(
  str: string,
  position: { line: number; column: number; offset: number; }
): string {
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
          throw new ParseError(`Invalid escape sequence \\${next}`, {
            line: position.line,
            column: position.column + i,
            offset: position.offset + i
          });
      }
      i++; // Skip the escaped character
    } else {
      result += content[i];
    }
  }
  
  return result;
}

/**
 * Remove inline comments from a line more efficiently
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
 * Advanced tokenizer with optimizations for better performance
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
  
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const actualLineIndex = lineMap[lineIndex];
    const line = inString ? lines[lineIndex] : removeInlineComments(lines[lineIndex]);
    
    for (let colIndex = 0; colIndex < line.length; colIndex++) {
      const ch = line[colIndex];
      
      if (inString) {
        current += ch;
        if (ch === '"' && line[colIndex - 1] !== "\\") {
          tokens.push(current);
          positions.push({
            line: stringStartLine + 1,
            column: stringStartColumn + 1,
            offset: 0
          });
          current = "";
          inString = false;
        }
      } else {
        if (ch === '"' ) {
          if (current.length > 0) {
            tokens.push(current);
            positions.push({
              line: actualLineIndex + 1,
              column: colIndex - current.length + 1,
              offset: 0
            });
            current = "";
          }
          current += ch;
          inString = true;
          stringStartLine = actualLineIndex;
          stringStartColumn = colIndex;
        } else if (ch === '(' || ch === ')' || ch === '[' || ch === ']') {
          if (current.length > 0) {
            tokens.push(current);
            positions.push({
              line: actualLineIndex + 1,
              column: colIndex - current.length + 1,
              offset: 0
            });
            current = "";
          }
          tokens.push(ch);
          positions.push({
            line: actualLineIndex + 1,
            column: colIndex + 1,
            offset: 0
          });
        } else if (isWhitespace(ch)) {
          if (current.length > 0) {
            tokens.push(current);
            positions.push({
              line: actualLineIndex + 1,
              column: colIndex - current.length + 1,
              offset: 0
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
    } else if (current.length > 0) {
      tokens.push(current);
      positions.push({
        line: actualLineIndex + 1,
        column: line.length - current.length + 1,
        offset: 0
      });
      current = "";
    }
  }
  
  if (current.length > 0) {
    tokens.push(current);
    positions.push({
      line: lines.length,
      column: lines[lines.length - 1].length - current.length + 1,
      offset: 0
    });
  }
  
  if (inString) {
    throw new ParseError("Unclosed string literal", {
      line: stringStartLine + 1,
      column: stringStartColumn + 1,
      offset: 0
    });
  }
  
  return { tokens, positions };
}

/**
 * The main parse function, which tokenizes and parses HQL code into an AST
 */
export function parse(input: string): HQLNode[] {
  const { tokens, positions } = tokenize(input);
  let pos = 0;
  
  // Cache of known symbols
  const symbolCache = new Map<string, SymbolNode>();
  // Cache of known literals
  const literalCache = new Map<string, LiteralNode>();
  
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
    
    if (token === "(" || token === "[") {
      const closing = token === "(" ? ")" : "]";
      const elements: HQLNode[] = [];
      while (pos < tokens.length && tokens[pos] !== closing) {
        elements.push(parseExpression());
      }
      if (pos >= tokens.length) {
        // Use expected error message.
        throw new ParseError(
          token === "(" ? "Unclosed parenthesis" : "Unclosed square bracket", 
          position
        );
      }
      pos++; // skip the closing delimiter
      return { type: "list", elements } as ListNode;
    } else if (token === ")" || token === "]") {
      throw new ParseError(
        token === ")" ? "Unexpected ')'" : "Unexpected ']'", 
        position
      );
    } else if (token.startsWith('"')) {
      const trimmed = token.trim();
      if (!trimmed.endsWith('"') || trimmed.length < 2) {
        throw new ParseError("Malformed string literal", position);
      }
      try {
        const processedString = processStringLiteral(trimmed, position);
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
      // Cache numeric literals
      if (literalCache.has(token)) {
        return literalCache.get(token)!;
      }
      const numLiteral = { type: "literal", value: Number(token) } as LiteralNode;
      literalCache.set(token, numLiteral);
      return numLiteral;
    } else {
      // Cache symbols
      if (symbolCache.has(token)) {
        return symbolCache.get(token)!;
      }
      const symbol = { type: "symbol", name: token } as SymbolNode;
      symbolCache.set(token, symbol);
      return symbol;
    }
  }
  
  const expressions: HQLNode[] = [];
  while (pos < tokens.length) {
    expressions.push(parseExpression());
  }
  return expressions;
}