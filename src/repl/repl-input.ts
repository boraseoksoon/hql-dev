// src/repl/repl-input.ts
// REPL input handling and line editing

import { TabCompletion } from "./repl-completion.ts";

/**
 * Result of reading a line of input
 */
export interface ReadLineResult {
  text: string;
  fromHistory: boolean;
  controlD: boolean;
  indent?: string;
}

// -----------------
// Constants
// -----------------
const CTRL_A = 1;
const CTRL_E = 5;
const CTRL_K = 11;
const CTRL_U = 21;
const CTRL_W = 23;
const CTRL_C = 3;
const CTRL_D = 4;
const TAB = 9;
const ENTER = 13;
const BACKSPACE = 127; // Also covers Ctrl+H (8)
const BACKSPACE_ALT = 8;

const ESC = 27;
const CSI = 91; // Control Sequence Introducer for arrow keys etc.

// Arrow key sequences
const ARROW_UP = 65;
const ARROW_DOWN = 66;
const ARROW_RIGHT = 67;
const ARROW_LEFT = 68;
const DELETE_SEQ = 51; // Delete key sequence part

// Special keys for Home/End (some terminals send different sequences)
const HOME_ALT = 49; // when followed by 126, indicates Home
const END_ALT = 52;  // when followed by 126, indicates End

// -----------------
// Utility Functions
// -----------------
const encoder = new TextEncoder();

/** Writes the given string to stdout. */
function write(s: string): void {
  Deno.stdout.writeSync(encoder.encode(s));
}

/** Clears the current line and writes the prompt plus current input. Then positions the cursor. */
function redrawLine(prompt: string, input: string, cursorPos: number): void {
  write("\r");            // Return to line start
  write("\x1b[K");        // Clear line from cursor onward
  write(prompt + input);  // Write prompt and current input
  // Position the cursor if not at the end.
  if (cursorPos < input.length) {
    write(`\x1b[${prompt.length + cursorPos}G`);
  }
}

/** Extract the current word at the cursor position in the input string. */
function getCurrentWordAtCursor(input: string, cursorPos: number): string {
  const beforeCursor = input.substring(0, cursorPos);
  const afterCursor = input.substring(cursorPos);
  const beforeMatch = beforeCursor.match(/[a-zA-Z0-9_$-]*$/);
  const afterMatch = afterCursor.match(/^[a-zA-Z0-9_$-]*/);
  return (beforeMatch ? beforeMatch[0] : "") + (afterMatch ? afterMatch[0] : "");
}

/**
 * Process pasted content by sanitizing it, handling newlines,
 * and updating the input and cursor position accordingly.
 */
function processPastedContent(
  content: string,
  input: string,
  cursorPos: number,
  pastedLines: string[]
): { input: string; cursorPos: number; pastedLines: string[]; justPasted: boolean } {
  let justPasted = true;
  // Split into lines based on newline characters.
  const lines = content.split(/\r?\n/);
  if (lines.length > 1) {
    // For multiline paste, insert the first line and store remaining non-empty lines.
    const firstLine = lines[0].replace(/[\x00-\x1F\x7F]/g, "");
    input = input.substring(0, cursorPos) + firstLine + input.substring(cursorPos);
    cursorPos += firstLine.length;
    pastedLines = lines.slice(1).filter(line => line.trim() !== "");
  } else {
    // Single line paste.
    const cleanContent = content.replace(/[\x00-\x1F\x7F]/g, "");
    input = input.substring(0, cursorPos) + cleanContent + input.substring(cursorPos);
    cursorPos += cleanContent.length;
  }
  return { input, cursorPos, pastedLines, justPasted };
}

/**
 * Read a line with support for arrow key navigation, history, and basic editing.
 */
