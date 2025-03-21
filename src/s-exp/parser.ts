// src/s-exp/parser.ts - Refactored with regex-driven approach
import { SExp, SList, isSymbol, createSymbol, createList, createLiteral, createNilLiteral, sexpToString } from './types.ts';
import { ParseError } from '../transpiler/errors.ts';
import { perform } from '../transpiler/error-utils.ts';

// Token interface for cleaner type handling
interface Token {
  type: TokenType;
  value: string;
  position: SourcePosition;
}

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
  Comma
}

// Position tracking for error reporting
interface SourcePosition {
  line: number;
  column: number;
  offset: number;
}

/**
 * Parse HQL source into S-expressions with error location context
 */
export function parse(input: string): SExp[] {
  return perform(() => {
    const tokens = tokenize(input);
    return parseTokens(tokens, input);
  }, "Failed to parse input", ParseError, [{ line: 1, column: 1, offset: 0 }, input]);
}

/**
 * Tokenize the input string using regex patterns.
 * This is a major improvement over character-by-character processing.
 */
function tokenize(input: string): Token[] {
  return perform(() => {
    const tokens: Token[] = [];
    
    // Combined regex pattern for all token types
    // This handles all special cases in a declarative way
    const tokenPattern = /(#\[|\(|\)|\[|\]|\{|\}|"(?:\\.|[^\\"])*"|\.|:|,|'|`|~@|~|;.*|\/\/.*|\/\*[\s\S]*?\*\/|\s+|[^\s\(\)\[\]\{\}"'`,;]+)/g;
    
    let line = 1;
    let column = 1;
    let match: RegExpExecArray | null;
    
    while ((match = tokenPattern.exec(input)) !== null) {
      const value = match[0];
      const position: SourcePosition = { 
        line, 
        column, 
        offset: match.index 
      };
      
      // Skip comments and whitespace
      if (value.startsWith(';') || value.startsWith('//') || value.startsWith('/*') || /^\s+$/.test(value)) {
        // Update line and column tracking
        updatePositionInfo(value, position);
        continue;
      }
      
      // Determine token type and add to tokens list
      const type = getTokenType(value);
      tokens.push({ type, value, position });
      
      // Update line and column tracking
      updatePositionInfo(value, position);
    }
    
    return tokens;
  }, "Failed to tokenize input");
}

/**
 * Update line and column information as we process tokens
 */
function updatePositionInfo(value: string, position: SourcePosition): void {
  for (const char of value) {
    if (char === '\n') {
      position.line++;
      position.column = 1;
    } else {
      position.column++;
    }
  }
}

/**
 * Determine token type from the token value
 */
function getTokenType(value: string): TokenType {
  switch (value) {
    case '(': return TokenType.LeftParen;
    case ')': return TokenType.RightParen;
    case '[': return TokenType.LeftBracket;
    case ']': return TokenType.RightBracket;
    case '{': return TokenType.LeftBrace;
    case '}': return TokenType.RightBrace;
    case '#[': return TokenType.HashLeftBracket;
    case '.': return TokenType.Dot;
    case ':': return TokenType.Colon;
    case ',': return TokenType.Comma;
    case "'": return TokenType.Quote;
    case '`': return TokenType.Backtick;
    case '~': return TokenType.Unquote;
    case '~@': return TokenType.UnquoteSplicing;
    default:
      if (value.startsWith('"')) {
        return TokenType.String;
      }
      if (!isNaN(Number(value))) {
        return TokenType.Number;
      }
      return TokenType.Symbol;
  }
}

/**
 * Parser state interface for clean encapsulation of parse state
 */
interface ParserState {
  tokens: Token[];
  currentPos: number;
  input: string;
}

/**
 * Parse the tokens into S-expressions
 */
function parseTokens(tokens: Token[], input: string): SExp[] {
  const state: ParserState = {
    tokens,
    currentPos: 0,
    input
  };
  
  const nodes: SExp[] = [];
  
  while (state.currentPos < state.tokens.length) {
    nodes.push(parseExpression(state));
  }
  
  return nodes;
}

/**
 * Parse a single expression from the token stream
 */
function parseExpression(state: ParserState): SExp {
  return perform(() => {
    if (state.currentPos >= state.tokens.length) {
      const lastPos = state.tokens.length > 0 
        ? state.tokens[state.tokens.length - 1].position 
        : { line: 1, column: 1, offset: 0 };
      
      throw new ParseError(
        "Unexpected end of input",
        lastPos,
        state.input
      );
    }
    
    const token = state.tokens[state.currentPos++];
    
    return parseExpressionByTokenType(token, state);
  }, "Error parsing expression");
}

/**
 * Parse an expression based on the token type
 */
function parseExpressionByTokenType(token: Token, state: ParserState): SExp {
  return perform(() => {
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
        return createList(createSymbol('quote'), parseExpression(state));
      
      case TokenType.Backtick:
        return createList(createSymbol('quasiquote'), parseExpression(state));
      
      case TokenType.Unquote:
        return createList(createSymbol('unquote'), parseExpression(state));
      
      case TokenType.UnquoteSplicing:
        return createList(createSymbol('unquote-splicing'), parseExpression(state));
      
      case TokenType.Comma:
        return createList(createSymbol('unquote'), parseExpression(state));
      
      case TokenType.Dot:
        // Handle property access after a parenthesized expression
        if (state.currentPos < state.tokens.length) {
          const nextToken = state.tokens[state.currentPos++];
          return createSymbol("." + nextToken.value);
        } else {
          throw new ParseError("Expected property name after '.'", token.position, state.input);
        }
      
      case TokenType.String:
        const str = token.value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        return createLiteral(str);
      
      case TokenType.Number:
        return createLiteral(Number(token.value));
      
      case TokenType.Symbol:
        if (token.value === "true") {
          return createLiteral(true);
        } else if (token.value === "false") {
          return createLiteral(false);
        } else if (token.value === "nil") {
          return createNilLiteral();
        } else {
          // Handle dot notation with dashed properties
          if (token.value.includes('.') && !token.value.startsWith('.') && !token.value.endsWith('.')) {
            const parts = token.value.split('.');
            const objectName = parts[0];
            const propertyPath = parts.slice(1).join('.');
            
            // If property contains dashes, transform to a get call
            if (propertyPath.includes('-')) {
              // Return a list that represents (get objectName "propertyPath")
              return createList(
                createSymbol("get"),
                createSymbol(objectName),
                createLiteral(propertyPath)
              );
            }
          }
          
          return createSymbol(token.value);
        }
      
      default:
        throw new ParseError(`Unexpected token type: ${token.type}`, token.position, state.input);
    }
  }, `Error parsing ${TokenType[token.type]}`, ParseError, [token.position, state.input]);
}

