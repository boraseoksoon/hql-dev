// src/repl/repl-state.ts
// Manages the REPL state, including paren balancing and multiline input

/**
 * Core REPL state interface
 */
export interface ReplState {
    multilineMode: boolean;
    multilineInput: string;
    parenBalance: number;
    importHandlerActive: boolean;
    currentModule: string;
    bracketStack: string[];
  }
  
  /**
   * Reset the REPL state to default values
   */
  export function resetReplState(state: ReplState): void {
    state.multilineMode = false;
    state.multilineInput = "";
    state.parenBalance = 0;
    state.importHandlerActive = false;
    state.bracketStack = [];
  }
  
  /**
   * Get detailed information about bracket balance in a string
   * Tracks bracket types, positions, and provides detailed balance info
   */
  export function getUnbalancedBrackets(text: string): { 
    openCount: number; 
    closeCount: number; 
    balance: number;
    lastOpenType?: string;
    lastCloseType?: string;
    bracketStack: string[];
    lastOpenIndex?: number;
  } {
    const result = {
      openCount: 0,
      closeCount: 0,
      balance: 0,
      lastOpenType: undefined as string | undefined,
      lastCloseType: undefined as string | undefined,
      bracketStack: [] as string[],
      lastOpenIndex: undefined as number | undefined
    };
    
    const openBrackets = ["(", "[", "{"];
    const closeBrackets = [")", "]", "}"];
    const bracketPairs: Record<string, string> = {
      "(": ")",
      "[": "]",
      "{": "}"
    };
    
    // Skip content in string literals and comments
    let inString = false;
    let inComment = false;
    let escapeNext = false;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      
      // Handle comments
      if (char === ';' && !inString) {
        inComment = true;
        continue;
      }
      
      if (inComment) {
        if (char === '\n') {
          inComment = false;
        }
        continue;
      }
      
      // Handle string literals
      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }
      
      if (inString) {
        if (char === '\\') {
          escapeNext = !escapeNext;
        } else {
          escapeNext = false;
        }
        continue;
      }
      
      // Process brackets
      if (openBrackets.includes(char)) {
        result.openCount++;
        result.balance++;
        result.lastOpenType = char;
        result.lastOpenIndex = i;
        result.bracketStack.push(char);
      } else if (closeBrackets.includes(char)) {
        result.closeCount++;
        result.balance--;
        result.lastCloseType = char;
        
        // Check if this is a matching close bracket
        const lastOpen = result.bracketStack.pop();
        if (lastOpen && bracketPairs[lastOpen] !== char) {
          // Mismatched brackets
          result.lastCloseType = `mismatched:${char}`;
        }
      }
    }
    
    return result;
  }
  
  /**
   * Update the paren balance count based on the given line
   */
  export function updateParenBalance(line: string, currentBalance: number, bracketStack: string[]): number {
    const result = getUnbalancedBrackets(line);
    
    // Update the provided bracket stack based on what we parsed
    if (bracketStack) {
      // Clear the stack first
      bracketStack.length = 0;
      
      // Then add all brackets from the result
      for (const bracket of result.bracketStack) {
        bracketStack.push(bracket);
      }
    }
    
    return currentBalance + result.balance;
  }
  
  /**
   * Get suggestion for fixing unbalanced brackets
   */
  export function getSuggestedClosing(bracketStack: string[]): string {
    if (bracketStack.length === 0) return "";
    
    const bracketPairs: Record<string, string> = {
      "(": ")",
      "[": "]",
      "{": "}"
    };
    
    // Build closing sequence in reverse order
    return bracketStack
      .map(bracket => bracketPairs[bracket] || "")
      .reverse()
      .join("");
  }
  
  /**
   * Check if indentation is needed based on the previous line
   */
  export function needsIndentation(previousLine: string): boolean {
    // Check if previous line ends with opening brackets or other indicators
    const openingTokens = ["{", "[", "(", "->", "=>", "do", "then", "else"];
    const trimmed = previousLine.trim();
    
    if (trimmed.length === 0) return false;
    
    // Check for typical functional constructs that need indentation
    const functionalConstructs = [
      /\(\s*fn\s+[^)]*$/,                  // (fn name
      /\(\s*let\s+[^)]*$/,                 // (let [bindings]
      /\(\s*if\s+[^)]*$/,                  // (if condition
      /\(\s*when\s+[^)]*$/,                // (when condition
      /\(\s*cond\s*$/,                     // (cond
      /\(\s*case\s+[^)]*$/,                // (case value
      /\(\s*map\s+[^)]*$/,                 // (map func
      /\(\s*filter\s+[^)]*$/,              // (filter pred
      /\(\s*reduce\s+[^)]*$/,              // (reduce func
      /\(\s*for\s+[^)]*$/,                 // (for [bindings]
      /\(\s*loop\s+[^)]*$/,                // (loop [bindings]
      /\(\s*doseq\s+[^)]*$/,               // (doseq [bindings]
      /\(\s*import\s+[^)]*$/,              // (import [...] from
      /\(\s*export\s+[^)]*$/,              // (export [...])
      /\[\s*[^]]*$/,                       // [ not closed
      /\{\s*[^}]*$/                        // { not closed
    ];
    
    // Check for opening bracket at the end
    for (const token of openingTokens) {
      if (trimmed.endsWith(token)) {
        return true;
      }
    }
    
    // Check for functional constructs
    for (const pattern of functionalConstructs) {
      if (pattern.test(trimmed)) {
        return true;
      }
    }
    
    // Check if we're in the middle of an unclosed bracket
    const balanceResult = getUnbalancedBrackets(previousLine);
    return balanceResult.openCount > balanceResult.closeCount;
  }
  
  /**
   * Extract indentation string from a line
   */
  export function getIndentation(line: string): string {
    const match = line.match(/^(\s*)/);
    return match ? match[1] : "";
  }
  
  /**
   * Calculate proper indentation level based on the previous lines
   */
  export function calculateIndentation(lines: string[], lineIndex: number, defaultIndent = 2): string {
    if (lineIndex <= 0) return "";
    
    const currentLine = lines[lineIndex].trimLeft();
    const previousLine = lines[lineIndex - 1];
    
    // Get base indentation from the previous line
    const previousIndent = getIndentation(previousLine);
    
    // Check for dedenting patterns (closing brackets)
    if (currentLine.startsWith(")") || 
        currentLine.startsWith("]") || 
        currentLine.startsWith("}")) {
      // Dedent one level
      return previousIndent.slice(0, Math.max(0, previousIndent.length - defaultIndent));
    }
    
    // Check if previous line should trigger an indent
    if (needsIndentation(previousLine)) {
      return previousIndent + " ".repeat(defaultIndent);
    }
    
    // Otherwise, maintain the same indentation
    return previousIndent;
  }
  
  /**
   * Calculate auto-indentation for multiline code
   */
  export function getAutoIndentation(prevLines: string, currentLine: string): string {
    // Default indent is 2 spaces
    const baseIndent = "  ";
    
    // Get the last line from the previous input
    const lines = prevLines.split("\n");
    const lastLine = lines[lines.length - 1] || "";
    
    // Extract the existing indentation from the last line
    const existingIndent = lastLine.match(/^(\s*)/)?.[1] || "";
    
    // Check if last line opens a new block (ends with open paren/bracket/brace)
    const openBlockRegex = /[\(\[\{]\s*$/;
    if (openBlockRegex.test(lastLine)) {
      // Add one more level of indentation
      return existingIndent + baseIndent;
    }
    
    // Check if current line closes a block (starts with close paren/bracket/brace)
    const closeBlockRegex = /^\s*[\)\]\}]/;
    if (closeBlockRegex.test(currentLine)) {
      // Reduce indentation by one level if possible
      if (existingIndent.length >= baseIndent.length) {
        return existingIndent.substring(0, existingIndent.length - baseIndent.length);
      }
    }
    
    // For normal lines, maintain the same indentation as the previous line
    return existingIndent;
  }