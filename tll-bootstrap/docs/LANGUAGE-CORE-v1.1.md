# TLL Language Core v1.1 — Freeze Specification

**Status: FROZEN**
**Baseline commit:** 12bcdbb
**Tag:** v1.1-language-core-freeze
**Date:** 2026-08-26

This document describes the TLL language as it exists at v1.1 freeze. It is a snapshot of current implementation, not a design for future features.

---

## 0. Architecture Layers

| Layer | Implementation | Identity |
|-------|---------------|----------|
| **Bootstrap** | `tll-compiler/src/*.ts` (TS Compiler + TS Runtime) | Bootstrap Seed / Reference Implementation. Used only to first build TLL compiler bytecode and as reference for equivalence testing. |
| **Language Core** | `compiler.tll` + `lib/*.tll` | 100% TLL. Lexer, Parser, TypeChecker, Codegen, Linker, VM, Package. |
| **Production Execution** | `vm_run.tll` → `lib/vm.tll` | TLL VM executes user bytecode. TS Runtime only loads `vm_run.tllbc` as initial loader. |

**Production chain:**
```
TLL Source → TLL Compiler (pure TLL) → user.tllbc → TLL VM (pure TLL) → execution
```

**Bootstrap chain (first run only):**
```
TS Compiler → compiles vm_run.tll → vm_run.tllbc → TS Runtime loads vm_run.tllbc → TLL VM starts
```

---

## 1. Lexer / Tokens

Token types: identifier, keyword, integer, float, string, boolean, null, operators, comparison, logical, assignment, punctuation, comments.

Keywords: `fn`, `let`, `const`, `if`, `else`, `while`, `for`, `return`, `try`, `catch`, `finally`, `throw`, `import`, `from`, `export`, `true`, `false`, `null`.

String literals support escape sequences. Comments: `//` line comments.

---

## 2. Parser / AST

AST node kinds include: Program, FnDeclaration, LetStatement, ConstStatement, ReturnStatement, IfStatement, WhileStatement, ForStatement, TryStatement, ThrowStatement, ImportStatement, BlockExpression, BinaryExpression, UnaryExpression, CallExpression, MemberExpression, IndexExpression, ArrayLiteral, MapLiteral, Identifier, Literal, NestedFn (function declared inside another function body).

Nested functions are recursively collected by the linker and assigned stable unique internal names (e.g., `__mod_0__outer__inner`).

---

## 3. Type System

Primitive types: `int`, `float`, `string`, `bool`, `null`.
Container types: `array<T>`, `map<K,V>`.
Function types: `fn(...) -> ...`.

Type checking includes: variable inference, assignment checking, function parameter/return compatibility, module symbol resolution (exported/imported).

Type errors produce diagnostics with file, line, column, error type, and context. Incorrect programs do not silently generate wrong bytecode.

---

## 4. Expressions and Statements

**Expressions:** literals, identifiers, binary ops, unary ops, function calls, member access (`obj.prop`), index access (`arr[idx]`), array literals `[a,b,c]`, map literals `{key:val}`, assignment `x = expr`.

**Statements:** `let`, `const`, `if/else`, `while`, `for` (for-in over arrays), `return`, `try/catch/finally`, `throw`, `import/from/export`, `fn` (top-level and nested).

**Operators:** `+ - * / % ** == != < > <= >= && || ! ??`

---

## 5. Function Value

Functions are first-class values. A function value is represented as:
```
{ __fn: true, fnIdx: N, env: null }
```
for top-level functions (no closure environment), or with `env: ClosureEnv` for closures.

Function values can be:
- Assigned to variables: `let f = add`
- Passed as arguments: `apply(add, 1, 2)`
- Returned from functions: `return add`
- Called indirectly: `f(1, 2)` via `OP_CALL` with function-value register.

---

## 6. Nested Function

Functions can be declared inside other function bodies. Nested functions:
- Are recursively collected by the linker during symbol resolution.
- Receive stable unique internal names (`__mod_N__parent__child`).
- Are compiled into the global function table with their own `fnIdx`.
- Can be returned as Function Values from their enclosing function.
- Have `env: null` when they capture no variables (P0-1C.1 model).

---

## 7. Closure

A closure is a function value with a non-null `env` (Closure Environment). Closures capture variables from enclosing lexical scopes.

**Creation:** `OP_CLOSURE` creates a closure object `{ __fn: true, fnIdx, env: { upvalues: [...] } }`. The `upvalues` array contains references to `UpvalueBox` objects shared with the enclosing scope.

**Immutable capture:** captured variables are read via `OP_GET_UPVALUE`.

**Mutable capture:** captured variables are written via `OP_SET_UPVALUE`, which modifies the shared `UpvalueBox.value`.

**Escaping:** when the enclosing function returns, its frame is destroyed, but the closure's `env.upvalues[]` still references the `UpvalueBox` objects, keeping them alive.

