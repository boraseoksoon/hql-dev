// src/s-exp/parser.ts - Parser for S-expressions

import { SExp, SSymbol, SList, SLiteral, 
    createSymbol, createList, createLiteral, createNilLiteral } from './types';

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

/**
* Parse tokens into S-expressions
*/
function parseTokens(tokens: string[]): SExp[] {
let pos = 0;

// Helper function to parse a single expression
function parseExpression(): SExp {
if (pos >= tokens.length) {
 throw new Error('Unexpected end of input');
}

const token = tokens[pos++];

// Quote shorthand
if (token === '\'') {
 return createList(createSymbol('quote'), parseExpression());
}

// Quasiquote shorthand
if (token === '`') {
 return createList(createSymbol('quasiquote'), parseExpression());
}

// Unquote shorthand
if (token === '~') {
 return createList(createSymbol('unquote'), parseExpression());
}

// Unquote-splicing shorthand
if (token === '~@') {
 return createList(createSymbol('unquote-splicing'), parseExpression());
}

// List
if (token === '(') {
 return parseList();
}

// Vector
if (token === '[') {
 return parseVector();
}

// Map
if (token === '{') {
 return parseMap();
}

// Set
if (token === '#[') {
 return parseSet();
}

// Handle closing delimiters
if (token === ')' || token === ']' || token === '}') {
 throw new Error(`Unexpected closing delimiter: ${token}`);
}

// String literal
if (token.startsWith('"') && token.endsWith('"')) {
 return createLiteral(token.slice(1, -1));
}

// Numeric literal
if (!isNaN(Number(token))) {
 return createLiteral(Number(token));
}

// Boolean literals
if (token === 'true') {
 return createLiteral(true);
}

if (token === 'false') {
 return createLiteral(false);
}

// Nil literal
if (token === 'nil') {
 return createNilLiteral();
}

// Symbol (including those with dots for JavaScript interop)
return createSymbol(token);
}

// Parse a list
function parseList(): SList {
const elements: SExp[] = [];

// Check for dot notation in first position
if (pos < tokens.length && 
   tokens[pos].includes('.') && 
   !tokens[pos].startsWith('.') && 
   !tokens[pos].endsWith('.')) {
 // Handle module.method notation
 const dotToken = tokens[pos++];
 const [moduleName, methodName] = dotToken.split('.');
 
 // Handle multi-part property access (e.g., obj.prop1.prop2)
 if (dotToken.split('.').length > 2) {
   // Create a nested chain for multi-part property access
   let result = createSymbol(moduleName);
   
   for (const part of dotToken.split('.').slice(1)) {
     result = createList(
       createSymbol('js-get'),
       result,
       createLiteral(part)
     );
   }
   
   // If there are arguments, convert to a call
   if (pos < tokens.length && tokens[pos] !== ')') {
     const args: SExp[] = [];
     
     while (pos < tokens.length && tokens[pos] !== ')') {
       args.push(parseExpression());
     }
     
     elements.push(createSymbol('js-call'));
     elements.push(result);
     elements.push(...args);
   } else {
     elements.push(result);
   }
 } else {
   // Simple module.method form
   if (pos < tokens.length && tokens[pos] !== ')') {
     // Method call with arguments
     elements.push(createSymbol('js-call'));
     elements.push(createSymbol(moduleName));
     elements.push(createLiteral(methodName));
     
     while (pos < tokens.length && tokens[pos] !== ')') {
       elements.push(parseExpression());
     }
   } else {
     // Property access
     elements.push(createSymbol('js-get'));
     elements.push(createSymbol(moduleName));
     elements.push(createLiteral(methodName));
   }
 }
} else {
 // Standard list processing
 while (pos < tokens.length && tokens[pos] !== ')') {
   elements.push(parseExpression());
 }
}

if (pos >= tokens.length) {
 throw new Error('Unclosed list');
}

// Skip the closing parenthesis
pos++;

return createList(...elements);
}

// Parse a vector literal
function parseVector(): SList {
const elements: SExp[] = [];

while (pos < tokens.length && tokens[pos] !== ']') {
 elements.push(parseExpression());
 
 // Skip commas
 if (pos < tokens.length && tokens[pos] === ',') {
   pos++;
 }
}

if (pos >= tokens.length) {
 throw new Error('Unclosed vector');
}

// Skip the closing bracket
pos++;

// Empty vector
if (elements.length === 0) {
 return createList(createSymbol('empty-array'));
}

// Non-empty vector
return createList(createSymbol('vector'), ...elements);
}

// Parse a map literal
function parseMap(): SList {
const elements: SExp[] = [];

while (pos < tokens.length && tokens[pos] !== '}') {
 // Parse key
 const key = parseExpression();
 
 // Check for colon
 if (pos >= tokens.length || tokens[pos] !== ':') {
   throw new Error('Expected : in map literal');
 }
 
 // Skip colon
 pos++;
 
 // Parse value
 const value = parseExpression();
 
 // Add key-value pair
 elements.push(key);
 elements.push(value);
 
 // Skip commas
 if (pos < tokens.length && tokens[pos] === ',') {
   pos++;
 }
}

if (pos >= tokens.length) {
 throw new Error('Unclosed map');
}

// Skip the closing brace
pos++;

// Empty map
if (elements.length === 0) {
 return createList(createSymbol('empty-map'));
}

// Non-empty map
return createList(createSymbol('hash-map'), ...elements);
}

// Parse a set literal
function parseSet(): SList {
const elements: SExp[] = [];

while (pos < tokens.length && tokens[pos] !== ']') {
 elements.push(parseExpression());
 
 // Skip commas
 if (pos < tokens.length && tokens[pos] === ',') {
   pos++;
 }
}

if (pos >= tokens.length) {
 throw new Error('Unclosed set');
}

// Skip the closing bracket
pos++;

// Empty set
if (elements.length === 0) {
 return createList(createSymbol('empty-set'));
}

// Non-empty set
return createList(createSymbol('hash-set'), ...elements);
}

// Parse all expressions in the token stream
const expressions: SExp[] = [];

while (pos < tokens.length) {
expressions.push(parseExpression());
}

return expressions;
}