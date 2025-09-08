// ts-module.ts - TypeScript module for extreme test

export function tsFunction(x: number): number {
  return x * 10;
}

export const tsConstant = "TypeScript Module";

// Provide a default export to support namespace-style default imports
export default {
  tsFunction,
  multiplyBy: (x: number, y: number): number => x * y,
  tsConstant,
};