/**
 * Parse a list expression: (element1 element2 ...)
 */
function parseList(state: ParserState): SList {
  return perform(() => {
    const listStartPos = state.tokens[state.currentPos - 1].position;
    const elements: SExp[] = [];
    
    // Process the first token to see if it's a dot notation
    if (state.currentPos < state.tokens.length && 
        state.tokens[state.currentPos].type !== TokenType.RightParen &&
        state.tokens[state.currentPos].value.includes('.') &&
        !state.tokens[state.currentPos].value.startsWith('.') &&
        !state.tokens[state.currentPos].value.endsWith('.')) {
      
      // This is a dot notation expression - handle it explicitly
      const dotToken = state.tokens[state.currentPos++].value;
      
      // Split by dots to handle multi-part property paths
      const parts = dotToken.split('.');
      
      if (parts.length > 2) {
        // Multi-part property path like "obj.prop1.prop2"
        const objectName = parts[0];
        const propPath = parts.slice(1);
        
        // Create a nested chain of js-get-invoke expressions
        let currentExpr: any = {
          type: "list",
          elements: [
            createSymbol("js-get-invoke"),
            createSymbol(objectName),
            createLiteral(propPath[0])
          ]
        };
        
        // Chain the remaining properties
        for (let i = 1; i < propPath.length; i++) {
          currentExpr = {
            type: "list",
            elements: [
              createSymbol("js-get-invoke"),
              currentExpr,
              createLiteral(propPath[i])
            ]
          };
        }
        
        // If there are arguments, convert the last js-get-invoke to js-call
        if (state.currentPos < state.tokens.length && state.tokens[state.currentPos].type !== TokenType.RightParen) {
          const args: SExp[] = [];
          while (state.currentPos < state.tokens.length && state.tokens[state.currentPos].type !== TokenType.RightParen) {
            args.push(parseExpression(state));
          }
          
          // Replace the outermost expression's js-get-invoke with js-call
          currentExpr.elements[0] = createSymbol("js-call");
          // Add the arguments
          currentExpr.elements.push(...args);
        }
        
        elements.push(currentExpr);
      } else {
        // Simple property path like "obj.prop"
        const objectName = parts[0];
        const property = parts[1];
        
        // If there are no additional arguments, treat it as a property access
        if (state.currentPos < state.tokens.length && state.tokens[state.currentPos].type === TokenType.RightParen) {
          // Create a property access node (using js-get-invoke)
          elements.push(createSymbol("js-get-invoke"));
          elements.push(createSymbol(objectName));
          elements.push(createLiteral(property));
        } else {
          // Otherwise, it's a method call - create a method call node (using js-call)
          elements.push(createSymbol("js-call"));
          elements.push(createSymbol(objectName));
          elements.push(createLiteral(property));
          
          // Parse arguments for the method call
          while (state.currentPos < state.tokens.length && state.tokens[state.currentPos].type !== TokenType.RightParen) {
            elements.push(parseExpression(state));
          }
        }
      }
    } else {
      // Standard list parsing
      while (state.currentPos < state.tokens.length && state.tokens[state.currentPos].type !== TokenType.RightParen) {
        elements.push(parseExpression(state));
      }
    }
    
    if (state.currentPos >= state.tokens.length) {
      throw new ParseError(
        "Unclosed list",
        listStartPos,
        state.input
      );
    }
    
    state.currentPos++; // Skip the closing parenthesis
    
    // Check if there's a dot after the list
    if (state.currentPos < state.tokens.length && state.tokens[state.currentPos].type === TokenType.Dot) {
      state.currentPos++; // Skip the dot
      
      if (state.currentPos >= state.tokens.length) {
        throw new ParseError(
          "Expected property name after dot",
          state.tokens[state.currentPos - 1].position,
          state.input
        );
      }
      
      // Get the property/method name
      const propName = state.tokens[state.currentPos++].value;
      
      // Create a new list that represents property access on the original list result
      return createList(
        createSymbol("js-get-invoke"),
        createList(...elements), // Original list becomes the object
        createLiteral(propName)
      );
    }
    
    return createList(...elements);
  }, "Error parsing list", ParseError, [state.tokens[state.currentPos - 1].position, state.input]);
}

