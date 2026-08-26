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

---

## 11. Ownership Model (FROZEN at P0-1.10.4)

This section defines the single source of truth for value lifetime and ownership
across all VM implementations. Any VM (Semantic VM, Native VM, future VMs) must
conform to these rules.

### 11.1 Reference Counting

All heap-allocated values (strings, arrays, maps) use reference counting:

- On creation: `refCount = 1` (creator owns one reference)
- On assignment to a new owner: `refCount++`
- On release from an owner: `refCount--`; if `refCount == 0`, free the object
- Primitive values (int, float, bool, null) are value types — no refCount needed
- Function values carry a `TLLClosureEnv*` which is separately refCounted

### 11.2 Owner Locations

| Location | Owns values? | Lifetime |
|----------|-------------|----------|
| Constant pool | Yes (1 ref each) | Program lifetime |
| Registers | Yes (1 ref each) | Frame lifetime |
| Locals | Yes (1 ref each) | Frame lifetime |
| Globals | Yes (1 ref each) | VM lifetime |
| Arg stack | Yes (1 ref each) | Frame lifetime |
| Upvalue box | Yes (1 ref) | Box lifetime |
| Array items | Yes (1 ref each) | Array lifetime |
| Map entries | Yes (1 ref each) | Map entry lifetime |
| Closure env upvalues | Yes (1 ref each) | Closure env lifetime |

### 11.3 Operation Rules

#### LOAD_CONST (reg ← constant)
```
incref(constants[idx])
regs[dest] = constants[idx]   // shallow copy, reg now owns 1 ref
```

#### LOAD_VAR (reg ← local)
```
incref(locals[src])
regs[dest] = locals[src]      // shallow copy, reg now owns 1 ref
```

#### LOAD_GLOBAL (reg ← global)
```
incref(globals[src])
regs[dest] = globals[src]     // shallow copy, reg now owns 1 ref
```

#### STORE_VAR (local ← reg)
```
decref(locals[dest])          // release old value
incref(regs[src])             // reg still owns its ref; local gets new ref
locals[dest] = regs[src]      // shallow copy
```

#### STORE_GLOBAL (global ← reg)
```
decref(globals[dest])         // release old value
incref(regs[src])
globals[dest] = regs[src]
```

#### SET_UPVALUE (upvalue ← reg)
```
decref(upvalue->value)        // release old value
incref(regs[src])
upvalue->value = regs[src]
```

#### PUSH (arg stack ← reg)
```
incref(regs[src])
argStack[top++] = regs[src]
```

#### MAKE_ARRAY / MAKE_MAP
- Elements are popped from arg stack (ownership transfers from stack to container)
- Container takes 1 ref to each element
- No incref needed on elements (stack ref is transferred)

#### CALL (new frame ← arg stack)
- Arguments are popped from arg stack into new frame locals
- Ownership transfers from arg stack to new frame locals
- No incref needed

#### RETURN (parent reg ← return value)
```
incref(returnValue)           // transfer from child frame to parent
// child frame is then destroyed, decrefing its copy
parentRegs[dest] = returnValue
```

#### Frame Destruction
```
for each local: decref(local)
for each register: decref(register)
for each arg stack entry: decref(entry)
free frame
```

#### Closure Capture (BOX_LOCAL)
- Local value is moved into an UpvalueBox
- The box takes 1 ref; the local slot is cleared (no longer owns)
- Subsequent access to that local goes through the box

#### CLOSURE (create closure value)
- New ClosureEnv takes 1 ref to each captured upvalue
- UpvalueBox refCount incremented (now owned by both original frame and closure)

### 11.4 Invariants

1. Every heap object's `refCount` equals the number of active owner locations referencing it
2. `decref` to 0 always frees the object (no resurrection)
3. No heap object is ever freed while an active owner references it
4. Assignment always follows `decref(old); incref(new); store` pattern
5. Frame destruction decrefs ALL owned values (locals + registers + arg stack)
6. Return values are explicitly incref'd before frame destruction

### 11.5 Cycle Handling

Reference counting alone cannot collect cycles (e.g., map containing itself).
For v1.1:
- Cycles are rare in typical TLL programs
- Cycle collection is DEFERRED to a future GC phase
- The ownership model remains correct for acyclic graphs
- Native VM may leak cyclic structures (acceptable for bootstrap)

### 11.6 Compliance

A VM implementation conforms to this model if:
- ASAN reports 0 heap-use-after-free and 0 double-free
- All values are properly released on frame destruction
- No value is freed while another owner references it
- The constant pool retains ownership of its values for program lifetime
