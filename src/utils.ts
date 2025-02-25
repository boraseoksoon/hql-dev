// src/utils.ts
export function isLocalPath(path: string): boolean {
  return path.startsWith("./") || path.startsWith("../");
}

  