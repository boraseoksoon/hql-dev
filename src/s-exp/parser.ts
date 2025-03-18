// src/s-exp/parser.ts - Parser for S-expressions

import { SExp, SSymbol, SList, SLiteral, createSymbol, createList, createLiteral, createNilLiteral } from './types.ts';

/**
* Parse HQL source into S-expressions
*/
export function parse(input: string): SExp[] {
  const tokens = tokenize(input);
  return parseTokens(tokens);
}

/**
* Tokenize HQL source code into tokens
*/
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inString = false;
  let inComment = false;
  let inMultilineComment = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    // Handle comments
    if (inComment) {
      if (char === '\n') {
        inComment = false;
      }
      continue;
    }

    if (inMultilineComment) {
      if (char === '*' && i + 1 < input.length && input[i + 1] === '/') {
        inMultilineComment = false;
        i++; // Skip the closing '/'
      }
      continue;
    }

    if (!inString && char === ';') {
      if (current !== '') {
        tokens.push(current);
        current = '';
      }
      inComment = true;
      continue;
    }

    if (!inString && char === '/' && i + 1 < input.length) {
      if (input[i + 1] === '/') {
        if (current !== '') {
          tokens.push(current);
          current = '';
        }
        inComment = true;
        i++; // Skip the second '/'
        continue;
      } else if (input[i + 1] === '*') {
        if (current !== '') {
          tokens.push(current);
          current = '';
        }
        inMultilineComment = true;
        i++; // Skip the '*'
        continue;
      }
    }

    // Handle strings
    if (inString) {
      current += char;
      if (char === '"' && input[i - 1] !== '\\') {
        inString = false;
        tokens.push(current);
        current = '';
      }
      continue;
    }

    if (char === '"') {
      if (current !== '') {
        tokens.push(current);
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
        tokens.push(current);
        current = '';
      }
      tokens.push(char);
      continue;
    }

    // Handle whitespace
    if (/\s/.test(char)) {
      if (current !== '') {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    // Handle special characters
    if (char === ':') {
      if (current !== '') {
        tokens.push(current);
        current = '';
      }
      tokens.push(':');
      continue;
    }

    if (char === ',') {
      if (current !== '') {
        tokens.push(current);
        current = '';
      }
      tokens.push(',');
      continue;
    }

    // Handle quote, backtick, and unquote shortcuts
    if (char === '\'' || char === '`') {
      if (current !== '') {
        tokens.push(current);
        current = '';
      }
      tokens.push(char);
      continue;
    }

    if (char === '~') {
      if (current !== '') {
        tokens.push(current);
        current = '';
      }
      
      // Handle unquote-splicing (~@)
      if (i + 1 < input.length && input[i + 1] === '@') {
        tokens.push('~@');
        i++; // Skip the '@'
      } else {
        tokens.push('~');
      }
      continue;
    }

    // Handle hash set (#[)
    if (char === '#' && i + 1 < input.length && input[i + 1] === '[') {
      if (current !== '') {
        tokens.push(current);
        current = '';
      }
      tokens.push('#[');
      i++; // Skip the '['
      continue;
    }

    // Accumulate characters
    current += char;
  }

  if (current !== '') {
    tokens.push(current);
  }

  return tokens;
}

let currentTokens: string[] = [];
let currentPos = 0;

/**
* Parse tokens into S-expressions
*/
function parseTokens(tokens: string[]): SExp[] {
  currentTokens = tokens;
  currentPos = 0;
  
  const nodes: SExp[] = [];
  while (currentPos < currentTokens.length) {
    nodes.push(parseExpression());
  }
  return nodes;
}

