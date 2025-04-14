// A simple direct evaluator for basic arithmetic expressions
// This bypasses most of the HQL transpilation pipeline to provide a simple demonstration

// Basic types for our simple evaluator
type Token = {
  type: 'number' | 'operator' | 'lparen' | 'rparen';
  value: string;
};

// Simple lexer for basic arithmetic expressions
function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let position = 0;
  
  // Skip whitespace
  function skipWhitespace() {
    while (position < input.length && /\s/.test(input[position])) {
      position++;
    }
  }
  
  while (position < input.length) {
    skipWhitespace();
    
    if (position >= input.length) break;
    
    const char = input[position];
    
    if (/[0-9]/.test(char)) {
      // Parse numbers
      let value = '';
      while (position < input.length && /[0-9]/.test(input[position])) {
        value += input[position++];
      }
      tokens.push({ type: 'number', value });
    } else if (char === '(') {
      tokens.push({ type: 'lparen', value: '(' });
      position++;
    } else if (char === ')') {
      tokens.push({ type: 'rparen', value: ')' });
      position++;
    } else if (['+', '-', '*', '/'].includes(char)) {
      tokens.push({ type: 'operator', value: char });
      position++;
    } else {
      position++;
    }
  }
  
  return tokens;
}

// Simple parsing and evaluation combined
function evaluate(tokens: Token[]): number {
  let position = 0;
  
  function parseExpression(): number {
    if (tokens[position]?.type === 'lparen') {
      position++; // Skip '('
      const operator = tokens[position]?.value;
      position++; // Skip operator
      
      if (operator === '+') {
        let sum = 0;
        while (position < tokens.length && tokens[position]?.type !== 'rparen') {
          sum += parseExpression();
        }
        position++; // Skip ')'
        return sum;
      } else if (operator === '-') {
        const first = parseExpression();
        let result = first;
        while (position < tokens.length && tokens[position]?.type !== 'rparen') {
          result -= parseExpression();
        }
        position++; // Skip ')'
        return result;
      } else if (operator === '*') {
        let product = 1;
        while (position < tokens.length && tokens[position]?.type !== 'rparen') {
          product *= parseExpression();
        }
        position++; // Skip ')'
        return product;
      } else if (operator === '/') {
        const first = parseExpression();
        let result = first;
        while (position < tokens.length && tokens[position]?.type !== 'rparen') {
          result /= parseExpression();
        }
        position++; // Skip ')'
        return result;
      } else {
        throw new Error(`Unknown operator: ${operator}`);
      }
    } else if (tokens[position]?.type === 'number') {
      return parseInt(tokens[position++]?.value || '0', 10);
    } else {
      throw new Error(`Unexpected token: ${tokens[position]?.value}`);
    }
  }
  
  return parseExpression();
}

// Main evaluation function
export function evaluateExpression(expression: string): number {
  const tokens = tokenize(expression);
  return evaluate(tokens);
}

// Direct execution
if (import.meta.main) {
  const args = Deno.args;
  
  if (args.length !== 1) {
    console.error("Usage: deno run -A simple-eval.ts \"(+ 1 1)\"");
    Deno.exit(1);
  }
  
  try {
    const result = evaluateExpression(args[0]);
    console.log(result);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error evaluating expression: ${errorMessage}`);
    Deno.exit(1);
  }
} 