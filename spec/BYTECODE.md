# TLL OS Bytecode Format Specification

**Version**: 1.1
**Status**: FROZEN
**Format**: JSON

---

## 1. Overview

TLL bytecode is stored as a JSON file with `.tllbc` extension. The format is human-readable and portable across implementations.

---

## 2. File Structure

```json
{
  "functions": [...],
  "constants": [...],
  "mainFunctionIndex": 151,
  "globalCount": 330
}
```

### 2.1 Top-Level Fields

| Field | Type | Description |
|-------|------|-------------|
| `functions` | array | Function definitions (see section 3) |
| `constants` | array | Constant pool (see section 4) |
| `mainFunctionIndex` | int | Index of main() function in functions array |
| `globalCount` | int | Number of global variables |

---

## 3. Function Definition

```json
{
  "name": "main",
  "paramCount": 0,
  "localCount": 5,
  "instructions": [...]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Function name (for debugging, not used for dispatch) |
| `paramCount` | int | Number of parameters |
| `localCount` | int | Number of local variables (including parameters) |
| `instructions` | array | Instruction list (see section 5) |

### 3.1 Nested Functions

Nested functions are **flattened** into the top-level `functions` array. Each gets a unique `fnIdx`. The compiler assigns internal names like `__mod_0__outer__inner` for uniqueness, but runtime identity is `fnIdx`, not name.

---

## 4. Constant Pool

Constants are stored in a flat array. Index is used by LOAD_CONST opcode.

| Type | JSON Representation | Example |
|------|-------------------|---------|
| int | number | `42` |
| float | number | `3.14` |
| string | string | `"hello"` |
| bool | boolean | `true` |
| null | null | `null` |
| array | array | `[1, 2, 3]` |
| map | object | `{"key": "value"}` |

> Function values are NOT stored in the constant pool. They are created at runtime via LOAD_CONST for fnIdx + function value construction, or via CLOSURE opcode.

---

## 5. Instruction Format

Each instruction is a JSON object:

```json
{
  "op": 21,
  "operands": [0, 100003, 2]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `op` | int | Opcode number (0-45) |
| `operands` | array | Operand values (integers) |

### 5.1 Operand Encoding

All operands are integers. Special encodings:

| Operand | Encoding |
|---------|----------|
| Register index | 0-based integer |
| Constant index | 0-based index into constants array |
| Local variable index | 0-based index into function locals |
| Global index | 0-based index into globals |
| Jump target | Instruction offset (0-based) |
| Function index (direct) | 0-based index into functions array |
| Function index (indirect) | `registerNumber + 100000` |
| Builtin index | 0-based builtin number (0-97) |
| Upvalue slot | 0-based index into closureEnv.upvalues |

---

## 6. Example

### Source

```tll
fn add(a, b) {
    return a + b
}

fn main() {
    io.println(add(1, 2))
}
```

### Bytecode (simplified)

```json
{
  "functions": [
    {
      "name": "add",
      "paramCount": 2,
      "localCount": 2,
      "instructions": [
        {"op": 3, "operands": [2, 0, 1]},
        {"op": 22, "operands": [2]}
      ]
    },
    {
      "name": "main",
      "paramCount": 0,
      "localCount": 1,
      "instructions": [
        {"op": 0, "operands": [0, 0]},
        {"op": 34, "operands": [0]},
        {"op": 0, "operands": [0, 1]},
        {"op": 34, "operands": [0]},
        {"op": 21, "operands": [0, 0, 2]},
        {"op": 24, "operands": [0]},
        {"op": 32, "operands": []}
      ]
    }
  ],
  "constants": [1, 2],
  "mainFunctionIndex": 1,
  "globalCount": 0
}
```

---

## 7. Determinism Requirements

For A==B==C self-hosting verification, bytecode generation must be deterministic:

1. Function table order must be stable (top-level functions first, then nested in DFS order)
2. Constant pool deduplication must be deterministic
3. Instruction ordering must be deterministic
4. No timestamps, random values, or host-dependent data in bytecode

---

## 8. Versioning

The bytecode format does not currently include a version field. v1.1 bytecode is identified by:
- 46 opcodes (0-45)
- JSON format
- Function value with `fnIdx` and `env` fields

Future versions must add a `version` field.
