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

/**
 * Defines character sets for efficient checks
 */
export const CharSets = {
  // Delimiters include all characters that should act as word boundaries
  DELIMITERS: /[\s.(){}\[\],:;]/,
  // Printable ASCII characters
  PRINTABLE: (char: number) => char >= 32 && char <= 126,
  // Word characters used for completion
  WORD_CHARS: /[a-zA-Z0-9_$-]/
};

/**
 * Key codes and sequences used throughout the input handler
 */
export const Keys = {
  // Control keys
  CTRL_A: 1,
  CTRL_E: 5,
  CTRL_K: 11,
  CTRL_U: 21,
  CTRL_W: 23,
  CTRL_C: 3,
  CTRL_D: 4,
  TAB: 9,
  ESC: 27,
  ENTER: 13,
  BACKSPACE: 127,
  BACKSPACE_ALT: 8,
  
  // ANSI sequences
  CSI: 91,  // Control Sequence Introducer
  
  // Shift+Tab sequence
  SHIFT_TAB_Z: 90,
  
  // Arrow keys
  ARROW_UP: 65,
  ARROW_DOWN: 66,
  ARROW_RIGHT: 67,
  ARROW_LEFT: 68,
  
  // Special keys
  DELETE_SEQ: 51,
  HOME_ALT: 49,
  END_ALT: 52
};

// Terminal output utilities
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
  // Split into lines based on newline characters.
  const lines = content.split(/\r?\n/);
  const justPasted = true;
  
  if (lines.length > 1) {
    // For multiline paste, insert the first line and store remaining non-empty lines.
    const firstLine = sanitizeInput(lines[0]);
    input = input.substring(0, cursorPos) + firstLine + input.substring(cursorPos);
    cursorPos += firstLine.length;
    pastedLines = lines.slice(1).filter(line => line.trim() !== "");
  } else {
    // Single line paste.
    const cleanContent = sanitizeInput(content);
    input = input.substring(0, cursorPos) + cleanContent + input.substring(cursorPos);
    cursorPos += cleanContent.length;
  }
  return { input, cursorPos, pastedLines, justPasted };
}

/**
 * Sanitizes input by removing control characters
 */
function sanitizeInput(input: string): string {
  return input.replace(/[\x00-\x1F\x7F]/g, "");
}

/**
 * Handler for Ctrl+W to delete a word backwards with proper handling of delimiters
 */
function handleCtrlW(input: string, cursorPos: number): { input: string; cursorPos: number } {
  if (cursorPos <= 0) {
    return { input, cursorPos };
  }
  
  const beforeCursor = input.substring(0, cursorPos);
  
  // Skip whitespace immediately before cursor
  let deletePos = cursorPos;
  while (deletePos > 0 && /\s/.test(beforeCursor.charAt(deletePos - 1))) {
    deletePos--;
  }
  
  // Handle special case if we're immediately after a delimiter
  const lastChar = deletePos > 0 ? beforeCursor.charAt(deletePos - 1) : '';
  const isAfterDelimiter = CharSets.DELIMITERS.test(lastChar);
  
  if (isAfterDelimiter) {
    // Delete just the delimiter
    return { 
      input: input.substring(0, deletePos - 1) + input.substring(cursorPos),
      cursorPos: deletePos - 1
    };
  } 
  
  // Delete until the next delimiter or whitespace backward
  let wordStart = deletePos;
  while (wordStart > 0 && !CharSets.DELIMITERS.test(beforeCursor.charAt(wordStart - 1))) {
    wordStart--;
  }
  
  if (wordStart < cursorPos) {
    return {
      input: input.substring(0, wordStart) + input.substring(cursorPos),
      cursorPos: wordStart
    };
  }
  
  return { input, cursorPos };
}

/**
 * Handler for Alt+B to move cursor back one word
 */
function handleAltB(input: string, cursorPos: number): number {
  if (cursorPos <= 0) return cursorPos;
  
  const beforeCursor = input.substring(0, cursorPos);
  const wordMatch = beforeCursor.match(/.*\b(\w+)\s*$/);
  
  if (wordMatch) {
    return beforeCursor.lastIndexOf(wordMatch[1]);
  }
  
  return cursorPos;
}

