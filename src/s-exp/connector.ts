// src/s-exp/connector.ts - Connects S-expression layer with existing HQL transpiler

import { SExp, SList, SSymbol, SLiteral, 
    isSymbol, isList, isLiteral, isQuote,
    createSymbol, createList, createLiteral, createNilLiteral, sexpToString } from './types';
import { HQLNode, ListNode, SymbolNode, LiteralNode } from '../transpiler/hql_ast';
import { Logger } from '../logger';

/**
* Options for converting S-expressions to HQL AST
*/
export interface ConversionOptions {
verbose?: boolean;
}

/**
* Convert S-expressions to the legacy HQL AST format
* This allows the S-expression frontend to connect with the existing transpiler
*/
export function convertToHqlAst(sexps: SExp[], options: ConversionOptions = {}): HQLNode[] {
const logger = new Logger(options.verbose || false);
logger.debug(`Converting ${sexps.length} S-expressions to HQL AST`);

return sexps.map(sexp => convertExpr(sexp, logger));
}

/**
* Convert a single S-expression to an HQL AST node
*/
function convertExpr(sexp: SExp, logger: Logger): HQLNode {
if (isLiteral(sexp)) {
// Convert literal node
return convertLiteral(sexp as SLiteral, logger);
} else if (isSymbol(sexp)) {
// Convert symbol node
return convertSymbol(sexp as SSymbol, logger);
} else if (isList(sexp)) {
// Convert list node
return convertList(sexp as SList, logger);
} else {
logger.error(`Unknown S-expression type: ${JSON.stringify(sexp)}`);
throw new Error(`Unknown S-expression type: ${JSON.stringify(sexp)}`);
}
}

/**
* Convert an S-expression literal to an HQL AST literal
*/
function convertLiteral(literal: SLiteral, logger: Logger): LiteralNode {
return {
type: 'literal',
value: literal.value
};
}

/**
* Convert an S-expression symbol to an HQL AST symbol
*/
function convertSymbol(symbol: SSymbol, logger: Logger): SymbolNode {
return {
type: 'symbol',
name: symbol.name
};
}

/**
* Convert an S-expression list to an HQL AST list
*/
function convertList(list: SList, logger: Logger): ListNode {
// Handle special cases here
// In the future, this is where we'd handle data structure literals and more

// For now, just convert each element
return {
type: 'list',
elements: list.elements.map(elem => convertExpr(elem, logger))
};
}

/**
* Convert the legacy HQL AST format back to S-expressions
* This is useful for two-way interoperability
*/
export function convertFromHqlAst(nodes: HQLNode[], options: ConversionOptions = {}): SExp[] {
const logger = new Logger(options.verbose || false);
logger.debug(`Converting ${nodes.length} HQL AST nodes to S-expressions`);

return nodes.map(node => convertNode(node, logger));
}

/**
* Convert a single HQL AST node to an S-expression
*/
function convertNode(node: HQLNode, logger: Logger): SExp {
switch (node.type) {
case 'literal':
 return createLiteral((node as LiteralNode).value);
 
case 'symbol':
 return createSymbol((node as SymbolNode).name);
 
case 'list':
 return createList(...(node as ListNode).elements.map(elem => convertNode(elem, logger)));
 
default:
 logger.error(`Unknown HQL AST node type: ${JSON.stringify(node)}`);
 throw new Error(`Unknown HQL AST node type: ${JSON.stringify(node)}`);
}
}