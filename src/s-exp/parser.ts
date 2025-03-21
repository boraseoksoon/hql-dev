// src/s-exp/parser.ts - Parser for S-expressions with enhanced error handling

import { SExp, SList, isSymbol, createSymbol, createList, createLiteral, createNilLiteral } from './types.ts';
import { ParseError } from '../transpiler/errors.ts';

// Track line and column information during parsing
interface SourcePosition {
  line: number;
  column: number;
  offset: number;
}

/**
* Parse HQL source into S-expressions with error location context
*/
export function parse(input: string): SExp[] {
  try {
    const tokens = tokenize(input);
    return parseTokens(tokens, input);
  } catch (error) {
    // If it's already a ParseError, just pass it through
    if (error instanceof ParseError) throw error;
    
    // Otherwise, convert to a ParseError with position info if possible
    let position: SourcePosition = { line: 1, column: 1, offset: 0 };
    if ('position' in error) {
      position = error.position;
    }
    
    throw new ParseError(
      `Parse error: ${error instanceof Error ? error.message : String(error)}`,
      position,
      input
    );
  }
}

/**
* Tokenize HQL source code into tokens with position tracking
*/
function tokenize(input: string): { token: string, position: SourcePosition }[] {
  const tokens: { token: string, position: SourcePosition }[] = [];
  let current = '';
  let inString = false;
  let inComment = false;
  let inMultilineComment = false;
  let line = 1;
  let column = 1;
  let offset = 0;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    offset = i;

    // Handle newlines for line/column tracking
    if (char === '\n') {
      line++;
      column = 1;
      
      // Handle comments ending at newlines
      if (inComment) {
        inComment = false;
      }
      
      if (!inString && !inMultilineComment) {
        if (current !== '') {
          tokens.push({ 
            token: current, 
            position: { line, column: column - current.length, offset: i - current.length } 
          });
          current = '';
        }
        continue;
      }
    } else {
      column++;
    }

    // Handle comments
    if (inComment) {
      continue;
    }

    if (inMultilineComment) {
      if (char === '*' && i + 1 < input.length && input[i + 1] === '/') {
        inMultilineComment = false;
        i++; // Skip the closing '/'
        column++;
      }
      continue;
    }

    if (!inString && char === ';') {
      if (current !== '') {
        tokens.push({ 
          token: current, 
          position: { line, column: column - current.length, offset: i - current.length } 
        });
        current = '';
      }
      inComment = true;
      continue;
    }

    if (!inString && char === '/' && i + 1 < input.length) {
      if (input[i + 1] === '/') {
        if (current !== '') {
          tokens.push({ 
            token: current, 
            position: { line, column: column - current.length, offset: i - current.length } 
          });
          current = '';
        }
        inComment = true;
        i++; // Skip the second '/'
        column++;
        continue;
      } else if (input[i + 1] === '*') {
        if (current !== '') {
          tokens.push({ 
            token: current, 
            position: { line, column: column - current.length, offset: i - current.length } 
          });
          current = '';
        }
        inMultilineComment = true;
        i++; // Skip the '*'
        column++;
        continue;
      }
    }

    // Handle strings
    if (inString) {
      current += char;
      if (char === '"' && input[i - 1] !== '\\') {
        inString = false;
        tokens.push({ 
          token: current, 
          position: { line, column: column - current.length, offset: i - current.length + 1 } 
        });
        current = '';
      }
      continue;
    }

    if (char === '"') {
      if (current !== '') {
        tokens.push({ 
          token: current, 
          position: { line, column: column - current.length, offset: i - current.length } 
        });
        current = '';
      }
      current = '"';
      inString = true;
      continue;
    }

    // Handle special tokens
    if (char === '(' || char === ')' || 
       char === '[' || char === ']' || 
       char === '{' || char === '}') {
      if (current !== '') {
        tokens.push({ 
          token: current, 
          position: { line, column: column - current.length, offset: i - current.length } 
        });
        current = '';
      }
      tokens.push({ 
        token: char, 
        position: { line, column: column - 1, offset: i } 
      });
      continue;
    }

    // Handle whitespace
    if (/\s/.test(char)) {
      if (current !== '') {
        tokens.push({ 
          token: current, 
          position: { line, column: column - current.length, offset: i - current.length } 
        });
        current = '';
      }
      continue;
    }

    // Handle special characters
    if (char === ':') {
      if (current !== '') {
        tokens.push({ 
          token: current, 
          position: { line, column: column - current.length, offset: i - current.length } 
        });
        current = '';
      }
      tokens.push({ 
        token: ':', 
        position: { line, column: column - 1, offset: i } 
      });
      continue;
    }

    if (char === ',') {
      if (current !== '') {
        tokens.push({ 
          token: current, 
          position: { line, column: column - current.length, offset: i - current.length } 
        });
        current = '';
      }
      tokens.push({ 
        token: ',', 
        position: { line, column: column - 1, offset: i } 
      });
      continue;
    }

    // Handle quote, backtick, and unquote shortcuts
    if (char === '\'' || char === '`') {
      if (current !== '') {
        tokens.push({ 
          token: current, 
          position: { line, column: column - current.length, offset: i - current.length } 
        });
        current = '';
      }
      tokens.push({ 
        token: char, 
        position: { line, column: column - 1, offset: i } 
      });
      continue;
    }

    if (char === '~') {
      if (current !== '') {
        tokens.push({ 
          token: current, 
          position: { line, column: column - current.length, offset: i - current.length } 
        });
        current = '';
      }
      
      // Handle unquote-splicing (~@)
      if (i + 1 < input.length && input[i + 1] === '@') {
        tokens.push({ 
          token: '~@', 
          position: { line, column: column - 1, offset: i } 
        });
        i++; // Skip the '@'
        column++;
      } else {
        tokens.push({ 
          token: '~', 
          position: { line, column: column - 1, offset: i } 
        });
      }
      continue;
    }

    // Handle hash set (#[)
    if (char === '#' && i + 1 < input.length && input[i + 1] === '[') {
      if (current !== '') {
        tokens.push({ 
          token: current, 
          position: { line, column: column - current.length, offset: i - current.length } 
        });
        current = '';
      }
      tokens.push({ 
        token: '#[', 
        position: { line, column: column - 1, offset: i } 
      });
      i++; // Skip the '['
      column++;
      continue;
    }

    // Accumulate characters
    current += char;
  }

  if (current !== '') {
    tokens.push({ 
      token: current, 
      position: { line, column: column - current.length, offset: input.length - current.length } 
    });
  }

  return tokens;
}

