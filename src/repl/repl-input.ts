// src/repl/repl-input.ts
// REPL input handling and line editing

import { ReplState } from "./repl-state.ts";
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
 * Read a line with support for arrow key navigation, history, and basic editing
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
  
  while (true) {
    const buf = new Uint8Array(3);
    const n = await Deno.stdin.read(buf);
    
    if (n === null) {
      // EOF
      return "\x04"; // Ctrl+D
    }
    
    // Check for control sequences
    if (buf[0] === 1) { // Ctrl+A - move to beginning of line
      cursorPos = 0;
      Deno.stdout.writeSync(new TextEncoder().encode("\r"));
      Deno.stdout.writeSync(new TextEncoder().encode(prompt));
      continue;
    }
    
    if (buf[0] === 5) { // Ctrl+E - move to end of line
      cursorPos = input.length;
      Deno.stdout.writeSync(new TextEncoder().encode("\r"));
      Deno.stdout.writeSync(new TextEncoder().encode(prompt + input));
      continue;
    }
    
    if (buf[0] === 11) { // Ctrl+K - delete from cursor to end of line
      input = input.substring(0, cursorPos);
      Deno.stdout.writeSync(new TextEncoder().encode("\r"));
      Deno.stdout.writeSync(new TextEncoder().encode("\x1b[K"));
      Deno.stdout.writeSync(new TextEncoder().encode(prompt + input));
      continue;
    }
    
    if (buf[0] === 21) { // Ctrl+U - delete from beginning of line to cursor
      input = input.substring(cursorPos);
      cursorPos = 0;
      Deno.stdout.writeSync(new TextEncoder().encode("\r"));
      Deno.stdout.writeSync(new TextEncoder().encode("\x1b[K"));
      Deno.stdout.writeSync(new TextEncoder().encode(prompt + input));
      continue;
    }
    
    if (buf[0] === 23) { // Ctrl+W - delete word backwards
      const beforeCursor = input.substring(0, cursorPos);
      // Find the start of the current word
      const match = beforeCursor.match(/.*\s(\S+)$/);
      if (match) {
        const wordStart = beforeCursor.lastIndexOf(match[1]);
        input = input.substring(0, wordStart) + input.substring(cursorPos);
        cursorPos = wordStart;
      } else {
        // No word found, clear everything before cursor
        input = input.substring(cursorPos);
        cursorPos = 0;
      }
      
      Deno.stdout.writeSync(new TextEncoder().encode("\r"));
      Deno.stdout.writeSync(new TextEncoder().encode("\x1b[K"));
      Deno.stdout.writeSync(new TextEncoder().encode(prompt + input));
      continue;
    }
    
    // Tab completion
    if (buf[0] === 9) { // Tab key
      if (tabCompletion) {
        try {
          // Get completions
          if (completions.length === 0) {
            completions = await tabCompletion.getCompletions(input, cursorPos);
            completionIndex = 0;
          } else {
            // Cycle through completions
            completionIndex = (completionIndex + 1) % completions.length;
          }
          
          if (completions.length > 0) {
            // Apply the completion
            if (input.trim().startsWith(':') || 
                input.trim().startsWith('cd ') || 
                input.trim().startsWith('ls ') || 
                input.trim().startsWith('mkdir ')) {
              // For commands or module operations, we need to preserve the command part
              const cmdMatch = input.match(/^(\S+\s+)/);
              if (cmdMatch) {
                // Keep the command part, replace only what comes after
                const cmdPart = cmdMatch[1];
                const completion = completions[completionIndex];
                input = cmdPart + completion;
              } else {
                // Fall back to replacing the whole input
                input = completions[completionIndex];
              }
              cursorPos = input.length;
            } else if (input.includes(':') && completions[0].includes(':')) {
              // Special case for module:symbol syntax
              const completion = completions[completionIndex];
              input = completion; // Replace entire input for this case
              cursorPos = input.length;
            } else {
              // Symbol completion - replace current word
              const currentWord = getCurrentWordAtCursor(input, cursorPos);
              const completion = completions[completionIndex];
              
              // Replace current word with completion
              const beforeWord = input.substring(0, cursorPos - currentWord.length);
              const afterWord = input.substring(cursorPos);
              
              // Create new input with completion
              input = beforeWord + completion + afterWord;
              
              // Update cursor position
              cursorPos = beforeWord.length + completion.length;
            }
            
            // Redraw the line
            Deno.stdout.writeSync(new TextEncoder().encode("\r"));
            Deno.stdout.writeSync(new TextEncoder().encode("\x1b[K"));
            Deno.stdout.writeSync(new TextEncoder().encode(prompt + input));
            
            // Position cursor
            if (cursorPos < input.length) {
              Deno.stdout.writeSync(new TextEncoder().encode(`\x1b[${prompt.length + cursorPos}G`));
            }
          }
          // Do absolutely nothing when no completions available
        } catch (error) {
          // Silent error handling - don't show any errors
        }
        
        continue;
      }
    } else {
      // Reset completions when any other key is pressed
      completions = [];
      completionIndex = -1;
    }
    
    // Arrow keys and special key sequences
    if (buf[0] === 27) {
      if (buf[1] === 91) { // ESC [ sequence
        if (buf[2] === 65) { // Up arrow
          if (history.length > 0) {
            // Save current input the first time we navigate
            if (localHistoryIndex === -1) {
              originalInput = input;
            }
            
            // Navigate up through history
            localHistoryIndex = Math.min(localHistoryIndex + 1, history.length - 1);
            const historyItem = history[history.length - 1 - localHistoryIndex];
            
            // Clear current line and reset cursor to beginning of line
            Deno.stdout.writeSync(new TextEncoder().encode("\r"));
            // Erase from cursor to end of line
            Deno.stdout.writeSync(new TextEncoder().encode("\x1b[K"));
            Deno.stdout.writeSync(new TextEncoder().encode(prompt));
            
            // Show history item
            input = historyItem;
            Deno.stdout.writeSync(new TextEncoder().encode(input));
            cursorPos = input.length;
          }
        } 
        else if (buf[2] === 66) { // Down arrow
          // Clear current line
          Deno.stdout.writeSync(new TextEncoder().encode("\r"));
          Deno.stdout.writeSync(new TextEncoder().encode("\x1b[K"));
          Deno.stdout.writeSync(new TextEncoder().encode(prompt));
          
          if (localHistoryIndex > 0) {
            // Navigate down through history
            localHistoryIndex--;
            const historyItem = history[history.length - 1 - localHistoryIndex];
            input = historyItem;
          } else if (localHistoryIndex === 0) {
            // Return to original input
            localHistoryIndex = -1;
            input = originalInput;
          }
          
          // Show the result
          Deno.stdout.writeSync(new TextEncoder().encode(input));
          cursorPos = input.length;
        }
        else if (buf[2] === 67) { // Right arrow
          if (cursorPos < input.length) {
            cursorPos++;
            Deno.stdout.writeSync(new TextEncoder().encode("\x1b[C")); // Move cursor right
          }
        }
        else if (buf[2] === 68) { // Left arrow
          if (cursorPos > 0) {
            cursorPos--;
            Deno.stdout.writeSync(new TextEncoder().encode("\x1b[D")); // Move cursor left
          }
        }
        // Support for Home/End keys
        else if (buf[2] === 72 || (buf[2] === 49 && buf[3] === 126)) { // Home key
          cursorPos = 0;
          Deno.stdout.writeSync(new TextEncoder().encode("\r"));
          Deno.stdout.writeSync(new TextEncoder().encode(prompt));
        }
        else if (buf[2] === 70 || (buf[2] === 52 && buf[3] === 126)) { // End key
          cursorPos = input.length;
          Deno.stdout.writeSync(new TextEncoder().encode("\r"));
          Deno.stdout.writeSync(new TextEncoder().encode(prompt + input));
        }
        // Delete key
        else if (buf[2] === 51 && buf[3] === 126) { // Delete key
          if (cursorPos < input.length) {
            input = input.substring(0, cursorPos) + input.substring(cursorPos + 1);
            Deno.stdout.writeSync(new TextEncoder().encode("\r"));
            Deno.stdout.writeSync(new TextEncoder().encode("\x1b[K"));
            Deno.stdout.writeSync(new TextEncoder().encode(prompt + input));
            // Position cursor
            if (cursorPos < input.length) {
              Deno.stdout.writeSync(new TextEncoder().encode(`\x1b[${prompt.length + cursorPos}G`));
            }
          }
        }
        continue;
      }
      // Handle Alt key combinations (ESC followed by character)
      else if (buf[1] >= 32 && buf[1] <= 126) {
        if (buf[1] === 98 || buf[1] === 66) { // Alt+B / Alt+b (move back one word)
          const beforeCursor = input.substring(0, cursorPos);
          const wordMatch = beforeCursor.match(/.*\b(\w+)\s*$/);
          if (wordMatch) {
            const wordStart = beforeCursor.lastIndexOf(wordMatch[1]);
            cursorPos = wordStart;
            Deno.stdout.writeSync(new TextEncoder().encode("\r"));
            Deno.stdout.writeSync(new TextEncoder().encode(prompt + input));
            Deno.stdout.writeSync(new TextEncoder().encode(`\x1b[${prompt.length + cursorPos}G`));
          }
          continue;
        }
        else if (buf[1] === 102 || buf[1] === 70) { // Alt+F / Alt+f (move forward one word)
          const afterCursor = input.substring(cursorPos);
          const wordMatch = afterCursor.match(/^\s*(\w+)/);
          if (wordMatch && wordMatch[1]) {
            const wordEnd = cursorPos + wordMatch[0].length;
            cursorPos = wordEnd;
            Deno.stdout.writeSync(new TextEncoder().encode("\r"));
            Deno.stdout.writeSync(new TextEncoder().encode(prompt + input));
            Deno.stdout.writeSync(new TextEncoder().encode(`\x1b[${prompt.length + cursorPos}G`));
          } else {
            cursorPos = input.length;
            Deno.stdout.writeSync(new TextEncoder().encode("\r"));
            Deno.stdout.writeSync(new TextEncoder().encode(prompt + input));
          }
          continue;
        }
        else if (buf[1] === 100 || buf[1] === 68) { // Alt+D / Alt+d (delete word forward)
          const afterCursor = input.substring(cursorPos);
          const wordMatch = afterCursor.match(/^\s*(\w+)/);
          if (wordMatch) {
            const wordEnd = cursorPos + wordMatch[0].length;
            input = input.substring(0, cursorPos) + input.substring(wordEnd);
            Deno.stdout.writeSync(new TextEncoder().encode("\r"));
            Deno.stdout.writeSync(new TextEncoder().encode("\x1b[K"));
            Deno.stdout.writeSync(new TextEncoder().encode(prompt + input));
            Deno.stdout.writeSync(new TextEncoder().encode(`\x1b[${prompt.length + cursorPos}G`));
          }
          continue;
        }
      }
    }
    
    // Handle Enter
    if (buf[0] === 13) {
      return input;
    }
    
    // Handle Ctrl+C
    if (buf[0] === 3) {
      Deno.stdout.writeSync(new TextEncoder().encode("^C\n"));
      return "\x03"; // Return ETX character to signal Ctrl+C
    }
    
    // Handle Ctrl+D (EOF)
    if (buf[0] === 4) {
      if (input.length === 0) {
        return "\x04"; // Signal EOF only if input is empty
      }
      continue;
    }
    
    // Handle Backspace
    if (buf[0] === 127 || buf[0] === 8) {
      if (cursorPos > 0) {
        // Remove character at cursor position
        input = input.substring(0, cursorPos - 1) + input.substring(cursorPos);
        cursorPos--;
        
        // Redraw the line
        Deno.stdout.writeSync(new TextEncoder().encode("\r"));
        Deno.stdout.writeSync(new TextEncoder().encode("\x1b[K"));
        Deno.stdout.writeSync(new TextEncoder().encode(prompt + input));
        
        // Position cursor
        if (cursorPos < input.length) {
          Deno.stdout.writeSync(new TextEncoder().encode(`\x1b[${prompt.length + cursorPos}G`));
        }
      }
      continue;
    }
    
    // Handle regular character input
    if (buf[0] >= 32 && buf[0] <= 126) {
      // Insert character at cursor position
      const char = String.fromCharCode(buf[0]);
      input = input.substring(0, cursorPos) + char + input.substring(cursorPos);
      cursorPos++;
      
      // Redraw the line
      Deno.stdout.writeSync(new TextEncoder().encode("\r"));
      Deno.stdout.writeSync(new TextEncoder().encode("\x1b[K"));
      Deno.stdout.writeSync(new TextEncoder().encode(prompt + input));
      
      // Position cursor
      if (cursorPos < input.length) {
        Deno.stdout.writeSync(new TextEncoder().encode(`\x1b[${prompt.length + cursorPos}G`));
      }
    }
  }
}

