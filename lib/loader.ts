// lib/loader.ts
import { resolve } from "https://deno.land/std@0.170.0/path/mod.ts";

export async function loadFile(filePath: string): Promise<string> {
  return await Deno.readTextFile(resolve(filePath));
}

export async function loadStandardLibrary(): Promise<string> {
  const helpers = await loadFile("./lib/helpers.hql");
  const macros = await loadFile("./lib/macros.hql");
  const stdlib = await loadFile("./lib/stdlib.hql");
  const stdio  = await loadFile("./lib/stdio.hql");
  return `${helpers}\n${macros}\n${stdlib}\n${stdio}\n`;
}