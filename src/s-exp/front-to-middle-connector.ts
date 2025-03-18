// src/s-exp/connector.ts - Connects S-expression layer with existing HQL transpiler

import { SExp, SList, SSymbol, SLiteral, isSymbol, isList, isLiteral } from './types.ts';
import { HQLNode, ListNode, SymbolNode, LiteralNode } from '../transpiler/hql_ast.ts';
import { Logger } from '../logger.ts';

/**
* Options for converting S-expressions to HQL AST
*/
interface ConversionOptions {
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
    // Special case: Handle nested property access - ((list-expr) .property)
    // Example: ((vector 1 2 3 4 5) .length)
    if (list.elements.length === 2 && 
        list.elements[0].type === "list" &&
        list.elements[1].type === "symbol" && 
        (list.elements[1] as SSymbol).name.startsWith(".")) {
            // Get the object expression and property name
            const object = convertExpr(list.elements[0], logger);
            const propertyName = (list.elements[1] as SSymbol).name.substring(1); // Remove the dot
            
            // Create a property access pattern using js-get
            return {
                type: "list",
                elements: [
                    { type: "symbol", name: "js-get" },
                    object,
                    { type: "literal", value: propertyName }
                ]
            };
        }
        
        // Default case: convert each element and return a list
        return {
            type: 'list',
            elements: list.elements.map(elem => convertExpr(elem, logger))
        };
    }