/**
 * Parse a vector: [element1, element2, ...]
 */
function parseVector(state: ParserState): SList {
  return perform(() => {
    const startPos = state.tokens[state.currentPos - 1].position;
    const elements: SExp[] = [];
    
    while (state.currentPos < state.tokens.length && state.tokens[state.currentPos].type !== TokenType.RightBracket) {
      // Parse the current element
      const expr = parseExpression(state);
      elements.push(expr);
      
      // Check if this might be an 'as' alias construct
      if (isSymbol(expr) && 
          state.currentPos < state.tokens.length && 
          state.tokens[state.currentPos].value === 'as') {
        
        // Add the 'as' symbol
        elements.push(createSymbol('as'));
        state.currentPos++; // Skip the 'as' token
        
        // Parse the alias name
        if (state.currentPos < state.tokens.length && 
            state.tokens[state.currentPos].type !== TokenType.Comma && 
            state.tokens[state.currentPos].type !== TokenType.RightBracket) {
          const alias = parseExpression(state);
          elements.push(alias);
        } else {
          const errorPos = state.currentPos < state.tokens.length 
            ? state.tokens[state.currentPos].position 
            : startPos;
          throw new ParseError(
            "Expected alias after 'as' keyword",
            errorPos,
            state.input
          );
        }
      }
      
      // Skip comma if present
      if (state.currentPos < state.tokens.length && state.tokens[state.currentPos].type === TokenType.Comma) {
        state.currentPos++;
      }
    }
    
    if (state.currentPos >= state.tokens.length) {
      throw new ParseError(
        "Unclosed vector",
        startPos,
        state.input
      );
    }
    
    state.currentPos++; // Skip the closing bracket
    
    // For empty vector, return a special empty array literal
    if (elements.length === 0) {
      return createList(createSymbol("empty-array"));
    }
    
    // Return a vector with all elements
    return createList(createSymbol("vector"), ...elements);
  }, "Error parsing vector", ParseError, [state.tokens[state.currentPos - 1].position, state.input]);
}