/**
 * Handler for Alt+F to move cursor forward one word
 */
function handleAltF(input: string, cursorPos: number): number {
  if (cursorPos >= input.length) return cursorPos;
  
  const afterCursor = input.substring(cursorPos);
  const wordMatch = afterCursor.match(/^\s*(\w+)/);
  
  if (wordMatch && wordMatch[1]) {
    return cursorPos + wordMatch[0].length;
  }
  
  return input.length;
}

/**
 * Handler for Alt+D to delete a word forward
 */
function handleAltD(input: string, cursorPos: number): string {
  if (cursorPos >= input.length) return input;
  
  const afterCursor = input.substring(cursorPos);
  const wordMatch = afterCursor.match(/^\s*(\w+)/);
  
  if (wordMatch) {
    const wordEnd = cursorPos + wordMatch[0].length;
    return input.substring(0, cursorPos) + input.substring(wordEnd);
  }
  
  return input;
}

/**
 * Handle tab completion (used for both Tab and Shift+Tab)
 */
async function handleTabCompletion(
  input: string,
  cursorPos: number,
  prompt: string,
  tabCompletion: TabCompletion,
  existingCompletions: string[],
  existingCompletionIndex: number,
  isReverse: boolean
): Promise<{ input: string; cursorPos: number; completions: string[]; completionIndex: number } | null> {
  try {
    let completions = existingCompletions;
    let completionIndex = existingCompletionIndex;
    
    // Get property access context if relevant
    const dotIndex = input.lastIndexOf('.');
    const isPropertyCompletion = dotIndex >= 0;
    const objectPart = isPropertyCompletion ? input.substring(0, dotIndex + 1) : "";
    
    // List of core CLI commands for reference
    const coreCliCommands = ["ls", "cd", "pwd", "find", "mkdir", "man", "rm"];
    const coreReplCommands = [":show", ":go", ":help", ":list", ":modules", ":remove", ":doc"];
    const allCommands = [...coreCliCommands, ...coreReplCommands];
    
    // Check if we're dealing with a command with options
    const hasOptions = input.trim().match(/^[^\s]+\s+-\w+/);
    
    // Special case: if we just completed a command (have completions but exact match with a command)
    // we should clear completions to force a refresh with options
    if (completions.length > 0 && completionIndex >= 0 && !hasOptions) {
      const exactCommandMatch = allCommands.some(cmd => input.trim() === cmd);
      if (exactCommandMatch) {
        // Only clear if the completion already applied is a command (not an option)
        const lastCompletion = completions[completionIndex];
        const isCommandCompletion = !lastCompletion.includes('-') && !lastCompletion.includes(' -');
        
        if (isCommandCompletion) {
          completions = [];
          completionIndex = -1;
        }
      }
    }
    
    // Fetch completions if we don't have any yet
    if (completions.length === 0) {
      const formattedCompletions = await tabCompletion.getFormattedCompletions(input, cursorPos);
      completions = formattedCompletions.map(c => c.text);
      
      // Set initial index based on direction
      completionIndex = isReverse ? completions.length - 1 : 0;
      
      // If we have exactly one CLI command completion, add a space to continue
      const isExactCoreCliCommand = allCommands.includes(input.trim());
      const isPartialCommand = allCommands.some(cmd => input.trim().length > 0 && cmd.startsWith(input.trim()));
      
      // Command completion case - immediately add space and prepare for option completion
      if (completions.length === 1) {
        if (isExactCoreCliCommand) {
          completions[0] = completions[0] + " ";
        } else if (isPartialCommand && !completions[0].includes(' ') && !completions[0].startsWith('-')) {
          // For partial commands like "l" -> "ls", add space to prepare for options
          completions[0] = completions[0] + " ";
        }
      }
      
      // If input is just a command with or without space, prioritize command options
      const isCommandWithSpace = allCommands.some(cmd => 
        input.trim() === cmd || input.trim() === cmd + " " || input === cmd + " ");
      
      if (isCommandWithSpace && completions.length > 0) {
        // Ensure we prefer options that add a dash
        completions = completions.sort((a, b) => {
          const aAddsOption = a.includes('-');
          const bAddsOption = b.includes('-');
          
          if (aAddsOption && !bAddsOption) return -1;
          if (!aAddsOption && bAddsOption) return 1;
          return 0;
        });
        
        completionIndex = isReverse ? completions.length - 1 : 0;
      }
    } else {
      // Cycle through completions
      if (isReverse) {
        completionIndex = (completionIndex - 1 + completions.length) % completions.length;
      } else {
        completionIndex = (completionIndex + 1) % completions.length;
      }
    }

    if (completions.length === 0) {
      return null;
    }
    
    const completion = completions[completionIndex];
    
    // Check if this is a command with options completion
    const isCommandWithOptions = completion.match(/^[^\s]+\s+-\w+/);
    
    // For command options, we want to replace the entire input
    if (isCommandWithOptions && hasOptions) {
      input = completion;
      cursorPos = completion.length;
      redrawLine(prompt, input, cursorPos);
      return { input, cursorPos, completions, completionIndex };
    }
    
    // Apply the completion based on context
    const result = applyCompletion(input, cursorPos, completion, isPropertyCompletion, objectPart);
    input = result.input;
    cursorPos = result.cursorPos;
    
    redrawLine(prompt, input, cursorPos);
    return { input, cursorPos, completions, completionIndex };
  } catch (error) {
    // Suppress any errors silently for completion.
    return null;
  }
}

