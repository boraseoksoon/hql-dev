// src/transpiler/parser.ts

import { HQLNode, LiteralNode, SymbolNode, ListNode } from "./hql_ast.ts";
import { ParseError } from "./errors.ts";

const WHITESPACE_CHARS = new Set([' ', '\t', '\n', '\r']);

function isWhitespace(ch: string): boolean {
  return WHITESPACE_CHARS.has(ch);
}

function processStringLiteral(
  str: string,
  position: { line: number; column: number; offset: number }
): string {
  // Remove surrounding quotes
  const content = str.slice(1, -1);
  let result = "";
  
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (c === '\\' && i + 1 < content.length) {
      const next = content[i + 1];
      switch (next) {
        case 'n':  result += '\n'; break;
        case 't':  result += '\t'; break;
        case 'r':  result += '\r'; break;
        case '\\': result += '\\'; break;
        case '"':  result += '"'; break;
        case '(':  result += '('; break;
        case ')':  result += ')'; break;
        default:
          throw new ParseError(`Invalid escape sequence \\${next}`, {
            line: position.line,
            column: position.column + i,
            offset: position.offset + i
          });
      }
      i++;
    } else {
      result += c;
    }
  }
  return result;
}

function removeInlineComments(line: string): string {
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && (i === 0 || line[i - 1] !== "\\")) {
      inString = !inString;
    } else if (!inString && ch === ";") {
      // cut off
      return line.slice(0, i);
    }
  }
  return line;
}