/**
* Parse a single expression
*/
function parseExpression(): SExp {
  if (currentPos >= currentTokens.length) {
    throw new Error('Unexpected end of input');
  }
  
  const token = currentTokens[currentPos++];
  
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
    throw new Error("Unexpected ')'");
  } else if (token === '[') {
    return parseVector();
  } else if (token === ']') {
    throw new Error("Unexpected ']'");
  } else if (token === '{') {
    return parseMap();
  } else if (token === '}') {
    throw new Error("Unexpected '}'");
  } else if (token === '#[') {
    return parseSet();
  } else if (token === ':' || token === ',') {
    throw new Error(`Unexpected '${token}'`);
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
    if (currentPos < currentTokens.length) {
      const nextToken = currentTokens[currentPos++];
      return createSymbol("." + nextToken);
    } else {
      throw new Error("Expected property name after '.'");
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
* Parse a list
*/
function parseList(): SList {
  const elements: SExp[] = [];
  
  // Process the first token to see if it's a dot notation
  if (currentPos < currentTokens.length && 
      currentTokens[currentPos] !== ')' &&
      currentTokens[currentPos].includes('.') &&
      !currentTokens[currentPos].startsWith('.') &&
      !currentTokens[currentPos].endsWith('.')) {
    
    // This is a dot notation expression - handle it explicitly
    const dotToken = currentTokens[currentPos++];
    
    // Split by dots to handle multi-part property paths
    const parts = dotToken.split('.');
    
    if (parts.length > 2) {
      // Multi-part property path like "obj.prop1.prop2"
      const objectName = parts[0];
      const propPath = parts.slice(1);
      
      // Create a nested chain of js-get-invoke expressions
      let currentExpr: ListNode = {
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
      if (currentPos < currentTokens.length && currentTokens[currentPos] !== ')') {
        const args: SExp[] = [];
        while (currentPos < currentTokens.length && currentTokens[currentPos] !== ')') {
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
      if (currentPos < currentTokens.length && currentTokens[currentPos] === ')') {
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
        while (currentPos < currentTokens.length && currentTokens[currentPos] !== ')') {
          elements.push(parseExpression());
        }
      }
    }
  } else {
    // Standard list parsing
    while (currentPos < currentTokens.length && currentTokens[currentPos] !== ')') {
      elements.push(parseExpression());
    }
  }
  
  if (currentPos >= currentTokens.length) {
    throw new Error("Unclosed list");
  }
  
  currentPos++; // Skip the closing parenthesis
  
  // Check if there's a dot after the list
  if (currentPos < currentTokens.length && currentTokens[currentPos] === '.') {
    currentPos++; // Skip the dot
    
    if (currentPos >= currentTokens.length) {
      throw new Error("Expected property name after dot");
    }
    
    // Get the property/method name
    const propName = currentTokens[currentPos++];
    
    // Create a new list that represents property access on the original list result
    return createList(
      createSymbol("js-get-invoke"),
      createList(...elements), // Original list becomes the object
      createLiteral(propName)
    );
  }
  
  return createList(...elements);
}

// Vector, Map, and Set parsing functions
function parseVector(): SList {
  const elements: SExp[] = [];
  
  while (currentPos < currentTokens.length && currentTokens[currentPos] !== ']') {
    elements.push(parseExpression());
    
    // Skip comma if present
    if (currentPos < currentTokens.length && currentTokens[currentPos] === ',') {
      currentPos++;
    }
  }
  
  if (currentPos >= currentTokens.length) {
    throw new Error("Unclosed vector");
  }
  
  currentPos++; // Skip the closing bracket
  
  // For empty vector, return a special empty array literal
  if (elements.length === 0) {
    return createList(createSymbol("empty-array"));
  }
  
  // For non-empty vector, proceed with vector function
  return createList(createSymbol("vector"), ...elements);
}

function parseMap(): SList {
  const entries: SExp[] = [];
  
  while (currentPos < currentTokens.length && currentTokens[currentPos] !== '}') {
    // Parse key
    const key = parseExpression();
    
    // Expect colon
    if (currentPos >= currentTokens.length || currentTokens[currentPos] !== ':') {
      throw new Error("Expected ':' in map literal");
    }
    currentPos++; // Skip colon
    
    // Parse value
    const value = parseExpression();
    
    // Add key-value pair
    entries.push(key);
    entries.push(value);
    
    // Skip comma if present
    if (currentPos < currentTokens.length && currentTokens[currentPos] === ',') {
      currentPos++;
    }
  }
  
  if (currentPos >= currentTokens.length) {
    throw new Error("Unclosed map");
  }
  
  currentPos++; // Skip the closing brace
  
  // For empty map, return a special empty map literal
  if (entries.length === 0) {
    return createList(createSymbol("empty-map"));
  }
  
  // For non-empty map, proceed with hash-map function
  return createList(createSymbol("hash-map"), ...entries);
}

function parseSet(): SList {
  const elements: SExp[] = [];
  
  while (currentPos < currentTokens.length && currentTokens[currentPos] !== ']') {
    elements.push(parseExpression());
    
    // Skip comma if present
    if (currentPos < currentTokens.length && currentTokens[currentPos] === ',') {
      currentPos++;
    }
  }
  
  if (currentPos >= currentTokens.length) {
    throw new Error("Unclosed set");
  }
  
  currentPos++; // Skip the closing bracket
  
  // For empty set, return a special empty set literal
  if (elements.length === 0) {
    return createList(createSymbol("empty-set"));
  }
  
  // For non-empty set, proceed with hash-set function
  return createList(createSymbol("hash-set"), ...elements);
}