export async function readLineWithArrowKeys(
  prompt: string,
  history: string[],
  historyIndex: number,
  tabCompletion?: TabCompletion
): Promise<string> {
  let input = "";
  let cursorPos = 0;
  let localHistoryIndex = historyIndex;
  let originalInput = input;
  let completions: string[] = [];
  let completionIndex = -1;
  let pastedLines: string[] = [];
  let justPasted = false;

  while (true) {
    // Use a larger buffer size to accommodate paste operations.
    const buf = new Uint8Array(1024);
    const n = await Deno.stdin.read(buf);
    if (n === null) {
      // End-of-file detected.
      return "\x04"; // Ctrl+D
    }

    // If a small input (usually 1-3 bytes) comes after a paste, reset the paste state.
    if (n <= 3 && justPasted) {
      justPasted = false;
    }

    // Check if it is a paste operation (more than 3 bytes read).
    if (n > 3) {
      const pastedContent = new TextDecoder().decode(buf.subarray(0, n)).trim();
      // Save current state in case we need to use it later
      const prevInput = input;
      const prevCursorPos = cursorPos;
      
      // Process the pasted content.
      const result = processPastedContent(pastedContent, input, cursorPos, pastedLines);
      input = result.input;
      cursorPos = result.cursorPos;
      pastedLines = result.pastedLines;
      justPasted = result.justPasted;
      
      // Redraw the line with updated input.
      redrawLine(prompt, input, cursorPos);
      continue;
    }

    // Process small input (1-3 bytes) from regular keypresses.
    const key = buf[0];

    // ----------------------
    // Control Sequences
    // ----------------------
    if (key === CTRL_A) { // Move to beginning of line
      cursorPos = 0;
      redrawLine(prompt, input, cursorPos);
      justPasted = false;
      continue;
    }
    if (key === CTRL_E) { // Move to end of line
      cursorPos = input.length;
      redrawLine(prompt, input, cursorPos);
      justPasted = false;
      continue;
    }
    if (key === CTRL_K) { // Delete from cursor to end of line
      input = input.substring(0, cursorPos);
      redrawLine(prompt, input, cursorPos);
      justPasted = false;
      continue;
    }
    if (key === CTRL_U) { // Delete from beginning to cursor
      input = input.substring(cursorPos);
      cursorPos = 0;
      redrawLine(prompt, input, cursorPos);
      justPasted = false;
      continue;
    }
    if (key === CTRL_W) { // Delete word backwards
      justPasted = false;
      // Skip whitespace immediately before cursor.
      let skipPos = cursorPos;
      while (skipPos > 0 && /\s/.test(input.charAt(skipPos - 1))) {
        skipPos--;
      }
      // Then delete until a whitespace boundary.
      let wordStart = skipPos;
      while (wordStart > 0 && !/\s/.test(input.charAt(wordStart - 1))) {
        wordStart--;
      }
      if (wordStart < cursorPos) {
        input = input.substring(0, wordStart) + input.substring(cursorPos);
        cursorPos = wordStart;
        redrawLine(prompt, input, cursorPos);
      }
      continue;
    }

    // ----------------------
    // Tab Completion
    // ----------------------
    if (key === TAB && tabCompletion) {
      justPasted = false;
      try {
        if (completions.length === 0) {
          completions = await tabCompletion.getCompletions(input, cursorPos);
          completionIndex = 0;
        } else {
          completionIndex = (completionIndex + 1) % completions.length;
        }

        if (completions.length > 0) {
          const completion = completions[completionIndex];
          // For certain commands, preserve the command part
          if (input.trim().startsWith(':') ||
              input.trim().startsWith('cd ') ||
              input.trim().startsWith('ls ') ||
              input.trim().startsWith('mkdir ')) {
            const cmdMatch = input.match(/^(\S+\s+)/);
            if (cmdMatch) {
              input = cmdMatch[1] + completion;
            } else {
              input = completion;
            }
            cursorPos = input.length;
          } else if (input.includes(':') && completion.includes(':')) {
            // Special case for module:symbol syntax.
            input = completion;
            cursorPos = input.length;
          } else {
            // Symbol completion: replace the current word.
            const currentWord = getCurrentWordAtCursor(input, cursorPos);
            const beforeWord = input.substring(0, cursorPos - currentWord.length);
            const afterWord = input.substring(cursorPos);
            input = beforeWord + completion + afterWord;
            cursorPos = beforeWord.length + completion.length;
          }
          redrawLine(prompt, input, cursorPos);
        }
      } catch (error) {
        // Suppress any errors silently for completion.
      }
      continue;
    } else {
      // Reset completions if any other key is pressed.
      completions = [];
      completionIndex = -1;
    }

    // ----------------------
    // Arrow Keys & Special Sequences
    // ----------------------
    if (key === ESC) {
      justPasted = false;
      // Ensure there are enough bytes for the escape sequence.
      if (buf[1] === CSI) {
        const seq = buf[2];
        switch (seq) {
          case ARROW_UP:
            if (history.length > 0) {
              // Save original input on first history navigation.
              if (localHistoryIndex === -1) {
                originalInput = input;
              }
              localHistoryIndex = Math.min(localHistoryIndex + 1, history.length - 1);
              input = history[history.length - 1 - localHistoryIndex];
              cursorPos = input.length;
              redrawLine(prompt, input, cursorPos);
            }
            break;
          case ARROW_DOWN:
            // Navigate down in history.
            if (localHistoryIndex > 0) {
              localHistoryIndex--;
              input = history[history.length - 1 - localHistoryIndex];
            } else if (localHistoryIndex === 0) {
              localHistoryIndex = -1;
              input = originalInput;
            }
            cursorPos = input.length;
            redrawLine(prompt, input, cursorPos);
            break;
          case ARROW_RIGHT:
            if (cursorPos < input.length) {
              cursorPos++;
              write("\x1b[C"); // Move cursor right.
            }
            break;
          case ARROW_LEFT:
            if (cursorPos > 0) {
              cursorPos--;
              write("\x1b[D"); // Move cursor left.
            }
            break;
          default:
            // Handle Home/End and Delete keys
            if (seq === HOME_ALT && buf[3] === 126) { // Home key
              cursorPos = 0;
              redrawLine(prompt, input, cursorPos);
            } else if (seq === END_ALT && buf[3] === 126) { // End key
              cursorPos = input.length;
              redrawLine(prompt, input, cursorPos);
            } else if (seq === DELETE_SEQ && buf[3] === 126) { // Delete key
              if (cursorPos < input.length) {
                input = input.substring(0, cursorPos) + input.substring(cursorPos + 1);
                redrawLine(prompt, input, cursorPos);
              }
            }
            break;
        }
      }
      // Handle Alt-key combinations (ESC followed by a printable character).
      else if (buf[1] >= 32 && buf[1] <= 126) {
        const altChar = buf[1];
        if (altChar === 98 || altChar === 66) { // Alt+B: move back one word.
          const beforeCursor = input.substring(0, cursorPos);
          const wordMatch = beforeCursor.match(/.*\b(\w+)\s*$/);
          if (wordMatch) {
            const wordStart = beforeCursor.lastIndexOf(wordMatch[1]);
            cursorPos = wordStart;
            redrawLine(prompt, input, cursorPos);
          }
          continue;
        } else if (altChar === 102 || altChar === 70) { // Alt+F: move forward one word.
          const afterCursor = input.substring(cursorPos);
          const wordMatch = afterCursor.match(/^\s*(\w+)/);
          if (wordMatch && wordMatch[1]) {
            cursorPos = cursorPos + wordMatch[0].length;
          } else {
            cursorPos = input.length;
          }
          redrawLine(prompt, input, cursorPos);
          continue;
        } else if (altChar === 100 || altChar === 68) { // Alt+D: delete word forward.
          const afterCursor = input.substring(cursorPos);
          const wordMatch = afterCursor.match(/^\s*(\w+)/);
          if (wordMatch) {
            const wordEnd = cursorPos + wordMatch[0].length;
            input = input.substring(0, cursorPos) + input.substring(wordEnd);
            redrawLine(prompt, input, cursorPos);
          }
          continue;
        }
      }
      continue;
    }

    // ----------------------
    // Handle Enter (Return)
    // ----------------------
    if (key === ENTER) {
      // Process any pending pasted lines if needed (currently, we return the current input).
      justPasted = false;
      return input;
    }

    // ----------------------
    // Handle Ctrl+C (Interrupt)
    // ----------------------
    if (key === CTRL_C) {
      write("^C\n");
      pastedLines = [];
      justPasted = false;
      return "\x03"; // ETX (End of Text) character for Ctrl+C.
    }

    // ----------------------
    // Handle Ctrl+D (EOF)
    // ----------------------
    if (key === CTRL_D) {
      if (input.length === 0) {
        return "\x04"; // EOF only if input is empty.
      }
      continue;
    }

    // ----------------------
    // Handle Backspace
    // ----------------------
    if (key === BACKSPACE || key === BACKSPACE_ALT) {
      if (cursorPos > 0) {
        input = input.substring(0, cursorPos - 1) + input.substring(cursorPos);
        cursorPos--;
        redrawLine(prompt, input, cursorPos);
      }
      continue;
    }

    // ----------------------
    // Handle Regular Character Input
    // ----------------------
    if (key >= 32 && key <= 126) {
      const char = String.fromCharCode(key);
      input = input.substring(0, cursorPos) + char + input.substring(cursorPos);
      cursorPos++;
      redrawLine(prompt, input, cursorPos);
    }
  }
}