function tokenize(input: string): {
  tokens: string[];
  positions: { line: number; column: number; offset: number }[];
} {
  const rawLines = input.split("\n");
  const lines: string[] = [];
  const lineMap: number[] = [];
  
  // Skip comment-only lines
  for (let i = 0; i < rawLines.length; i++) {
    const trimmed = rawLines[i].trim();
    if (trimmed.length > 0 && !trimmed.startsWith(";")) {
      lines.push(trimmed);
      lineMap.push(i);
    }
  }

  const tokens: string[] = [];
  const positions: { line: number; column: number; offset: number }[] = [];

  let current = "";
  let inString = false;
  let inJsonObject = false;
  let jsonBraceCount = 0;
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
      } else if (inJsonObject) {
        current += ch;
        if (ch === '{') {
          jsonBraceCount++;
        } else if (ch === '}') {
          jsonBraceCount--;
          if (jsonBraceCount === 0) {
            tokens.push(current);
            positions.push({
              line: actualLineIndex + 1,
              column: colIndex - current.length + 2,
              offset: 0
            });
            current = "";
            inJsonObject = false;
          }
        }
      } else {
        // handle set #[
        if (ch === '#' && colIndex + 1 < line.length && line[colIndex + 1] === '[') {
          if (current.length > 0) {
            tokens.push(current);
            positions.push({
              line: actualLineIndex + 1,
              column: colIndex - current.length + 1,
              offset: 0
            });
            current = "";
          }
          tokens.push("#[");
          positions.push({
            line: actualLineIndex + 1,
            column: colIndex + 1,
            offset: 0
          });
          colIndex++;
        } else if (ch === '{') {
          // Start of a potential JSON object
          if (current.length > 0) {
            tokens.push(current);
            positions.push({
              line: actualLineIndex + 1,
              column: colIndex - current.length + 1,
              offset: 0
            });
            current = "";
          }
          current = "{";
          inJsonObject = true;
          jsonBraceCount = 1;
        } else if (ch === '"') {
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
      // multiline strings
      current += "\n";
    } else if (current.length > 0 && !inJsonObject) {
      tokens.push(current);
      positions.push({
        line: actualLineIndex + 1,
        column: line.length - current.length + 1,
        offset: 0
      });
      current = "";
    }
  }

  if (current.length > 0 && !inString && !inJsonObject) {
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
  if (inJsonObject) {
    throw new ParseError("Unclosed JSON object", {
      line: lines.length,
      column: lines[lines.length - 1].length,
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
        pos > 0 ? positions[pos - 1] : { line: 1, column: 1, offset: 0 }
      );
    }
    const token = tokens[pos];
    const position = positions[pos];
    pos++;

    if (token === "(") {
      // Parse list
      const elements: HQLNode[] = [];
      while (pos < tokens.length && tokens[pos] !== ")") {
        elements.push(parseExpression());
      }
      if (pos >= tokens.length) {
        throw new ParseError("Unclosed parenthesis", position);
      }
      pos++;
      return { type: "list", elements };

    } else if (token === "[") {
      // Vector immediately becomes (vector ...)
      const vectorElements: HQLNode[] = [];
      // Add the 'vector' symbol as the first element
      vectorElements.push({ type: "symbol", name: "vector" });
      
      // Parse the vector elements
      while (pos < tokens.length && tokens[pos] !== "]") {
        vectorElements.push(parseExpression());
      }
      if (pos >= tokens.length) {
        throw new ParseError("Unclosed square bracket", position);
      }
      pos++;
      // Return as a list node with 'vector' as the first element
      return { type: "list", elements: vectorElements };

    } else if (token === "#[") {
      // Set immediately becomes (hash-set ...)
      const setElements: HQLNode[] = [];
      // Add the 'hash-set' symbol as the first element
      setElements.push({ type: "symbol", name: "hash-set" });
      
      // Parse the set elements
      while (pos < tokens.length && tokens[pos] !== "]") {
        setElements.push(parseExpression());
      }
      if (pos >= tokens.length) {
        throw new ParseError("Unclosed set notation", position);
      }
      pos++;
      // Return as a list node with 'hash-set' as the first element
      return { type: "list", elements: setElements };

    } else if (token.startsWith("{") && token.endsWith("}")) {
      // Single-token JSON object
      try {
        // Try to parse as JSON
        const obj = JSON.parse(token);
        // Convert JSON object to (hash-map k1 v1 k2 v2...)
        return convertJsonToHashMap(obj, position);
      } catch (e) {
        // If not valid JSON, use a more direct approach
        throw new ParseError(`Invalid JSON: ${token}`, position);
      }

    } else if (token === ")" || token === "]") {
      throw new ParseError(
        token === ")" ? "Unexpected ')'" : "Unexpected ']'",
        position
      );

    } else if (token.startsWith('"')) {
      // string
      const trimmed = token.trim();
      if (!trimmed.endsWith('"') || trimmed.length < 2) {
        throw new ParseError("Malformed string literal", position);
      }
      const s = processStringLiteral(trimmed, position);
      return { type: "literal", value: s };

    } else if (token === "true") {
      return { type: "literal", value: true };

    } else if (token === "false") {
      return { type: "literal", value: false };

    } else if (token === "null" || token === "nil") {
      return { type: "literal", value: null };

    } else if (!isNaN(Number(token))) {
      const v = Number(token);
      return { type: "literal", value: v };

    } else {
      // symbol
      return { type: "symbol", name: token };
    }
  }

  /**
   * Convert a JSON object to a (hash-map k1 v1 k2 v2...) form
   */
  function convertJsonToHashMap(
    obj: any, 
    position: { line: number; column: number; offset: number }
  ): ListNode {
    const elements: HQLNode[] = [];
    // Add the 'hash-map' symbol as the first element
    elements.push({ type: "symbol", name: "hash-map" });
    
    // Add key-value pairs
    for (const [key, value] of Object.entries(obj)) {
      // Add key
      elements.push({ type: "literal", value: key });
      
      // Add value (recursively converting nested objects/arrays)
      if (value === null) {
        elements.push({ type: "literal", value: null });
      } else if (Array.isArray(value)) {
        // Handle arrays as vectors
        const vectorElements: HQLNode[] = [];
        vectorElements.push({ type: "symbol", name: "vector" });
        for (const item of value) {
          if (typeof item === "object" && item !== null) {
            if (Array.isArray(item)) {
              // Nested array
              const nestedVectorElements: HQLNode[] = [];
              nestedVectorElements.push({ type: "symbol", name: "vector" });
              for (const nestedItem of item) {
                nestedVectorElements.push({ type: "literal", value: nestedItem });
              }
              vectorElements.push({ type: "list", elements: nestedVectorElements });
            } else {
              // Nested object
              vectorElements.push(convertJsonToHashMap(item, position));
            }
          } else {
            // Simple value
            vectorElements.push({ type: "literal", value: item });
          }
        }
        elements.push({ type: "list", elements: vectorElements });
      } else if (typeof value === "object" && value !== null) {
        // Handle nested objects
        elements.push(convertJsonToHashMap(value, position));
      } else {
        // Handle simple values
        elements.push({ type: "literal", value: value || null });
      }
    }
    
    return { type: "list", elements };
  }

  const results: HQLNode[] = [];
  while (pos < tokens.length) {
    results.push(parseExpression());
  }
  return results;
}