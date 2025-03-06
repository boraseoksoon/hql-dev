// lib/loader.ts - Updated to properly load macros from HQL
import { resolve } from "https://deno.land/std@0.170.0/path/mod.ts";
import { parse } from "../src/transpiler/parser.ts";
import { expandMacros } from "../src/macro.ts";

export async function loadFile(filePath: string): Promise<string> {
  try {
    return await Deno.readTextFile(resolve(filePath));
  } catch (error) {
    console.error(`Error loading file ${filePath}: ${error.message}`);
    throw error;
  }
}

/**
 * Load and parse macros from the macros.hql file
 * This pre-registers all the macros defined in the HQL file
 */
export async function loadAndInitializeMacros(): Promise<void> {
  try {
    const macroSource = await loadFile("./lib/macros.hql");
    const macroAst = parse(macroSource);
    
    // Expand and process each macro definition
    // This will register the macros with the macro system
    for (const node of macroAst) {
      expandMacros(node);
    }
    
    console.log("Macros loaded and initialized successfully");
  } catch (error) {
    console.error(`Failed to load macros: ${error.message}`);
    throw error;
  }
}

export async function loadStandardLibrary(): Promise<string> {
  const [helpers, stdlib, stdio] = await Promise.all([
    loadFile("./lib/helpers.hql"),
    loadFile("./lib/stdlib.hql"),
    loadFile("./lib/stdio.hql")
  ]);
  return `${helpers}\n${stdlib}\n${stdio}\n`;
}

