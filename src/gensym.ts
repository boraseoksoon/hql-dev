// src/gensym.ts
export let gensymCounter = 0;
export function gensym(prefix: string = "g"): string {
  return `${prefix}_${gensymCounter++}`;
}
