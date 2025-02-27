// src/parser.ts
import { HQLNode, LiteralNode, SymbolNode, ListNode } from "./hql_ast.ts";
import { ParseError } from "./errors.ts";

function isWhitespace(ch: string): boolean {
  return /\s/.test(ch);
}

/**
 * Process string literals, handling escape sequences properly.
 */
function processStringLiteral(
  str: string,
  position: { line: number; column: number; offset: number; }
): string {
  // Remove the surrounding quotes
  let content = str.slice(1, -1);
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
 * Remove inline comments from a line.
 */
function removeInlineComments(line: string): string {
  let inString = false;
  let result = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && (i === 0 || line[i - 1] !== "\\")) {
      inString = !inString;
      result += ch;
    } else if (!inString && ch === ";") {
      // Once a semicolon is found outside a string, ignore the rest of the line.
      break;
    } else {
      result += ch;
    }
  }
  return result;
}

/**
 * Advanced tokenizer that supports:
 * - Better error reporting with position tracking
 * - Proper string escape sequence handling
 * - Multi-line strings
 * - Unicode character support
 * 
 * Also treats parentheses and square brackets as delimiters.
 */
function tokenize(input: string): { tokens: string[], positions: { line: number; column: number; offset: number; }[] } {
  const lines = input.split("\n");
  const tokens: string[] = [];
  const positions: { line: number; column: number; offset: number; }[] = [];
  
  let current = "";
  let inString = false;
  let stringStartLine = 0;
  let stringStartColumn = 0;
  
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const rawLine = lines[lineIndex];
    // Skip full-line comments when not inside a string.
    if (rawLine.trim().startsWith(";") && !inString) continue;
    
    const line = inString ? rawLine : removeInlineComments(rawLine);
    
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
              line: lineIndex + 1,
              column: colIndex - current.length + 1,
              offset: 0
            });
            current = "";
          }
          current += ch;
          inString = true;
          stringStartLine = lineIndex;
          stringStartColumn = colIndex;
        } else if (ch === '(' || ch === ')' || ch === '[' || ch === ']') {
          if (current.length > 0) {
            tokens.push(current);
            positions.push({
              line: lineIndex + 1,
              column: colIndex - current.length + 1,
              offset: 0
            });
            current = "";
          }
          tokens.push(ch);
          positions.push({
            line: lineIndex + 1,
            column: colIndex + 1,
            offset: 0
          });
        } else if (isWhitespace(ch)) {
          if (current.length > 0) {
            tokens.push(current);
            positions.push({
              line: lineIndex + 1,
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
        line: lineIndex + 1,
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

export function parse(input: string): HQLNode[] {
  const { tokens, positions } = tokenize(input);
  let pos = 0;
  
  function parseExpression(): HQLNode {
    if (pos >= tokens.length) {
      throw new ParseError("Unexpected end of input", pos > 0 ? positions[pos - 1] : { line: 1, column: 1, offset: 0 });
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
        throw new ParseError(token === "(" ? "Unclosed parenthesis" : "Unclosed square bracket", position);
      }
      pos++; // skip the closing delimiter
      return { type: "list", elements } as ListNode;
    } else if (token === ")" || token === "]") {
      throw new ParseError(token === ")" ? "Unexpected ')'" : "Unexpected ']'", position);
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
        throw new ParseError(`Error processing string: ${error instanceof Error ? error.message : String(error)}`, position);
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
  
  const expressions: HQLNode[] = [];
  while (pos < tokens.length) {
    expressions.push(parseExpression());
  }
  return expressions;
}
