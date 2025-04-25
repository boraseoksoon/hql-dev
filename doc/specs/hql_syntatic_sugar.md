````markdown
# HQL Syntactic Sugar

Let's explore how to handle all syntactic sugar consistently and how macros
could eventually replace the syntax transformer. This document uses ASCII
diagrams and code examples to illustrate the concepts.

---

## Current Pipeline with Syntax Transformer

```plaintext
┌──────────┐    ┌──────────┐    ┌────────────────┐    ┌───────────┐    ┌──────────┐
│  Source  │    │  Parser  │    │     Syntax     │    │   Macro   │    │    IR    │
│   Code   │───>│  S-expr  │───>│  Transformer   │───>│  Expander │───>│Transformer│
└──────────┘    └──────────┘    └────────────────┘    └───────────┘    └──────────┘
                     ▲                  ▲                   ▲                ▲
                     │                  │                   │                │
                     │                  │                   │                │
            Handles data        Handles syntactic     Handles macros    Generates code
           structure literals   transformations      (user-defined)    from canonical
               [1,2,3]            like 'fx'                             expressions
```

---

## Macro-Based Approach vs. Syntax Transformer

### Current Approach

```plaintext
┌───────────────────────────────────────────────────────────────────┐
│                        Current Approach                           │
├──────────┬─────────────────┬──────────────────┬──────────────────┤
│  Parser  │     Syntax      │      Macro       │       Code       │
│          │   Transformer   │     Expander     │     Generator    │
│  [hard-  │    [hard-       │  [defined        │    [backend      │
│  coded]  │     coded]      │    macros]       │    processing]   │
└──────────┴─────────────────┴──────────────────┴──────────────────┘
```

### Future Approach

```plaintext
┌───────────────────────────────────────────────────────────────────┐
│                        Future Approach                            │
├──────────┬─────────────────────────────────────┬──────────────────┤
│  Parser  │              Macros                 │       Code       │
│          │                                     │     Generator    │
│  [hard-  │   [replaces syntax transformer      │    [backend      │
│  coded]  │    and provides extensibility]      │    processing]   │
│          │                                     │                  │
└──────────┴─────────────────────────────────────┴──────────────────┘
```

The key difference is that the macro system allows the language to extend itself
without requiring changes to the compiler, while the syntax transformer involves
hard-coded logic.

---

## How Macros Can Replace the Syntax Transformer

### Evolution Path

1. **Syntax Transformer (TypeScript)**
   - Hard-coded transformations
   - Part of the compiler
2. **Core Macros (HQL)**
   - Same transformations written in HQL
   - Loaded before user code
3. **Extended Macro System**
   - User-definable syntax
   - Full language extensibility

---

## Macro Expansion in the Pipeline

### Current Pipeline

```plaintext
┌──────────┐    ┌──────────┐    ┌────────────────┐    ┌───────────┐    ┌──────────┐
│  Source  │    │  Parser  │    │     Syntax     │    │   Macro   │    │    IR    │
│   Code   │───>│  S-expr  │───>│  Transformer   │───>│  Expander │───>│Transformer│
└──────────┘    └──────────┘    └────────────────┘    └───────────┘    └──────────┘
```

### Pipeline Transition

- **Current**:\
  `Parser → Syntax Transformer → Macro Expansion → IR Transformer → JS Output`

- **Potential Future**:\
  `Parser → Macro Expansion → IR Transformer → JS Output`\
  _(Moving the syntax transformer logic into macros)_

---

## How HQL Macros Are Implemented

### Macro Expansion Function

The macro expansion logic in your codebase is located in `src/s-exp/macro.ts`.
For example:

```typescript
export function expandMacros(
  exprs: SExp[],
  env: Environment,
  options: MacroExpanderOptions = {},
): SExp[] {
  // ... (macro expansion logic)
}
```

This function is called in your main transpiler function (e.g., in
`src/transpiler/hql-transpiler.ts`):

```typescript
// In processHql() function
// Step 5: Expand macros in the user code
expanded = expandMacros(sexps, env, { ... });
```

---

## Macro System

```plaintext
┌───────────────────────────────────────────────────┐
│                  Macro System                     │
├───────────────────────────────────────────────────┤
│                  Macros                           │
│                (defmacro)                         │
├───────────────────────────────────────────────────┤
│ • Defined in core.hql or user modules            │
│ • Available globally                             │
│ • Core macros loaded first                        │
└───────────────────────────────────────────────────┘
```

- **Macros**: Defined with `defmacro` and available globally throughout the codebase.