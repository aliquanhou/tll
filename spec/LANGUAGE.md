# TLL OS Language Specification

**Version**: 1.1.0
**Status**: FROZEN
**Last Updated**: 2026-08-26

---

## TLL OS is a specification-driven AI-native programming language.

This document is the **single semantic authority** for TLL OS. All VM implementations (Native C VM, TLL Semantic VM, future Rust/Go/WASM VMs) must conform to this specification.

> **HARD GATE: Semantic Authority**
> TLL OS has exactly one semantic authority: the Language Specification.
> Any VM implementation is a conforming implementation of this spec.
> When a VM has a bug, the spec is the source of truth, not another VM.

---

## 1. Language Overview

TLL (pronounced "tickle") is a statically-typed, garbage-collected, first-class-function programming language designed for AI-native application development.

### 1.1 Design Principles

| Principle | Description |
|-----------|-------------|
| **Specification-Driven** | The spec is the truth. Implementations conform to spec. |
| **Self-Hosting** | The compiler is written in TLL and can compile itself. |
| **First-Class Functions** | Functions are values, can be passed, returned, and captured in closures. |
| **Lexical Scoping** | Variables follow lexical scope with proper closure capture. |
| **Deterministic Builds** | A==B==C: three consecutive compilations produce identical bytecode. |
| **Runtime Independence** | Language semantics do not depend on any host runtime (Node.js, etc.). |

### 1.2 Version Status

| Feature | v1.1 Status |
|---------|------------|
| Lexer / Parser | FROZEN |
| Type System (basic) | FROZEN |
| Codegen / Linker | FROZEN |
| Bytecode Format (JSON) | FROZEN |
| 46 Opcodes (0-45) | FROZEN |
| First-Class Functions | FROZEN |
| Higher-Order Functions | FROZEN |
| Nested Functions | FROZEN |
| Closures (immutable + mutable capture) | FROZEN |
| Shared UpvalueBox | FROZEN |
| Closure Isolation | FROZEN |
| Flat Closure (nested) | FROZEN |
| Escaping Closures | FROZEN |
| Module System | FROZEN |
| Package System (basic) | FROZEN |
| Exception System (try/catch/finally/throw) | FROZEN |
| 98 Builtins (0-97) | FROZEN |
| Self-Hosting (A==B==C) | FROZEN |
| Generics | NOT IN v1.1 |
| Async/Await | NOT IN v1.1 |
| Agent Native Layer | PLANNED v1.2 |

---

## 2. Type System

### 2.1 Primitive Types

| Type | Description | Example |
|------|-------------|---------|
| `int` | 64-bit signed integer | `42`, `-7` |
| `float` | 64-bit IEEE 754 double | `3.14`, `1.0` |
| `string` | UTF-8 encoded string | `"hello"`, `'world'` |
| `bool` | Boolean | `true`, `false` |
| `null` | Null value | `null` |

### 2.2 Composite Types

| Type | Description | Example |
|------|-------------|---------|
| `array<T>` | Dynamic array | `[1, 2, 3]` |
| `map<K,V>` | Hash map | `{"key": "value"}` |
| `fn(...) -> ...` | Function type | `fn(a: int, b: int) -> int` |

### 2.3 Type Inference

TLL supports local type inference. Variable types are inferred from initial values. Explicit type annotations are optional.

```tll
let x = 42          // inferred as int
let y: float = 3.14 // explicit annotation
let f = fn(a) { a } // inferred as fn(any) -> any
```

---

## 3. Statements

| Statement | Syntax | Description |
|-----------|--------|-------------|
| Variable | `let name = expr` | Mutable variable declaration |
| Constant | `const name = expr` | Immutable constant |
| Function | `fn name(params) { body }` | Function declaration |
| If/Else | `if (cond) { } else { }` | Conditional |
| While | `while (cond) { }` | While loop |
| For | `for (init; cond; update) { }` | C-style for loop |
| Return | `return expr` | Return from function |
| Try/Catch | `try { } catch (e) { }` | Exception handling |
| Finally | `try { } finally { }` | Always-executed block |
| Throw | `throw expr` | Throw exception |
| Import | `from "./path" import name` | Import from module |
| Export | `export name` | Export symbol |