/**
 * Applies a completion to the current input
 */
function applyCompletion(
  input: string, 
  cursorPos: number, 
  completion: string,
  isPropertyCompletion: boolean,
  objectPart: string
): { input: string; cursorPos: number } {
  // Handle property access completions
  if (isPropertyCompletion && completion.includes('.')) {
    const propDotIndex = completion.indexOf('.');
    
    // Check if it's a function completion with opening parenthesis
    if (completion.startsWith('(')) {
      return { input: completion, cursorPos: completion.length };
    } else {
      const propPart = completion.substring(propDotIndex + 1);
      return { 
        input: objectPart + propPart, 
        cursorPos: objectPart.length + propPart.length 
      };
    }
  }
  
  // Handle CLI command with options (like "ls -all")
  const commandWithOptionsMatch = completion.match(/^([^\s]+)(\s+-\w+)$/);
  if (commandWithOptionsMatch) {
    // For "ls -all" style completions, replace the entire input
    return { input: completion, cursorPos: completion.length };
  }
  
  // Handle option completions (those starting with dash)
  if (completion.startsWith('-')) {
    // Extract the base command without options
    const baseCommandMatch = input.match(/^([^\s]+)(?:\s+-\w+)*\s*$/);
    if (baseCommandMatch) {
      const baseCommand = baseCommandMatch[1];
      // Replace entire input with base command + new option
      return { input: `${baseCommand} ${completion}`, cursorPos: (baseCommand.length + completion.length + 1) };
    }
    
    // This is a case where the user has typed a command and space, and we're suggesting options
    const inputWithSpace = input.endsWith(' ') ? input : input + ' ';
    return { input: inputWithSpace + completion, cursorPos: (inputWithSpace + completion).length };
  }
  
  // Handle completions with spaces (like "ls -all")
  if (completion.includes(' ')) {
    // This is likely a command with options suggested
    return { input: completion, cursorPos: completion.length };
  }
  
  // For certain commands, preserve the command part
  if (input.trim().startsWith(':') ||
      input.trim().startsWith('cd ') ||
      input.trim().startsWith('ls ') ||
      input.trim().startsWith('find ') ||
      input.trim().startsWith('mkdir ') ||
      input.trim().startsWith('man ') ||
      input.trim().startsWith('rm ')) {
    const cmdMatch = input.match(/^(\S+\s+)/);
    if (cmdMatch) {
      return { 
        input: cmdMatch[1] + completion, 
        cursorPos: (cmdMatch[1] + completion).length 
      };
    } else {
      return { input: completion, cursorPos: completion.length };
    }
  } 
  
  // Special case for module:symbol syntax
  if (input.includes(':') && completion.includes(':')) {
    return { input: completion, cursorPos: completion.length };
  } 
  
  // Symbol completion: replace the current word
  const currentWord = getCurrentWordAtCursor(input, cursorPos);
  const beforeWord = input.substring(0, cursorPos - currentWord.length);
  const afterWord = input.substring(cursorPos);
  
  // Handle direct CLI command completion (like "m" → "mkdir")
  if (["ls", "cd", "pwd", "find", "mkdir", "man", "rm"].includes(completion)) {
    return {
      input: beforeWord + completion + afterWord,
      cursorPos: beforeWord.length + completion.length
    };
  }
  
  // Check if we're inside parentheses already
  const isInsideParens = (beforeWord.lastIndexOf('(') > beforeWord.lastIndexOf(')'));
  
  if (completion.startsWith('(')) {
    // Extract the actual symbol name without the opening parenthesis
    const symbolName = completion.substring(1);
    
    // If typed 'c' and completion is '(chalkJSR', we need to use the formatted version with parenthesis
    if (currentWord.length > 0 && symbolName.toLowerCase().startsWith(currentWord.toLowerCase())) {
      if (!isInsideParens) {
        // Replace currentWord with the full formatted completion (with opening parenthesis)
        return {
          input: beforeWord + completion + afterWord,
          cursorPos: beforeWord.length + completion.length
        };
      } else {
        // If already inside parens, replace with just the symbol name (no opening paren)
        return {
          input: beforeWord + symbolName + afterWord,
          cursorPos: beforeWord.length + symbolName.length
        };
      }
    } else {
      // If the current word doesn't match the start of the completion
      if (!isInsideParens) {
        return {
          input: beforeWord + completion + afterWord,
          cursorPos: beforeWord.length + completion.length
        };
      } else {
        return {
          input: beforeWord + symbolName + afterWord,
          cursorPos: beforeWord.length + symbolName.length
        };
      }
    }
  } else {
    // For non-function completions, just replace the current word
    return {
      input: beforeWord + completion + afterWord,
      cursorPos: beforeWord.length + completion.length
    };
  }
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
  let lastInput = ""; // Keep track of last input to detect changes

  while (true) {
    // Reset completions if input has changed in a way that would affect them
    if (input !== lastInput && 
        // Reset completions if a space was added, which likely means a command was completed
        (input.endsWith(' ') && !lastInput.endsWith(' '))) {
      completions = [];
      completionIndex = -1;
    }
    
    lastInput = input;
    
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
    if (key === Keys.CTRL_A) { // Move to beginning of line
      cursorPos = 0;
      redrawLine(prompt, input, cursorPos);
      justPasted = false;
      continue;
    }
    if (key === Keys.CTRL_E) { // Move to end of line
      cursorPos = input.length;
      redrawLine(prompt, input, cursorPos);
      justPasted = false;
      continue;
    }
    if (key === Keys.CTRL_K) { // Delete from cursor to end of line
      input = input.substring(0, cursorPos);
      redrawLine(prompt, input, cursorPos);
      justPasted = false;
      continue;
    }
    if (key === Keys.CTRL_U) { // Delete from beginning to cursor
      input = input.substring(cursorPos);
      cursorPos = 0;
      redrawLine(prompt, input, cursorPos);
      justPasted = false;
      continue;
    }
    if (key === Keys.CTRL_W) { // Delete word backwards
      justPasted = false;
      const result = handleCtrlW(input, cursorPos);
      input = result.input;
      cursorPos = result.cursorPos;
      redrawLine(prompt, input, cursorPos);
      continue;
    }

    // ----------------------
    // Tab Completion
    // ----------------------
    if (key === Keys.TAB && tabCompletion) {
      justPasted = false;
      
      const result = await handleTabCompletion(
        input, cursorPos, prompt, tabCompletion, 
        completions, completionIndex, false
      );
      
      if (result) {
        input = result.input;
        cursorPos = result.cursorPos;
        completions = result.completions;
        completionIndex = result.completionIndex;
      }
      
      continue;
    } else if (key !== Keys.ESC) {
      // Reset completions if any key other than ESC is pressed
      // (we need to preserve completions for Shift+Tab)
      completions = [];
      completionIndex = -1;
    }

    // ----------------------
    // Arrow Keys & Special Sequences
    // ----------------------
    if (key === Keys.ESC) {
      justPasted = false;
      
      // Ensure there are enough bytes and check for Shift+Tab sequence (ESC [ Z)
      if (n >= 3 && buf[1] === Keys.CSI && buf[2] === Keys.SHIFT_TAB_Z && tabCompletion) {
        const result = await handleTabCompletion(
          input, cursorPos, prompt, tabCompletion, 
          completions, completionIndex, true
        );
        
        if (result) {
          input = result.input;
          cursorPos = result.cursorPos;
          completions = result.completions;
          completionIndex = result.completionIndex;
        }
        
        continue;
      }
      
      // Handle Alt key combinations (ESC followed by a printable character)
      if (buf[1] >= 32 && buf[1] <= 126) {
        const altChar = buf[1];
        if (altChar === 98 || altChar === 66) { // Alt+B: move back one word
          cursorPos = handleAltB(input, cursorPos);
          redrawLine(prompt, input, cursorPos);
          continue;
        } else if (altChar === 102 || altChar === 70) { // Alt+F: move forward one word
          cursorPos = handleAltF(input, cursorPos);
          redrawLine(prompt, input, cursorPos);
          continue;
        } else if (altChar === 100 || altChar === 68) { // Alt+D: delete word forward
          input = handleAltD(input, cursorPos);
          redrawLine(prompt, input, cursorPos);
          continue;
        }
      }
      
      // Ensure there are enough bytes for the escape sequence
      if (buf[1] === Keys.CSI) {
        const seq = buf[2];
        switch (seq) {
          case Keys.ARROW_UP:
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
          case Keys.ARROW_DOWN:
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
          case Keys.ARROW_RIGHT:
            if (cursorPos < input.length) {
              cursorPos++;
              write("\x1b[C"); // Move cursor right.
            }
            break;
          case Keys.ARROW_LEFT:
            if (cursorPos > 0) {
              cursorPos--;
              write("\x1b[D"); // Move cursor left.
            }
            break;
          default:
            // Handle Home/End and Delete keys
            if (seq === Keys.HOME_ALT && buf[3] === 126) { // Home key
              cursorPos = 0;
              redrawLine(prompt, input, cursorPos);
            } else if (seq === Keys.END_ALT && buf[3] === 126) { // End key
              cursorPos = input.length;
              redrawLine(prompt, input, cursorPos);
            } else if (seq === Keys.DELETE_SEQ && buf[3] === 126) { // Delete key
              if (cursorPos < input.length) {
                input = input.substring(0, cursorPos) + input.substring(cursorPos + 1);
                redrawLine(prompt, input, cursorPos);
              }
            }
            break;
        }
      }
      continue;
    }

    // ----------------------
    // Handle Enter (Return)
    // ----------------------
    if (key === Keys.ENTER) {
      // Process any pending pasted lines if needed (currently, we return the current input).
      justPasted = false;
      return input;
    }

    // ----------------------
    // Handle Ctrl+C (Interrupt)
    // ----------------------
    if (key === Keys.CTRL_C) {
      write("^C\n");
      pastedLines = [];
      justPasted = false;
      return "\x03"; // ETX (End of Text) character for Ctrl+C.
    }

    // ----------------------
    // Handle Ctrl+D (EOF)
    // ----------------------
    if (key === Keys.CTRL_D) {
      if (input.length === 0) {
        return "\x04"; // EOF only if input is empty.
      }
      continue;
    }

    // ----------------------
    // Handle Backspace
    // ----------------------
    if (key === Keys.BACKSPACE || key === Keys.BACKSPACE_ALT) {
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
    if (CharSets.PRINTABLE(key)) {
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