/**
 * Handle bracket auto-closing. When a supported opening bracket is typed,
 * automatically insert the corresponding closing bracket.
 */
export function handleBracketAutoClosing(
  input: string,
  key: { sequence?: string }
): { handled: boolean; newInput: string; cursorPos: number } {
  const bracketPairs: Record<string, string> = {
    "(": ")",
    "[": "]",
    "{": "}"
  };

  if (key.sequence && key.sequence in bracketPairs) {
    const closing = bracketPairs[key.sequence];
    // Insert the opening and corresponding closing bracket.
    const newInput = input + key.sequence + closing;
    const newCursorPos = input.length + 1; // Position cursor between the brackets.
    return { handled: true, newInput, cursorPos: newCursorPos };
  }
  return { handled: false, newInput: input, cursorPos: input.length };
}

/**
 * Helper function for confirmation dialogs. Prompts the user to confirm an action.
 */
export async function confirmAndExecute(
  message: string,
  action: () => void | Promise<void>,
  useColors: boolean
): Promise<void> {
  const coloredMessage = useColors ? `\x1b[33m${message}\x1b[0m` : message;
  console.log(coloredMessage);
  console.log("Type 'y' or 'yes' to confirm: ");

  const buf = new Uint8Array(1024);
  const n = await Deno.stdin.read(buf);
  if (n) {
    const answer = new TextDecoder().decode(buf.subarray(0, n)).trim().toLowerCase();
    if (answer === "yes" || answer === "y") {
      await action();
    } else {
      console.log("Operation cancelled.");
    }
  } else {
    console.log("Operation cancelled.");
  }
}