---

## 4. Operators

### 4.1 Arithmetic

| Operator | Description | Example |
|----------|-------------|---------|
| `+` | Addition | `a + b` |
| `-` | Subtraction / Negation | `a - b`, `-a` |
| `*` | Multiplication | `a * b` |
| `/` | Division | `a / b` |
| `%` | Modulo | `a % b` |
| `**` | Power | `a ** b` |

### 4.2 Comparison

| Operator | Description |
|----------|-------------|
| `==` | Equal |
| `!=` | Not equal |
| `<` | Less than |
| `>` | Greater than |
| `<=` | Less or equal |
| `>=` | Greater or equal |

### 4.3 Logical

| Operator | Description |
|----------|-------------|
| `&&` | Logical AND (short-circuit) |
| `||` | Logical OR (short-circuit) |
| `!` | Logical NOT |
| `??` | Null coalescing |

---

## 5. Builtin Modules

| Module | Index Range | Count | Category |
|--------|------------|-------|----------|
| `io` | 0-2 | 3 | Host ABI |
| `json` | 3-4 | 2 | Stdlib |
| `math` | 5-23 | 19 | Stdlib |
| `strings` | 24-48 | 25 | Stdlib |
| `arrays` | 49-71 | 23 | Stdlib |
| `convert` | 72-78 | 7 | Stdlib |
| `fs` | 79-90 | 12 | Host ABI |
| `http` | 91-97 | 7 | Host ABI |
| **Total** | **0-97** | **98** | |

> **Note**: idx 98-119 are reserved for `agent`/`workflow` (deferred, not in v1.1).

### 5.1 Compiler Intrinsics

The following builtins are typically inlined by the compiler as direct opcodes:

| Builtin | Inlined Opcode |
|---------|---------------|
| `io.println(x)` | `OP_PRINTLN` (24) |
| `io.print(x)` | `OP_PRINT` (23) |

They remain available as builtin functions (idx 0, 1) for indirect calls.

---

## 6. Module System

### 6.1 Import Syntax

```tll
from "./relative/path" import name
from "./module" import name1, name2
```

### 6.2 Export Syntax

```tll
fn myFunction() { return 42 }
export myFunction
```

### 6.3 Resolution Rules

1. Relative paths resolve from the importing file's directory
2. Package names resolve through `tll.toml` dependency resolution
3. Circular dependencies are supported (symbols resolved after full link)
4. Symbol identity is preserved across module boundaries

---

## 7. Self-Hosting Baseline

TLL v1.1 compiler self-hosts with deterministic builds:

| Metric | Value |
|--------|-------|
| Functions | 152 |
| Constants | 3867 |
| Instructions | 18463 |
| Globals | 330 |
| A==B==C | 9 dimensions, 0 diffs |

---

## 8. Specification Documents

This is the master index. Detailed specifications:

| Document | Content |
|----------|---------|
| `SYNTAX.md` | Complete grammar and syntax rules |
| `BYTECODE.md` | .tllbc file format specification |
| `OPCODES.md` | 46 opcode definitions (operands, semantics) |
| `VALUE_MODEL.md` | Runtime value representation and memory model |
| `CLOSURE.md` | Closure, upvalue, and environment semantics |
| `MODULE.md` | Module resolution and linking semantics |
| `PACKAGE.md` | Package manifest and dependency resolution |
| `HOST_ABI.md` | Host interface specification (io/fs/http/etc.) |
| `BUILTINS.md` | 98 builtin function specifications |

---

## 9. Conformance

A VM implementation is **TLL v1.1 Conformant** if it passes:

1. All 46 opcode semantics tests
2. All 98 builtin behavior tests
3. Full 32/32 language acceptance tests
4. Closure tests (A-H, 8 categories)
5. Exception tests (6 categories)
6. Module system tests
7. Package system tests
8. Self-hosting test (compiler.tllbc compiles itself)
9. Deterministic build test (A==B==C)

**Reference Implementation**: `semantic-vm/vm.tll` (pure TLL, executable specification)