/**
 * Extract the word at the current cursor position
 */
function getCurrentWordAtCursor(input: string, cursorPos: number): string {
  const beforeCursor = input.substring(0, cursorPos);
  const afterCursor = input.substring(cursorPos);
  
  const beforeMatch = beforeCursor.match(/[a-zA-Z0-9_$-]*$/);
  const afterMatch = afterCursor.match(/^[a-zA-Z0-9_$-]*/);
  
  if (!beforeMatch) return "";
  
  return beforeMatch[0] + (afterMatch ? afterMatch[0] : "");
}

/**
 * Handle bracket auto-closing
 */
export function handleBracketAutoClosing(input: string, key: any): {handled: boolean, newInput: string, cursorPos: number} {
  // Implement bracket auto-closing based on previous character
  const bracketPairs: Record<string, string> = {
    "(": ")",
    "[": "]",
    "{": "}"
  };
  
  if (key.sequence && bracketPairs[key.sequence]) {
    const closing = bracketPairs[key.sequence];
    const cursorPos = input.length + 1; // +1 for the new opening bracket
    
    // Auto-insert closing bracket with cursor between them
    const newInput = input + key.sequence + closing;
    
    return {
      handled: true,
      newInput,
      cursorPos
    };
  }
  
  return {
    handled: false,
    newInput: input,
    cursorPos: input.length
  };
}

/**
 * Helper function for confirmation dialogs
 */
export async function confirmAndExecute(
  message: string, 
  action: () => void | Promise<void>, 
  useColors: boolean
): Promise<void> {
  console.log(useColors ? `\x1b[33m${message}\x1b[0m` : message);
  console.log("Type 'y' or 'yes' to confirm: ");
  
  // Use Deno's prompt for user input
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