// src/transpiler/parser.ts - Fully fixed implementation
import { HQLNode, LiteralNode, SymbolNode, ListNode } from "./hql_ast.ts";
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
      
      // Handle reader macros
      if (!inString && ch === '#' && colIndex + 1 < line.length) {
        // Save the current token if there is one
        if (current.length > 0) {
          tokens.push(current);
          positions.push({
            line: actualLineIndex + 1,
            column: colIndex - current.length + 1,
            offset: lineOffset + colIndex - current.length
          });
          current = "";
        }
        
        // Handle reader macros: #[ for sets, #{ for maps, #"" for regex, etc.
        const nextCh = line[colIndex + 1];
        if (nextCh === '[' || nextCh === '{' || nextCh === '"' || nextCh === '(' || nextCh === ':') {
          // Push the reader macro as a single token
          tokens.push("#" + nextCh);
          positions.push({
            line: actualLineIndex + 1,
            column: colIndex + 1,
            offset: lineOffset + colIndex
          });
          colIndex++; // Skip the next character as we've processed it
          totalOffset++; // Skip this character in the offset count
          continue;
        } else {
          // For other cases like #function or #js, start collecting the token
          current = "#";
          continue;
        }
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
          // Handle colon as a separate token
          if (current.length > 0) {
            // If current token exists and this is for a named parameter, add colon to token
            if (!isWhitespace(line[colIndex - 1]) && colIndex > 0) {
              current += ch;
            } else {
              // Otherwise, add current token and then the colon as a separate token
              tokens.push(current);
              positions.push({
                line: actualLineIndex + 1,
                column: colIndex - current.length + 1,
                offset: lineOffset + colIndex - current.length
              });
              current = "";
              tokens.push(":");
              positions.push({
                line: actualLineIndex + 1,
                column: colIndex + 1,
                offset: lineOffset + colIndex
              });
            }
          } else {
            // Standalone colon
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
 * Parse a standard list
 */
function parseList(): ListNode {
  const elements: HQLNode[] = [];
  const startPos = pos - 1; // Position of the opening parenthesis
  
  while (pos < tokens.length && tokens[pos] !== ")") {
    elements.push(parseExpression());
  }
  
  if (pos >= tokens.length) {
    console.log("elements : ", elements)
    console.log("positions : ", positions)
    
    throw new ParseError(
      `Unexpected end of input in list starting at line ${positions[startPos].line}, column ${positions[startPos].column}`,
      positions[startPos]
    );
  }
  
  pos++; // Skip the closing parenthesis
  
  return { type: "list", elements };
}

/**
 * Parse a vector, either as a list with 'vector' head for normal code
 * or as a literal with array value for JSON-style code
 */
function parseVector(isNestedInObject = false): HQLNode {
  const startPos = pos - 1; // Position of the opening bracket
  // Always use "vector" as the head symbol regardless of nesting.
  const elements: HQLNode[] = [
    { type: "symbol", name: "vector" } as SymbolNode
  ];

  while (pos < tokens.length && tokens[pos] !== "]") {
    // If the token indicates the start of an object literal, parse it with parseMap.
    if (tokens[pos] === "{") {
      pos++; // Skip the opening brace
      elements.push(parseMap());
    } else if (tokens[pos] === "[") {
      // For nested arrays, recursively call parseVector without changing the head.
      pos++; // Skip the opening bracket
      elements.push(parseVector());
    } else {
      // Otherwise, parse the element as an expression.
      elements.push(parseExpression());
    }

    // Skip a comma if present.
    if (pos < tokens.length && tokens[pos] === ",") {
      pos++;
    }
  }

  if (pos >= tokens.length) {
    throw new ParseError(
      `Unexpected end of input in vector starting at line ${positions[startPos].line}`,
      positions[startPos]
    );
  }

  pos++; // Skip the closing bracket
  return { type: "list", elements };
}



function parseMap(): HQLNode {
  const startPos = pos - 1; // Position of the opening brace

  // For JSON object literals, use "hash-map" as the head symbol.
  // (This is our design: JSON objects are macros that expand to hash-maps.)
  const elements: HQLNode[] = [
    { type: "symbol", name: "hash-map" } as SymbolNode
  ];

  // (Optional debug logging if HQL_DEBUG is set)
  if (Deno.env.get("HQL_DEBUG") === "1") {
    console.log("parseMap: Starting JSON object literal at line", positions[startPos].line);
  }

  while (pos < tokens.length && tokens[pos] !== "}") {
    // Parse key
    if (pos >= tokens.length) {
      throw new ParseError(
        `Unexpected end of input in object starting at line ${positions[startPos].line}`,
        positions[startPos]
      );
    }

    // If the key token starts with a double quote, it is a JSON string key.
    // We wrap it into a list: (keyword <string literal>)
    if (tokens[pos].startsWith('"')) {
      const keyLiteral = parseExpression() as LiteralNode;
      if (keyLiteral.type !== "literal" || typeof keyLiteral.value !== "string") {
        throw new ParseError(
          `Expected string key in object at line ${positions[startPos].line}`,
          positions[pos - 1]
        );
      }
      // Wrap the literal key in a list node: (keyword "key")
      elements.push({
        type: "list",
        elements: [
          { type: "symbol", name: "keyword" } as SymbolNode,
          keyLiteral
        ]
      } as ListNode);
    } else {
      // Otherwise, just parse the key normally.
      elements.push(parseExpression());
    }

    // Expect a colon token separating key and value.
    if (pos >= tokens.length || tokens[pos] !== ":") {
      throw new ParseError(
        `Expected ':' after key in object at line ${positions[startPos].line}`,
        positions[pos - 1]
      );
    }
    pos++; // Skip the colon

    // Parse value
    if (pos >= tokens.length) {
      throw new ParseError(
        `Unexpected end of input after key in object at line ${positions[startPos].line}`,
        positions[pos - 1]
      );
    }

    if (tokens[pos] === "{") {
      // For nested objects, recursively call parseMap.
      pos++; // Skip the opening brace
      elements.push(parseMap());
    } else if (tokens[pos] === "[") {
      // For arrays, call parseVector with flag true.
      pos++; // Skip the opening bracket
      elements.push(parseVector(true));
    } else {
      // Otherwise, parse the value normally.
      elements.push(parseExpression());
    }

    // If a comma is present, skip it.
    if (pos < tokens.length && tokens[pos] === ",") {
      pos++;
    }
  }

  if (pos >= tokens.length) {
    throw new ParseError(
      `Unexpected end of input in object starting at line ${positions[startPos].line}`,
      positions[startPos]
    );
  }

  pos++; // Skip the closing brace

  // (Optional debug logging)
  if (Deno.env.get("HQL_DEBUG") === "1") {
    console.log("parseMap: Completed JSON object literal:", { elements });
  }

  return { type: "list", elements };
}


/**
 * Parse a set literal (#[...]) into a list with 'set' as first element
 */
function parseSet(): ListNode {
  const elements: HQLNode[] = [
    { type: "symbol", name: "set" } as SymbolNode
  ];
  
  const startPos = pos - 1; // Position of the opening #[
  
  while (pos < tokens.length && tokens[pos] !== "]") {
    elements.push(parseExpression());
    
    // Skip comma if present
    if (pos < tokens.length && tokens[pos] === ",") {
      pos++;
    }
  }
  
  if (pos >= tokens.length) {
    throw new ParseError(
      `Unexpected end of input in set starting at line ${positions[startPos].line}`,
      positions[startPos]
    );
  }
  
  pos++; // Skip the closing bracket
  
  return { type: "list", elements };
}

/**
 * Parse a type annotation (#:) into a list with type-annotation as first element
 */
function parseTypeAnnotation(): ListNode {
  const startPos = pos - 1; // Position of the #: token
  
  // Expect parameter name
  if (pos >= tokens.length) {
    throw new ParseError(
      `Unexpected end of input after type annotation marker at line ${positions[startPos].line}`,
      positions[startPos]
    );
  }
  
  const param = parseExpression();
  
  // Expect type name
  if (pos >= tokens.length) {
    throw new ParseError(
      `Unexpected end of input after type annotation parameter at line ${positions[startPos].line}`,
      positions[startPos]
    );
  }
  
  const type = parseExpression();
  
  return {
    type: "list",
    elements: [
      { type: "symbol", name: "type-annotation" } as SymbolNode,
      param,
      type
    ]
  };
}

/**
 * Parse an expression from the token stream
 */
function parseExpression(isNestedInObject = false): HQLNode {
  if (pos >= tokens.length) {
    throw new ParseError(
      "Unexpected end of input", 
      pos > 0 ? positions[pos - 1] : { line: 1, column: 1, offset: 0 }
    );
  }

  const token = tokens[pos];
  const position = positions[pos];
  pos++;
  
  // Handle basic forms
  if (token === "(") {
    return parseList();
  } else if (token === "[") {
    return parseVector(isNestedInObject);
  } else if (token === "{") {
    return parseMap();
  } else if (token === "#[") {
    return parseSet();
  } else if (token === "#:") {
    return parseTypeAnnotation();
  } else if (token === ")" || token === "]" || token === "}") {
    console.log("token : ", token)
    console.log("position : ", position)

    throw new ParseError(
      `Unexpected '${token}'`, 
      position
    );
  } else if (token.startsWith('"')) {
    try {
      const processedString = processStringLiteral(token, position);
      return { type: "literal", value: processedString } as LiteralNode;
    } catch (error) {
      if (error instanceof ParseError) throw error;
      console.log("token : ", token)
      console.log("position : ", position)

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
    // Handle colon tokens for keywords
    if (token === ":") {
      if (pos < tokens.length) {
        const keywordName = tokens[pos];
        pos++;
        return {
          type: "list",
          elements: [
            { type: "symbol", name: "keyword" } as SymbolNode,
            { type: "literal", value: keywordName } as LiteralNode
          ]
        } as ListNode;
      } else {
        console.log("token : ", token)
        console.log("position : ", position)
        
        throw new ParseError(
          "Unexpected end of input after colon", 
          position
        );
      }
    }
    
    // If token ends with colon, treat it as a named parameter
    if (token.endsWith(":") && token.length > 1) {
      const paramName = token.slice(0, -1);
      return {
        type: "list",
        elements: [
          { type: "symbol", name: "param" } as SymbolNode,
          { type: "literal", value: paramName } as LiteralNode
        ]
      } as ListNode;
    }
    
    // Regular symbol
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