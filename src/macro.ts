// src/macro.ts - Updated to match the new signature

import { HQLNode } from "./transpiler/hql_ast.ts";
import { expandMacros as internalExpandMacros } from "./macro-expander.ts";
import { Env } from "./environment.ts";

export async function expandMacros(
  node: HQLNode | HQLNode[], 
  env?: Env,
  baseDir: string = Deno.cwd(),
  options: any = {}
): Promise<HQLNode | HQLNode[]> {
  if (Array.isArray(node)) {
    return await internalExpandMacros(node, env, baseDir, options);
  }
  
  const expanded = await internalExpandMacros([node], env, baseDir, options);
  return expanded[0];
}