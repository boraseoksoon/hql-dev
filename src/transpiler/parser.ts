// src/transpiler/parser.ts

import { HQLNode, LiteralNode, SymbolNode, ListNode, VectorNode, SetNode, MapNode } from "./hql_ast.ts";
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
      // parse list
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
      // parse vector
      const elements: HQLNode[] = [];
      while (pos < tokens.length && tokens[pos] !== "]") {
        elements.push(parseExpression());
      }
      if (pos >= tokens.length) {
        throw new ParseError("Unclosed square bracket", position);
      }
      pos++;
      return { type: "vector", elements };

    } else if (token === "#[") {
      // parse set
      const elements: HQLNode[] = [];
      while (pos < tokens.length && tokens[pos] !== "]") {
        elements.push(parseExpression());
      }
      if (pos >= tokens.length) {
        throw new ParseError("Unclosed set notation", position);
      }
      pos++;
      return { type: "set", elements };

    } else if (token === "{") {
      // multi-token curly braces => parse as map
      return parseMap(position);

    } else if (token.startsWith("{") && token.endsWith("}")) {
      // single-token curly
      try {
        const obj = JSON.parse(token);
        // if it works => treat as literal
        return { type: "literal", value: obj };
      } catch {
        // else parse as HQL map with reentrant parse
        return parseCurlyStringAsMap(token, position);
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
   * parse a curly map from multiple tokens until '}'.
   */
  function parseMap(startPos: { line: number; column: number; offset: number }): MapNode {
    const pairs: [HQLNode, HQLNode][] = [];
    while (true) {
      if (pos >= tokens.length) {
        throw new ParseError("Unclosed curly brace", startPos);
      }
      const tk = tokens[pos];
      if (tk === "}") {
        pos++;
        break;
      }
      const key = parseExpression();
      if (pos >= tokens.length) {
        throw new ParseError("Map missing value for last key", startPos);
      }
      if (tokens[pos] === "}") {
        throw new ParseError("Map missing value for last key", positions[pos]);
      }
      const val = parseExpression();
      pairs.push([key, val]);
    }
    return { type: "map", pairs };
  }

  /**
   * If single-token '{...}' not valid JSON, parse it as HQL map by reentrant parse
   * *without* reassigning tokens. We create a new parse() call on the inside text.
   */
  // In parser.ts
function parseCurlyStringAsMap(tokenStr: string, startPos: { line: number; column: number; offset: number }): MapNode {
  // Remove outer braces
  const content = tokenStr.slice(1, -1).trim();
  const pairs: [HQLNode, HQLNode][] = [];
  
  // Empty object case
  if (!content) {
    return { type: "map", pairs };
  }
  
  // Try to parse as JSON first
  try {
    const jsonObj = JSON.parse(tokenStr);
    // Successfully parsed as JSON, convert to MapNode
    for (const key in jsonObj) {
      const value = jsonObj[key];
      pairs.push([
        { type: "literal", value: key },
        { type: "literal", value: value }
      ]);
    }
    return { type: "map", pairs };
  } catch (e) {
    // Not valid JSON - use a simpler key-value pair extraction
    // This is a simplified approach for demonstration - real implementation
    // would need to handle nested structures, quoted strings, etc.
    const keyValuePairs = content.split(',');
    
    for (const pair of keyValuePairs) {
      const [key, value] = pair.split(':').map(s => s.trim());
      if (!key || !value) {
        throw new ParseError(`Invalid map entry: ${pair}`, startPos);
      }
      
      // Try to parse key and value as simple literals or symbols
      // (This is simplified and would need more robust parsing)
      let keyNode: HQLNode;
      let valueNode: HQLNode;
      
      // Simple literal or symbol parsing
      if (key.startsWith('"') && key.endsWith('"')) {
        keyNode = { type: "literal", value: key.slice(1, -1) };
      } else if (!isNaN(Number(key))) {
        keyNode = { type: "literal", value: Number(key) };
      } else {
        keyNode = { type: "symbol", name: key };
      }
      
      if (value.startsWith('"') && value.endsWith('"')) {
        valueNode = { type: "literal", value: value.slice(1, -1) };
      } else if (!isNaN(Number(value))) {
        valueNode = { type: "literal", value: Number(value) };
      } else if (value === "true") {
        valueNode = { type: "literal", value: true };
      } else if (value === "false") {
        valueNode = { type: "literal", value: false };
      } else if (value === "null") {
        valueNode = { type: "literal", value: null };
      } else {
        valueNode = { type: "symbol", name: value };
      }
      
      pairs.push([keyNode, valueNode]);
    }
    
    return { type: "map", pairs };
  }
}
  
  // Helper function to convert JSON to MapNode
  function convertJsonToMapNode(json: any): MapNode {
    const pairs: [HQLNode, HQLNode][] = [];
    for (const key in json) {
      pairs.push([
        { type: "literal", value: key },
        convertJsonValueToNode(json[key])
      ]);
    }
    return { type: "map", pairs };
  }
  
  // Helper to convert JSON values to appropriate nodes
  function convertJsonValueToNode(value: any): HQLNode {
    if (value === null) return { type: "literal", value: null };
    if (typeof value === "string") return { type: "literal", value };
    if (typeof value === "number") return { type: "literal", value };
    if (typeof value === "boolean") return { type: "literal", value };
    if (Array.isArray(value)) {
      return { type: "vector", elements: value.map(v => convertJsonValueToNode(v)) };
    }
    if (typeof value === "object") {
      return convertJsonToMapNode(value);
    }
    return { type: "literal", value: String(value) };
  }
  
  // Split a string by a delimiter, preserving structure of {} [] ()
  function splitPreservingStructure(str: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = "";
    let depth = 0;
    let inString = false;
    
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      
      if (char === '"' && (i === 0 || str[i-1] !== '\\')) {
        inString = !inString;
        current += char;
      } else if (inString) {
        current += char;
      } else if (char === '{' || char === '[' || char === '(') {
        depth++;
        current += char;
      } else if (char === '}' || char === ']' || char === ')') {
        depth--;
        current += char;
      } else if (char === delimiter && depth === 0) {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    
    if (current) {
      result.push(current);
    }
    
    return result;
  }
  
  // Parse a simple value without calling the full parser
  function parseSimpleValue(value: string, pos: { line: number; column: number; offset: number }): HQLNode {
    value = value.trim();
    
    // Handle string literals
    if (value.startsWith('"') && value.endsWith('"')) {
      return { type: "literal", value: value.slice(1, -1) };
    }
    
    // Handle numbers
    if (!isNaN(Number(value))) {
      return { type: "literal", value: Number(value) };
    }
    
    // Handle boolean and null
    if (value === "true") return { type: "literal", value: true };
    if (value === "false") return { type: "literal", value: false };
    if (value === "null") return { type: "literal", value: null };
    
    // Default to treating as a symbol
    return { type: "symbol", name: value };
  }

  const results: HQLNode[] = [];
  while (pos < tokens.length) {
    results.push(parseExpression());
  }
  return results;
}
