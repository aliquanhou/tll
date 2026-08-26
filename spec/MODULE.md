# TLL OS Module System Specification

**Version**: 1.1
**Status**: FROZEN

---

## 1. Overview

TLL has a file-based module system. Each `.tll` file is a module. Modules can import symbols from other modules and export their own symbols.

---

## 2. Import Syntax

```tll
from "./relative/path" import name
from "./module" import name1, name2
from "../lib/utils" import helper
```

### 2.1 Path Resolution

| Path Type | Resolution |
|-----------|-----------|
| `./foo` | Relative to current file's directory |
| `../foo` | Parent directory |
| `foo` | Package name (resolved through tll.toml) |
| `/abs/path` | Absolute path |

### 2.2 Import Semantics

1. Imports are resolved at compile time (linker phase)
2. Imported symbols are read-only references to the exporting module's globals
3. Circular imports are supported — all symbols are resolved after full linking
4. Importing a module that doesn't exist is a compile error

---

## 3. Export Syntax

```tll
fn myFunction() { return 42 }
let myVariable = "hello"

export myFunction
export myVariable
```

### 3.1 Export Semantics

1. Only top-level declarations can be exported
2. Exported symbols become global variables in the module's global scope
3. Exported functions are available as Function Values to importers
4. Re-export is not supported in v1.1

---

## 4. Linker

The linker resolves all imports and produces a single flat bytecode file.

### 4.1 Linking Process

1. Parse entry file and all transitively imported files
2. Assign unique internal names to all functions (including nested)
3. Build global symbol table across all modules
4. Resolve import references to global indices
5. Assign final fnIdx to all functions (stable order)
6. Emit combined bytecode with single function table

### 4.2 Function Naming

Nested functions get unique internal names:
- Format: `__mod_{moduleIndex}__{parentFn}__{nestedFn}`
- Example: `__mod_0__outer__inner`
- Runtime identity is `fnIdx`, not the name

### 4.3 Function Table Order

1. Top-level functions from all modules (in import order)
2. Nested functions (DFS order from each top-level function)
3. Order is deterministic for A==B==C verification

---

## 5. Global Variables

Each module's top-level `let` and `const` declarations become global variables.

- Globals are shared across all modules that import them
- Mutable globals (`let`) can be modified by any module
- Immutable globals (`const`) cannot be modified after initialization
- Global initialization order follows module dependency order

---

## 6. Package System Integration

Modules can be organized into packages. See PACKAGE.md.

- Package root contains `tll.toml` manifest
- Package imports use bare specifiers (e.g., `from "mylib" import foo`)
- Package resolution follows node_modules-style lookup

---

## 7. Main Entry

The entry file's `main()` function is the program entry point.

- `mainFunctionIndex` in bytecode points to the main function
- If no `main()` function exists, the program does nothing (no implicit top-level execution)
- `main()` must be a top-level function in the entry module
