import { HQLNode, LiteralNode, SymbolNode, ListNode } from "./hql_ast.ts";

// Position tracking for better error messages
interface Position {
  line: number;
  column: number;
  offset: number;
}

// Enhanced error class with position information
export class ParseError extends Error {
  position: Position;
  
  constructor(message: string, position: Position) {
    super(`${message} at line ${position.line}, column ${position.column}`);
    this.position = position;
    this.name = "ParseError";
  }
}

function isWhitespace(ch: string): boolean {
  return /\s/.test(ch);
}

/**
 * Process string literals, handling escape sequences properly
 * @param str The string literal including quotes
 * @param position Current position for error reporting
 */
function processStringLiteral(str: string, position: Position): string {
  // Remove the surrounding quotes
  let content = str.slice(1, -1);
  
  // Process escape sequences
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
 * A more comprehensive version that properly handles string literals.
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
 */
function tokenize(input: string): { tokens: string[], positions: Position[] } {
  // Split input into lines.
  const lines = input.split("\n");
  const tokens: string[] = [];
  const positions: Position[] = [];
  
  let current = "";
  let inString = false;
  let stringStartLine = 0;
  let stringStartColumn = 0;
  
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    // Skip lines that start with a semicolon (comment lines)
    const rawLine = lines[lineIndex];
    if (rawLine.trim().startsWith(";") && !inString) {
      continue;
    }
    
    // Remove inline comments unless in a string
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
            offset: 0 // We're not calculating actual byte offset
          });
          current = "";
          inString = false;
        }
      } else {
        if (ch === '"') {
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
        } else if (ch === "(" || ch === ")") {
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
    
    // Only add a space at end of line if inside a string
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
  
  // Handle any remaining token
  if (current.length > 0) {
    tokens.push(current);
    positions.push({
      line: lines.length,
      column: lines[lines.length - 1].length - current.length + 1,
      offset: 0
    });
  }
  
  // Check for unclosed strings
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
      throw new ParseError("Unexpected end of input", 
        pos > 0 ? positions[pos-1] : { line: 1, column: 1, offset: 0 });
    }
    
    const token = tokens[pos];
    const position = positions[pos];
    pos++;
    
    if (token === "(") {
      const elements: HQLNode[] = [];
      while (pos < tokens.length && tokens[pos] !== ")") {
        elements.push(parseExpression());
      }
      
      if (pos >= tokens.length) {
        throw new ParseError("Unclosed parenthesis", position);
      }
      
      pos++; // skip ")"
      return { type: "list", elements } as ListNode;
    } else if (token === ")") {
      throw new ParseError("Unexpected ')'", position);
    } else if (token.startsWith('"')) {
      if (!token.endsWith('"') || token.length < 2) {
        throw new ParseError("Malformed string literal", position);
      }
      
      try {
        const processedString = processStringLiteral(token, position);
        return { type: "literal", value: processedString } as LiteralNode;
      } catch (error) {
        if (error instanceof ParseError) {
          throw error;
        }
        throw new ParseError(`Error processing string: ${error.message}`, position);
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