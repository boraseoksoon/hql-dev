// HLVM adapter for HQL
// Provides helpers to evaluate transpiled JavaScript within HLVM runtime

// Execute JS string in HLVM's eval context if available; fall back to global eval
export async function evalInHLVM(js: string): Promise<any> {
  // If hlvm provides a safe eval or runner, prefer it
  const hlvm = (globalThis as any).hlvm;
  if (hlvm && hlvm.core && hlvm.core.eval && typeof hlvm.core.eval.run === 'function') {
    return await hlvm.core.eval.run(js);
  }
  // Fallback to AsyncFunction
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  const fn = new AsyncFunction(js);
  return await fn();
}

// Register a global alias `hql` that runs HQL code via the main package API
export async function registerAlias(): Promise<void> {
  try {
    const mod = await import("jsr:@boraseoksoon/hql");
    const run = mod.run as (src: string, opts?: any) => Promise<any>;
    (globalThis as any).hql = (code: string) => run(code);
  } catch (e) {
    // Non-fatal if alias cannot be registered
    console.warn("Failed to register hlvm hql alias:", e?.message || e);
  }
}

// Optional REPL preprocessor registration if HLVM exposes a hook
export function registerReplPreprocessor(): void {
  const hlvm = (globalThis as any).hlvm;
  if (!hlvm || !hlvm.repl) return;
  if (!Array.isArray(hlvm.repl.preprocessors)) hlvm.repl.preprocessors = [];
  // Lazy import to avoid circular loads
  hlvm.repl.preprocessors.push(async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed || (trimmed[0] !== '(' && trimmed[0] !== '[')) return null;
    const mod = await import("jsr:@boraseoksoon/hql");
    return await (mod.transpile as (src: string, opts?: any) => Promise<string>)(line);
  });
}

