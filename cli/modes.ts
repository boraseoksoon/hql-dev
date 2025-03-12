// src/modes.ts
import { OptimizationOptions } from "../src/bundler.ts";

export const MODES: Record<string, OptimizationOptions> = {
  development: {
    minify: false,
    sourcemap: true,
    keepNames: true,
  },
  production: {
    minify: true,
    drop: ["console", "debugger"],
    legalComments: "none",
    treeShaking: true,
  },
  performance: {
    minify: true,
    target: "es2020",
    drop: ["console", "debugger"], // Drops all console and debugger statements
    legalComments: "none",
    treeShaking: true,
    charset: "ascii",
  },
};