// Parse state for error tracking
interface ParseState {
  tokens: { token: string, position: SourcePosition }[];
  currentPos: number;
  input: string;
}

let state: ParseState = {
  tokens: [],
  currentPos: 0,
  input: ''
};

/**
* Parse tokens into S-expressions
*/
function parseTokens(tokens: { token: string, position: SourcePosition }[], input: string): SExp[] {
  state = {
    tokens,
    currentPos: 0,
    input
  };
  
  const nodes: SExp[] = [];
  while (state.currentPos < state.tokens.length) {
    nodes.push(parseExpression());
  }
  return nodes;
}

/**
* Parse a single expression with error handling
*/
function parseExpression(): SExp {
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
  
  const { token, position } = state.tokens[state.currentPos++];
  
  try {
    return parseExpressionContent(token, position);
  } catch (error) {
    if (error instanceof ParseError) {
      throw error;
    }
    
    throw new ParseError(
      `Error parsing token "${token}": ${error instanceof Error ? error.message : String(error)}`,
      position,
      state.input
    );
  }
}

/**
* Parse the content of an expression token
*/
function parseExpressionContent(token: string, position: SourcePosition): SExp {
  // Handle quote shorthand (')
  if (token === "'") {
    // Parse the next expression and wrap it in a quote
    const quoted = parseExpression();
    return createList(createSymbol('quote'), quoted);
  }
  
  // Handle quasiquote (`)
  if (token === "`") {
    // Parse the next expression and wrap it in a quasiquote
    const quasiquoted = parseExpression();
    return createList(createSymbol('quasiquote'), quasiquoted);
  }
  
  // Handle unquote (~)
  if (token === "~") {
    // Parse the next expression and wrap it in an unquote
    const unquoted = parseExpression();
    return createList(createSymbol('unquote'), unquoted);
  }
  
  // Handle unquote-splicing (~@)
  if (token === "~@") {
    // Parse the next expression and wrap it in an unquote-splicing
    const unquoteSpliced = parseExpression();
    return createList(createSymbol('unquote-splicing'), unquoteSpliced);
  }

  if (token === ",") {
    // Treat a comma as an alias for unquote.
    const unquoted = parseExpression();
    return createList(createSymbol("unquote"), unquoted);
  }
  
  if (token === '(') {
    return parseList();
  } else if (token === ')') {
    throw new ParseError("Unexpected ')'", position, state.input);
  } else if (token === '[') {
    return parseVector();
  } else if (token === ']') {
    throw new ParseError("Unexpected ']'", position, state.input);
  } else if (token === '{') {
    return parseMap();
  } else if (token === '}') {
    throw new ParseError("Unexpected '}'", position, state.input);
  } else if (token === '#[') {
    return parseSet();
  } else if (token === ':' || token === ',') {
    throw new ParseError(`Unexpected '${token}'`, position, state.input);
  } else if (token.startsWith('"')) {
    const str = token.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    return createLiteral(str);
  } else if (!isNaN(Number(token))) {
    return createLiteral(Number(token));
  } else if (token === "true") {
    return createLiteral(true);
  } else if (token === "false") {
    return createLiteral(false);
  } else if (token === "nil") {
    return createNilLiteral();
  } else if (token === ".") {
    // Handle the property access after a parenthesized expression
    if (state.currentPos < state.tokens.length) {
      const nextToken = state.tokens[state.currentPos++].token;
      return createSymbol("." + nextToken);
    } else {
      throw new ParseError("Expected property name after '.'", position, state.input);
    }
  } else {
    // Handle dot notation with dashed properties
    if (token.includes('.') && !token.startsWith('.') && !token.endsWith('.')) {
      const parts = token.split('.');
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
    
    return createSymbol(token);
  }
}

/**
* Parse a list with proper error handling
*/
function parseList(): SList {
  const listStartPos = state.currentPos > 0 ? state.tokens[state.currentPos - 1].position : { line: 1, column: 1, offset: 0 };
  
  try {
    const elements: SExp[] = [];
    
    // Process the first token to see if it's a dot notation
    if (state.currentPos < state.tokens.length && 
        state.tokens[state.currentPos].token !== ')' &&
        state.tokens[state.currentPos].token.includes('.') &&
        !state.tokens[state.currentPos].token.startsWith('.') &&
        !state.tokens[state.currentPos].token.endsWith('.')) {
      
      // This is a dot notation expression - handle it explicitly
      const dotToken = state.tokens[state.currentPos++].token;
      
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
        if (state.currentPos < state.tokens.length && state.tokens[state.currentPos].token !== ')') {
          const args: SExp[] = [];
          while (state.currentPos < state.tokens.length && state.tokens[state.currentPos].token !== ')') {
            args.push(parseExpression());
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
        if (state.currentPos < state.tokens.length && state.tokens[state.currentPos].token === ')') {
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
          while (state.currentPos < state.tokens.length && state.tokens[state.currentPos].token !== ')') {
            elements.push(parseExpression());
          }
        }
      }
    } else {
      // Standard list parsing
      while (state.currentPos < state.tokens.length && state.tokens[state.currentPos].token !== ')') {
        elements.push(parseExpression());
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
    if (state.currentPos < state.tokens.length && state.tokens[state.currentPos].token === '.') {
      state.currentPos++; // Skip the dot
      
      if (state.currentPos >= state.tokens.length) {
        throw new ParseError(
          "Expected property name after dot",
          state.tokens[state.currentPos - 1].position,
          state.input
        );
      }
      
      // Get the property/method name
      const propName = state.tokens[state.currentPos++].token;
      
      // Create a new list that represents property access on the original list result
      return createList(
        createSymbol("js-get-invoke"),
        createList(...elements), // Original list becomes the object
        createLiteral(propName)
      );
    }
    
    return createList(...elements);
  } catch (error) {
    if (error instanceof ParseError) {
      throw error;
    }
    
    throw new ParseError(
      `Error parsing list: ${error instanceof Error ? error.message : String(error)}`,
      listStartPos,
      state.input
    );
  }
}

function parseImportVector(): SList {
  const startPos = state.currentPos > 0 ? state.tokens[state.currentPos - 1].position : { line: 1, column: 1, offset: 0 };
  
  try {
    const elements: SExp[] = [];
    
    while (state.currentPos < state.tokens.length && state.tokens[state.currentPos].token !== ']') {
      // Parse the symbol (or expression)
      const expr = parseExpression();
      elements.push(expr);
      
      // Handle the 'as' keyword for aliasing
      if (state.currentPos < state.tokens.length && 
          state.tokens[state.currentPos].token === 'as') {
        // Add the 'as' keyword as a symbol
        elements.push(createSymbol('as'));
        state.currentPos++; // Skip 'as'
        
        // Parse the alias
        if (state.currentPos < state.tokens.length && 
            state.tokens[state.currentPos].token !== ',' && 
            state.tokens[state.currentPos].token !== ']') {
          const alias = parseExpression();
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
      if (state.currentPos < state.tokens.length && state.tokens[state.currentPos].token === ',') {
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
    
    return createList(...elements);
  } catch (error) {
    if (error instanceof ParseError) {
      throw error;
    }
    
    throw new ParseError(
      `Error parsing import vector: ${error instanceof Error ? error.message : String(error)}`,
      startPos,
      state.input
    );
  }
}

function parseVector(): SList {
  const startPos = state.currentPos > 0 ? state.tokens[state.currentPos - 1].position : { line: 1, column: 1, offset: 0 };
  
  try {
    const elements: SExp[] = [];
    
    while (state.currentPos < state.tokens.length && state.tokens[state.currentPos].token !== ']') {
      // Parse the current element
      const expr = parseExpression();
      elements.push(expr);
      
      // Check if this might be an 'as' alias construct
      if (isSymbol(expr) && 
          state.currentPos < state.tokens.length && 
          state.tokens[state.currentPos].token === 'as') {
        
        // Add the 'as' symbol
        elements.push(createSymbol('as'));
        state.currentPos++; // Skip the 'as' token
        
        // Parse the alias name
        if (state.currentPos < state.tokens.length && 
            state.tokens[state.currentPos].token !== ',' && 
            state.tokens[state.currentPos].token !== ']') {
          const alias = parseExpression();
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
      if (state.currentPos < state.tokens.length && state.tokens[state.currentPos].token === ',') {
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
  } catch (error) {
    if (error instanceof ParseError) {
      throw error;
    }
    
    throw new ParseError(
      `Error parsing vector: ${error instanceof Error ? error.message : String(error)}`,
      startPos,
      state.input
    );
  }
}

function parseMap(): SList {
  const startPos = state.currentPos > 0 ? state.tokens[state.currentPos - 1].position : { line: 1, column: 1, offset: 0 };
  
  try {
    const entries: SExp[] = [];
    
    while (state.currentPos < state.tokens.length && state.tokens[state.currentPos].token !== '}') {
      // Parse key
      const key = parseExpression();
      
      // Expect colon
      if (state.currentPos >= state.tokens.length || state.tokens[state.currentPos].token !== ':') {
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
      const value = parseExpression();
      
      // Add key-value pair
      entries.push(key);
      entries.push(value);
      
      // Skip comma if present
      if (state.currentPos < state.tokens.length && state.tokens[state.currentPos].token === ',') {
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
  } catch (error) {
    if (error instanceof ParseError) {
      throw error;
    }
    
    throw new ParseError(
      `Error parsing map: ${error instanceof Error ? error.message : String(error)}`,
      startPos,
      state.input
    );
  }
}

function parseSet(): SList {
  const startPos = state.currentPos > 0 ? state.tokens[state.currentPos - 1].position : { line: 1, column: 1, offset: 0 };
  
  try {
    const elements: SExp[] = [];
    
    while (state.currentPos < state.tokens.length && state.tokens[state.currentPos].token !== ']') {
      elements.push(parseExpression());
      
      // Skip comma if present
      if (state.currentPos < state.tokens.length && state.tokens[state.currentPos].token === ',') {
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
  } catch (error) {
    if (error instanceof ParseError) {
      throw error;
    }
    
    throw new ParseError(
      `Error parsing set: ${error instanceof Error ? error.message : String(error)}`,
      startPos,
      state.input
    );
  }
}