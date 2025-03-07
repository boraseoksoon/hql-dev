// src/transpiler/parser.ts

import { HQLNode, LiteralNode, SymbolNode, ListNode } from "./hql_ast.ts";
import { ParseError } from "./errors.ts";

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let token = "";
  let inString = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inString) {
      token += ch;
      if (ch === '"' && input[i - 1] !== '\\') {
        tokens.push(token);
        token = "";
        inString = false;
      }
    } else {
      if (ch === '"') {
        if (token !== "") { tokens.push(token); token = ""; }
        token += ch;
        inString = true;
      } else if (ch === '(' || ch === ')') {
        if (token !== "") { tokens.push(token); token = ""; }
        tokens.push(ch);
      } else if (/\s/.test(ch)) {
        if (token !== "") { tokens.push(token); token = ""; }
      } else if (ch === ';') {
        while (i < input.length && input[i] !== '\n') i++;
      } else {
        token += ch;
      }
    }
  }
  if (token !== "") tokens.push(token);
  return tokens;
}

let currentTokens: string[] = [];
let currentPos = 0;

function parseTokens(tokens: string[]): HQLNode[] {
  currentTokens = tokens;
  currentPos = 0;
  const nodes: HQLNode[] = [];
  while (currentPos < currentTokens.length) {
    nodes.push(parseExpression());
  }
  return nodes;
}

function parseExpression(): HQLNode {
  if (currentPos >= currentTokens.length) {
    throw new ParseError("Unexpected end of input", { line: 0, column: 0, offset: 0 });
  }
  const token = currentTokens[currentPos++];
  if (token === '(') {
    return parseList();
  } else if (token === ')') {
    throw new ParseError("Unexpected ')'", { line: 0, column: 0, offset: 0 });
  } else if (token.startsWith('"')) {
    const str = processStringLiteral(token);
    return { type: "literal", value: str } as LiteralNode;
  } else if (!isNaN(Number(token))) {
    return { type: "literal", value: Number(token) } as LiteralNode;
  } else {
    return { type: "symbol", name: token } as SymbolNode;
  }
}

function parseList(): ListNode {
  const elements: HQLNode[] = [];
  while (currentPos < currentTokens.length && currentTokens[currentPos] !== ')') {
    elements.push(parseExpression());
  }
  if (currentPos >= currentTokens.length) {
    throw new ParseError("Unclosed list", { line: 0, column: 0, offset: 0 });
  }
  currentPos++; // skip ')'
  return { type: "list", elements } as ListNode;
}

function processStringLiteral(token: string): string {
  if (token[0] !== '"' || token[token.length - 1] !== '"') {
    throw new ParseError("Malformed string literal", { line: 0, column: 0, offset: 0 });
  }
  let content = token.slice(1, -1);
  content = content.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  return content;
}

export function parse(input: string): HQLNode[] {
  const tokens = tokenize(input);
  return parseTokens(tokens);
}
