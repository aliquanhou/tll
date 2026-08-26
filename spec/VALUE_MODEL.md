# TLL OS Value Model Specification

**Version**: 1.1
**Status**: FROZEN

---

## 1. Value Types

Every TLL value has a type tag and a payload.

| Type | Tag | Payload | Description |
|------|-----|---------|-------------|
| `null` | TLL_NULL | (none) | Null value |
| `int` | TLL_INT | int64 | 64-bit signed integer |
| `float` | TLL_FLOAT | double | 64-bit IEEE 754 |
| `bool` | TLL_BOOL | int (0/1) | Boolean |
| `string` | TLL_STRING | char* (UTF-8) | Heap-allocated string |
| `array` | TLL_ARRAY | TLLArray* | Dynamic array |
| `map` | TLL_MAP | TLLMap* | Hash map |
| `function` | TLL_FUNCTION | fnIdx + env* | User function / closure |
| `builtin` | TLL_BUILTIN | idx | Builtin function reference |
| `upvalue` | TLL_UPVALUE | UpvalueBox* | Upvalue box reference |

---

## 2. Numeric Types

### 2.1 Integer (int)

- 64-bit signed integer (int64_t in C, Number in JS)
- Literals: `42`, `-7`, `0xFF`, `0b1010`
- Arithmetic on ints produces ints (except division which may produce float)
- Overflow: wraps at int64 boundaries (implementation-defined behavior)

### 2.2 Float (float)

- 64-bit IEEE 754 double precision
- Literals: `3.14`, `1.0`, `1e10`
- Any operation involving a float produces a float

### 2.3 Type Coercion

| Operation | Rule |
|-----------|------|
| int + int | int |
| int + float | float |
| float + float | float |
| int / int | float (true division) |
| int % int | int |
| string + any | string concatenation |

---

## 3. String

- UTF-8 encoded, heap-allocated
- Immutable (operations create new strings)
- Length is byte count, not character count
- Indexing returns single-character strings

### String Operations

| Operation | Behavior |
|-----------|----------|
| `s[i]` | Character at index i (single-char string) |
| `s1 + s2` | Concatenation |
| `s.length` | Byte length (via strings.length builtin) |
| `s.substring(a, b)` | Substring from a to b |

---

## 4. Array

- Dynamic, zero-indexed array of TLL values
- Elements can be of mixed types
- Heap-allocated with capacity growth

### Array Structure

```
TLLArray {
  items: TLLValue*    // element storage
  length: int         // current element count
  capacity: int       // allocated capacity
}
```

### Array Operations

| Operation | Behavior |
|-----------|----------|
| `a[i]` | Get element at index i |
| `a[i] = v` | Set element at index i |
| `a.length` | Element count (via arrays.length) |
| `[1, 2, 3]` | Array literal |
| `arrays.push(a, v)` | Append element |
| `arrays.pop(a)` | Remove and return last |

---

## 5. Map

- Hash map with string keys
- Values can be of mixed types
- Heap-allocated

### Map Structure

```
TLLMap {
  entries: TLLMapEntry*  // hash table entries
  count: int             // entry count
  capacity: int          // bucket count
}
```

### Map Operations

| Operation | Behavior |
|-----------|----------|
| `m["key"]` | Get value for key |
| `m["key"] = v` | Set value for key |
| `{"a": 1, "b": 2}` | Map literal |
| `m.key` | Member access (equivalent to m["key"]) |

### Iteration Order

- Insertion order is preserved in the Semantic VM (JS object semantics)
- Native VM implementations should strive for insertion order but it is NOT guaranteed by spec
- Programs must not depend on map iteration order

---

## 6. Function Value

Functions are first-class values.

### Function Value Structure

```
FunctionValue {
  fnIdx: int              // index into function table
  env: ClosureEnv* | null // closure environment (null for top-level functions)
}
```

### Function Types

| Type | env | Description |
|------|-----|-------------|
| Top-level function | null | No captured variables |
| Closure | ClosureEnv* | Captures variables from enclosing scope |
| Builtin | (builtin idx) | Native/host function |

### Indirect Call Convention

CALL opcode with `func >= 100000` indicates indirect call:
- `func - 100000` = register number containing Function Value or Builtin Value
- VM dispatches by value type

---

## 7. Truthiness

| Value | Truthy? |
|-------|---------|
| `true` | Yes |
| `false` | No |
| `null` | No |
| `0` (int) | No |
| `0.0` (float) | No |
| `""` (empty string) | No |
| Non-zero number | Yes |
| Non-empty string | Yes |
| Any array | Yes (even empty) |
| Any map | Yes (even empty) |
| Any function | Yes |

---

## 8. Equality

### Reference Equality (==)

| Type | Comparison |
|------|-----------|
| int/float | Value comparison (int 1 == float 1.0 is true) |
| string | Content comparison |
| bool | Value comparison |
| null | null == null is true |
| array | Reference identity (two different arrays are never ==) |
| map | Reference identity |
| function | Reference identity |

### Deep Equality

Deep equality is NOT a language operator. Use `json.stringify(a) == json.stringify(b)` or custom comparison.

---

## 9. Memory Management

- All heap values (strings, arrays, maps, closures) are garbage collected
- Semantic VM uses host GC (JS garbage collector)
- Native VM implementations may use reference counting, mark-sweep, or other GC
- UpvalueBox uses explicit reference counting (see CLOSURE.md)
- Programs must not depend on GC timing or finalization order

---

## 10. Implementation Notes

### Semantic VM (vm.tll)

- Values are JS values (Number, String, Object, Array)
- Arrays and maps are JS objects
- Functions are JS objects `{__fn: true, fnIdx: N, env: ...}`
- GC is handled by JS runtime

### Native VM (tllvm, C)

- Values are `TLLValue` struct with type tag + union payload
- Arrays: `TLLArray` struct with items pointer
- Maps: hash table with linked-list buckets
- Functions: `TLL_FUNCTION` type with fnIdx and env pointer
- Memory: manual allocation with planned GC (currently leak-on-exit for bootstrap)
