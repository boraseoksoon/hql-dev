// src/utils/colors.ts - Terminal color utility

/**
 * ANSI color and style constants for terminal output
 */
export const reset = "\x1b[0m";
export const bright = "\x1b[1m";
export const dim = "\x1b[2m";
export const underscore = "\x1b[4m";
export const blink = "\x1b[5m";
export const reverse = "\x1b[7m";
export const hidden = "\x1b[8m";

/**
 * Foreground colors
 */
export const fg = {
  black: "\x1b[30m",
  red: "\x1b[31m",
  sicpRed: "\x1b[38;2;220;50;47m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  crimson: "\x1b[38m",
  sicpPurple: "\x1b[38;2;128;0;128m",
  lightBlue: "\x1b[94m",
  lightGreen: "\x1b[92m",
  lightYellow: "\x1b[93m",
  lightPurple: "\x1b[95m",
  lightCyan: "\x1b[96m",
  gray: "\x1b[90m", // Added gray that was missing
  sicpGreen: "\x1b[38;2;50;205;50m", // Added sicpGreen
  sicpBlue: "\x1b[38;2;30;144;255m", // Added sicpBlue
};

/**
 * Background colors
 */
export const bg = {
  black: "\x1b[40m",
  red: "\x1b[41m",
  green: "\x1b[42m",
  yellow: "\x1b[43m",
  blue: "\x1b[44m",
  magenta: "\x1b[45m",
  cyan: "\x1b[46m",
  white: "\x1b[47m",
  crimson: "\x1b[48m",
  sicpRed: "\x1b[48;2;220;50;47m",
  sicpPurple: "\x1b[48;2;128;0;128m",
};

/**
 * Apply color to a string and reset afterward
 */
export function colorize(text: string, color: string): string {
  return `${color}${text}${reset}`;
}