---

## 8. Upvalue / Shared Box / Isolation

**UpvalueBox:** `{ value: any }`. Created by `OP_BOX_LOCAL` for any local variable (parameter or let/const) that is referenced by a nested function.

**Shared Box semantics:** sibling closures in the same enclosing function scope share the **same** UpvalueBox reference for a given captured variable. Mutating via one closure is visible to the other.

**Isolation semantics:** each invocation of the enclosing function creates new UpvalueBox instances. Closures from different invocations have independent environments and do not share state.

**Flat closure model:** for deeply nested closures (outer → middle → inner), `inner` directly references the UpvalueBox of `outer.x` in its own `env.upvalues[]`, rather than chaining through `middle.env`.

---

## 9. Module / Package

**Module system:** `from "./path" import name` syntax. Supports relative imports, alias imports, nested modules, same-basename modules (distinct module identity), circular dependency detection.

**Package system:** `tll.toml` manifest with project name, version, entry point, dependencies. `lib/package.tll` handles manifest parsing and dependency resolution.

---

## 10. Linker

The linker (`lib/linker.tll`) performs:
- Recursive module discovery and AST merging.
- Symbol renaming for imported/exported names.
- Nested function collection and internal name assignment.
- Function table finalization (assigning final `fnIdx`).
- Global variable registration.
- Circular dependency detection.
- Output: normalized bytecode program with `functions[]`, `constants[]`, `mainFunctionIndex`, `globalCount`, `schema`.

---

## 11. Bytecode Schema

```json
{
  "functions": [
    { "name": "...", "paramCount": N, "localCount": M, "instructions": [...] }
  ],
  "constants": [...],
  "mainFunctionIndex": N,
  "globalCount": N,
  "schema": "..."
}
```

Each instruction: `{ "op": N, "operands": [...] }`.

---

## 12. Opcode Contract (FROZEN)

| Opcode | Value | Operands | Semantics |
|--------|-------|----------|-----------|
| LOAD_CONST | 0 | r, const_idx | reg[r] = constants[const_idx] |
| LOAD_VAR | 1 | r, var_idx | reg[r] = locals[var_idx] |
| STORE_VAR | 2 | var_idx, r | locals[var_idx] = reg[r] |
| ADD | 3 | r1, r2, r3 | reg[r1] = reg[r2] + reg[r3] |
| SUB | 4 | r1, r2, r3 | reg[r1] = reg[r2] - reg[r3] |
| MUL | 5 | r1, r2, r3 | reg[r1] = reg[r2] * reg[r3] |
| DIV | 6 | r1, r2, r3 | reg[r1] = reg[r2] / reg[r3] |
| MOD | 7 | r1, r2, r3 | reg[r1] = reg[r2] % reg[r3] |
| POW | 8 | r1, r2, r3 | reg[r1] = reg[r2] ** reg[r3] |
| EQ | 9 | r1, r2, r3 | reg[r1] = reg[r2] == reg[r3] |
| NEQ | 10 | r1, r2, r3 | reg[r1] = reg[r2] != reg[r3] |
| LT | 11 | r1, r2, r3 | reg[r1] = reg[r2] < reg[r3] |
| GT | 12 | r1, r2, r3 | reg[r1] = reg[r2] > reg[r3] |
| LE | 13 | r1, r2, r3 | reg[r1] = reg[r2] <= reg[r3] |
| GE | 14 | r1, r2, r3 | reg[r1] = reg[r2] >= reg[r3] |
| AND | 15 | r1, r2, r3 | reg[r1] = reg[r2] && reg[r3] |
| OR | 16 | r1, r2, r3 | reg[r1] = reg[r2] \|\| reg[r3] |
| NOT | 17 | r1, r2 | reg[r1] = !reg[r2] |
| NEG | 18 | r1, r2 | reg[r1] = -reg[r2] |
| JMP | 19 | label | pc = label |
| JMP_IF_FALSE | 20 | r, label | if !reg[r] pc = label |
| CALL | 21 | r, func, arg_count | call function; func<100000 = fnIdx, func>=100000 = register (indirect) |
| RET | 22 | r | return reg[r] |
| PRINT | 23 | r | print reg[r] (no newline) |
| PRINTLN | 24 | r | println reg[r] |
| MAKE_ARRAY | 25 | r, count | reg[r] = [stack_top...] |
| MAKE_MAP | 26 | r, count | reg[r] = {key:val...} |
| MAKE_STRUCT | 27 | r, type_idx, field_count | struct creation |
| INDEX_GET | 28 | r1, r2, r3 | reg[r1] = reg[r2][reg[r3]] |
| INDEX_SET | 29 | r1, r2, r3 | reg[r2][reg[r3]] = reg[r1] |
| MEMBER_GET | 30 | r1, r2, name_idx | reg[r1] = reg[r2][constants[name_idx]] |
| MEMBER_SET | 31 | r1, r2, name_idx | reg[r2][constants[name_idx]] = reg[r1] |
| HALT | 32 | — | stop execution |
| NOP | 33 | — | no operation |
| PUSH | 34 | r | push reg[r] to arg stack |
| CONCAT | 35 | r1, r2, r3 | string concat |
| LOAD_BUILTIN | 36 | r, builtin_idx | reg[r] = builtin function reference |
| THROW | 37 | r | throw reg[r] |
| TRY_START | 38 | catch_offset | register try handler |
| TRY_END | 39 | — | clear try handler |
| LOAD_GLOBAL | 40 | r, global_idx | reg[r] = globals[global_idx] |
| STORE_GLOBAL | 41 | global_idx, r | globals[global_idx] = reg[r] |
| **CLOSURE** | **42** | **r, fnIdx, captureCount, [upvalueSlot...]** | **Create closure: reg[r] = {__fn, fnIdx, env:{upvalues:[...]}}** |
| **GET_UPVALUE** | **43** | **r, slot** | **reg[r] = closureEnv.upvalues[slot].value** |
| **SET_UPVALUE** | **44** | **slot, r** | **closureEnv.upvalues[slot].value = reg[r]** |
| **BOX_LOCAL** | **45** | **localSlot, upvalueSlot** | **closureEnv.upvalues[upvalueSlot] = {value: locals[localSlot]}** |

