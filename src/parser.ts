// src/parser.ts
import { HQLNode, LiteralNode, SymbolNode, ListNode } from "./ast.ts";

function isWhitespace(ch: string): boolean {
  return /\s/.test(ch);
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inString = false;
  // Remove comment lines (lines starting with ";;")
  const lines = input.split("\n").filter(line => !line.trim().startsWith(";;"));
  for (const line of lines) {
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inString) {
        current += ch;
        if (ch === '"' && line[i - 1] !== "\\") {
          tokens.push(current);
          current = "";
          inString = false;
        }
      } else {
        if (ch === '"') {
          if (current.length > 0) { tokens.push(current); current = ""; }
          current += ch;
          inString = true;
        } else if (ch === "(" || ch === ")") {
          if (current.length > 0) { tokens.push(current); current = ""; }
          tokens.push(ch);
        } else if (isWhitespace(ch)) {
          if (current.length > 0) { tokens.push(current); current = ""; }
        } else {
          current += ch;
        }
      }
    }
    if (current.length > 0) { tokens.push(current); current = ""; }
  }
  return tokens;
}

export function parse(input: string): HQLNode[] {
  const tokens = tokenize(input);
  let pos = 0;
  function parseExpression(): HQLNode {
    if (pos >= tokens.length) throw new Error("Unexpected end of input");
    const token = tokens[pos++];
    if (token === "(") {
      const elements: HQLNode[] = [];
      while (tokens[pos] !== ")") {
        if (pos >= tokens.length) throw new Error("Unclosed parenthesis");
        elements.push(parseExpression());
      }
      pos++; // skip ")"
      return { type: "list", elements } as ListNode;
    } else if (token === ")") {
      throw new Error("Unexpected ')'");
    } else if (token.startsWith('"')) {
      return { type: "literal", value: token.slice(1, token.length - 1) } as LiteralNode;
    } else if (!isNaN(Number(token))) {
      return { type: "literal", value: Number(token) } as LiteralNode;
    } else if (token === "true" || token === "false") {
      return { type: "literal", value: token === "true" } as LiteralNode;
    } else if (token === "nil") {
      return { type: "literal", value: null } as LiteralNode;
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