/**
 * Parse a map: {key1: value1, key2: value2, ...}
 */
function parseMap(state: ParserState): SList {
  return perform(() => {
    const startPos = state.tokens[state.currentPos - 1].position;
    const entries: SExp[] = [];
    
    while (state.currentPos < state.tokens.length && state.tokens[state.currentPos].type !== TokenType.RightBrace) {
      // Parse key
      const key = parseExpression(state);
      
      // Expect colon
      if (state.currentPos >= state.tokens.length || state.tokens[state.currentPos].type !== TokenType.Colon) {
        const errorPos = state.currentPos < state.tokens.length 
          ? state.tokens[state.currentPos].position 
          : startPos;
        throw new ParseError(
          "Expected ':' in map literal",
          errorPos,
          state.input
        );
      }
      state.currentPos++; // Skip colon
      
      // Parse value
      const value = parseExpression(state);
      
      // Add key-value pair
      entries.push(key);
      entries.push(value);
      
      // Skip comma if present
      if (state.currentPos < state.tokens.length && state.tokens[state.currentPos].type === TokenType.Comma) {
        state.currentPos++;
      }
    }
    
    if (state.currentPos >= state.tokens.length) {
      throw new ParseError(
        "Unclosed map",
        startPos,
        state.input
      );
    }
    
    state.currentPos++; // Skip the closing brace
    
    // For empty map, return a special empty map literal
    if (entries.length === 0) {
      return createList(createSymbol("empty-map"));
    }
    
    // For non-empty map, proceed with hash-map function
    return createList(createSymbol("hash-map"), ...entries);
  }, "Error parsing map", ParseError, [state.tokens[state.currentPos - 1].position, state.input]);
}

/**
 * Parse a set: #[element1, element2, ...]
 */
function parseSet(state: ParserState): SList {
  return perform(() => {
    const startPos = state.tokens[state.currentPos - 1].position;
    const elements: SExp[] = [];
    
    while (state.currentPos < state.tokens.length && state.tokens[state.currentPos].type !== TokenType.RightBracket) {
      elements.push(parseExpression(state));
      
      // Skip comma if present
      if (state.currentPos < state.tokens.length && state.tokens[state.currentPos].type === TokenType.Comma) {
        state.currentPos++;
      }
    }
    
    if (state.currentPos >= state.tokens.length) {
      throw new ParseError(
        "Unclosed set",
        startPos,
        state.input
      );
    }
    
    state.currentPos++; // Skip the closing bracket
    
    // For empty set, return a special empty set literal
    if (elements.length === 0) {
      return createList(createSymbol("empty-set"));
    }
    
    // For non-empty set, proceed with hash-set function
    return createList(createSymbol("hash-set"), ...elements);
  }, "Error parsing set", ParseError, [state.tokens[state.currentPos - 1].position, state.input]);
}