**Opcodes 42-45 are frozen. Their operand encoding and semantics must not change in v1.1.x.**

---

## 13. TLL VM

The TLL VM (`lib/vm.tll`) is a register-based bytecode interpreter. It maintains:
- Per-call-frame: registers (256), locals, pc, argStack, tryStack, returnReg, fnIdx, closureEnv.
- Global state: constants, functions, globals, callStack.
- Closure environment stack: `vm_cs_closureEnv[]` parallel to call stack.

The VM executes all 46 opcodes (0-45) including the 4 closure opcodes. It is the production runtime for TLL programs.

---

## 14. Builtin / Stdlib API

Builtin functions are loaded via `OP_LOAD_BUILTIN` with a fixed index. Modules:

| Module | Functions |
|--------|-----------|
| `io` | println, print, readLine |
| `json` | parse, stringify |
| `math` | sqrt, abs, floor, ceil, round, min, max, pow, sin, cos, tan, log, log2, log10, exp, pi, e, random, randomInt |
| `strings` | length, toUpper, toLower, trim, trimStart, trimEnd, split, join, contains, startsWith, endsWith, substring, replace, replaceAll, repeat, padStart, padEnd, charAt, charCodeAt, indexOf, lastIndexOf, isEmpty, reverse, lines, words |
| `arrays` | length, get, push, pop, shift, unshift, concat, slice, includes, indexOf, join, reverse, sort, filter, map, reduce, forEach, find, some, every, flat, fill |
| `convert` | toString, toInt, toFloat, toBool, typeOf |
| `fs` | readFile, writeFile, readDir, stat, exists |
| `http` | get, post |

Note: `arrays.set` does not exist. Use direct index assignment `arr[idx] = val` (compiles to `OP_INDEX_SET`).

---

## 15. CLI Basic Behavior

| Command | Behavior |
|---------|----------|
| `tll run <file>` | Compile via TLL Compiler, execute via TLL VM (vm_run.tllbc) |
| `tll build <file> [-o out]` | Compile to .tllbc bytecode file |
| `tll check <file>` | Parse and typecheck only, no execution |
| `tll repl` | Interactive REPL |
| `tll version` | Print version |
| `tll help` | Print help |

On first run, if `vm_run.tllbc` is missing, `tll.js` auto-bootstraps it using the TS compiler (bootstrap seed).

---

## 16. Freeze Declaration

The following are frozen as of v1.1:
- Lexer token set and keyword list
- Parser grammar and AST node kinds
- Type system rules
- Function Value representation (`{__fn, fnIdx, env}`)
- Nested function collection and naming
- Closure environment model (UpvalueBox, shared box, isolation, flat closure)
- Module import/export syntax and resolution
- Bytecode schema format
- **Opcode contract 0-45, especially 42-45**
- TLL VM execution model
- Builtin module API surface
- CLI command interface

Changes to any frozen item require a major version bump (v2.0) and must not break A==B==C determinism or existing test suites.

---

## 17. Verification Baseline

At freeze point:
- 32/32 tests pass
- A==B==C self-host: 152 functions, 3867 constants, 18463 instructions, 9 dimensions 0 diffs
- TS Runtime == TLL VM equivalence verified
- Fresh clone bootstrap works (auto-generates vm_run.tllbc)
- Production `tll run` executes via TLL VM, not TS Runtime directly
