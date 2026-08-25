# TLL v1.1 P0-1: First-Class Functions & Closures — Design Document

**Base commit:** 17d49b1
**Phase:** Design only (no code changes)
**Status:** Draft for audit

---

## 0. Current Architecture Audit

### 0.1 Function Call Mechanism (current)

| Call type | Bytecode | VM behavior |
|-----------|----------|-------------|
| Direct user fn | `OP_CALL [r, fnIdx, n]` | `vm_functions[fnIdx]`, save frame, execute |
| Builtin | `OP_LOAD_BUILTIN [r, idx]` + `OP_CALL [r, reg+100000, n]` | Reads `__builtin` object from register, dispatches |
| Indirect (user fn as value) | `OP_CALL [r, reg+100000, n]` | **BROKEN**: `actualFnIdx >= 100000` falls outside `vm_functions` range; call silently does nothing |

### 0.2 Frame Model (current)

- Frame state stored in **parallel arrays** (`vm_cs_pc`, `vm_cs_registers`, `vm_cs_locals`, etc.)
- `vm_saveFrame()` pushes current state; `vm_restoreFrame()` pops
- `RET` destroys frame immediately — no heap-allocated activation records
- Locals live in `vm_locals[]` (stack-allocated, index-based)
- No concept of environment or upvalues

### 0.3 Variable Storage (current)

| Scope | Storage | Access opcode |
|-------|---------|---------------|
| Local | `vm_locals[idx]` | `OP_LOAD_VAR` / `OP_STORE_VAR` |
| Global | `vm_globals[idx]` | `OP_LOAD_GLOBAL` / `OP_STORE_GLOBAL` |
| Register (temp) | `vm_registers[idx]` | direct operand |
| Constant | `vm_constants[idx]` | `OP_LOAD_CONST` |

### 0.4 Key Deficiency

There is **no representation for a user function as a runtime value**. Direct calls use integer function indices; indirect calls only recognize `__builtin` objects. Assigning `let f = add` currently loads... nothing meaningful (the identifier `add` resolves to no value since functions are not first-class).

---

## 1. Function Value Representation

### 1.1 Runtime Object Layout

A function value is a **heap-allocated map object** (consistent with how TLL already represents maps/objects):

```
{
  "__fn": true,          // type discriminator
  "fnIdx": <int>,        // index into vm_functions[]
  "env": <ClosureEnv|null>  // closure environment; null for top-level functions
}
```

### 1.2 Type System

- New type tag: `"function"` (returned by `convert.typeOf`)
- Function types in type annotations: `fn(a: int, b: int) -> int`
- For v1.1, type checker treats all functions as `fn` type (no full signature checking yet — incremental)

### 1.3 Creation

- Top-level functions: compiler pre-creates function value objects at module init, stored in globals
- Nested functions / closures: `OP_CLOSURE` creates a new function value object at runtime

---

## 2. Function as Variable

### 2.1 Global Functions

At module initialization, the compiler emits code to create function value objects for all top-level functions and stores them in global variables:

```
// Pseudo-bytecode for module init:
OP_CLOSURE [r0, fnIdx_add, 0]     // create fn value, env=null
OP_STORE_GLOBAL [globalIdx_add, r0]
```

Then `let f = add` compiles to `OP_LOAD_GLOBAL [r, globalIdx_add]` — loading the function value object.

### 2.2 Local Functions

Nested function definitions compile to `OP_CLOSURE` at the point of definition, storing the closure value in a local variable.

### 2.3 Storage Location

- Function values are **heap objects** (maps), passed by reference
- Variables store references to these objects
- No copying of function code or environment on assignment

---

## 3. Function as Parameter

### 3.1 Calling Convention

Functions are passed as **references** (the function value object). The existing `OP_PUSH` + `OP_CALL` mechanism works unchanged:

```
let f = add          // r = function value object
OP_PUSH [r]          // push f as first arg
OP_PUSH [r1]         // push 1
OP_PUSH [r2]         // push 2
OP_CALL [result, reg+100000, 3]  // indirect call
```

### 3.2 VM CALL Modification

`vm_executeCall` must recognize function value objects on indirect calls:

```
if isIndirect:
    possibleFn = vm_getReg(regNum)
    if possibleFn["__builtin"]:
        // existing builtin path
    else if possibleFn["__fn"]:
        actualFnIdx = possibleFn["fnIdx"]
        closureEnv = possibleFn["env"]
        // save frame WITH closureEnv
        // execute vm_functions[actualFnIdx]
    else:
        throw RuntimeError("not callable")
```

### 3.3 Value vs Reference Semantics

- **Reference semantics**: function values are references to heap objects
- Passing a function does not copy its environment
- Multiple variables can reference the same closure (shared mutable state — see §7)

---

## 4. Function as Return Value (Escape Analysis)

### 4.1 The Core Problem

When a nested function references variables from its enclosing scope, and that function is returned (or stored in a global/heap structure), the enclosing function's stack frame will be destroyed on `RET`. The captured variables must **escape** to the heap.

### 4.2 Compiler Escape Analysis

The compiler performs **conservative escape analysis**:

1. For each function, identify **free variables** (variables used but not defined in the function)
2. If a function is **ever** returned, stored in a global, or passed to an external function → all its captured variables escape
3. Escaped variables are **boxed** (allocated on the heap) at definition time
4. Non-escaped captured variables can remain on the stack (optimization, v1.1 may box everything for simplicity)

### 4.3 v1.1 Simplification

For v1.1, **box all captured variables unconditionally**. This avoids the need for precise escape analysis and is correct in all cases. Optimization (stack allocation for non-escaping captures) is deferred to v1.2.

---

## 5. Closure Environment Representation

### 5.1 Design Choice: Flat Closure (not chained)

We use **flat closures** (also known as "display" or "vector of upvalues"):

- Each closure environment is a **flat array** of upvalue slots
- The compiler determines, at compile time, exactly which variables each function captures
- The environment contains only those variables — no parent pointer, no chain walking
- Nested closures copy references to shared upvalue boxes into their own flat array

### 5.2 Environment Object Layout

```
ClosureEnv = {
  "__env": true,          // type discriminator
  "upvalues": [box0, box1, ...]  // array of upvalue boxes
}
```

### 5.3 Upvalue Box Layout

```
UpvalueBox = {
  "value": <any>   // the actual captured variable value
}
```

Boxing is required for **mutable capture** (see §7). The box is shared between the original scope and all closures that capture the variable.

### 5.4 Why Flat, Not Chained

| Aspect | Flat closure | Chained (parent pointer) |
|--------|-------------|------------------------|
| Access time | O(1) direct index | O(depth) chain walk |
| Memory | Duplicates shared refs | One copy, but indirection |
| Compiler complexity | Must compute capture sets | Simpler, but runtime cost |
| GC | Simple (no cycles) | Must trace parent chain |
| Determinism | Trivial | Order-dependent |

Flat closures align with TLL's emphasis on deterministic bytecode and simple VM.

---

## 6. Captured Variable Storage

### 6.1 Boxing at Definition

When a variable is captured by any nested function, the compiler boxes it:

```tll
// Source:
fn makeAdder(x) {
    fn add(y) { return x + y }   // x is captured
    return add
}

// Conceptual transformation:
fn makeAdder(x) {
    let x_box = { value: x }     // box the parameter
    fn add(y) { return x_box.value + y }
    return add
}
```

### 6.2 Allocation Location

- Upvalue boxes are **heap-allocated** (as map objects `{value: ...}`)
- They are created when the captured variable comes into scope (function entry for parameters, `let` statement for locals)
- They survive the function's stack frame destruction because they are referenced by the closure's environment

### 6.3 Non-Captured Variables

Variables not captured by any nested function remain as normal stack locals (`vm_locals[idx]`). No boxing overhead.

---

## 7. Mutable Capture (Shared Reference)

### 7.1 Semantics

TLL closures use **shared mutable capture** (like JavaScript, unlike Rust by-move or C++ by-value):

```tll
fn makeCounter() {
    let n = 0                    // boxed: n_box = {value: 0}
    fn inc() {
        n = n + 1                // n_box.value = n_box.value + 1
        return n                 // return n_box.value
    }
    return inc
}
let c1 = makeCounter()
let c2 = makeCounter()
c1()  // 1  (c1's n_box.value = 1)
c1()  // 2  (c1's n_box.value = 2)
c2()  // 1  (c2 has its own n_box)
```

### 7.2 Implementation via Shared Boxes

- The original scope and the closure share the **same UpvalueBox object**
- `OP_GET_UPVALUE` reads `box.value`
- `OP_SET_UPVALUE` writes `box.value`
- Multiple closures capturing the same variable share the same box → mutations are visible to all

### 7.3 Parameter Capture

Function parameters that are captured are also boxed. The parameter's initial value is copied into the box at function entry.

---

## 8. Nested Closures

### 8.3 Multi-Level Capture

```tll
fn outer(x) {
    fn middle(y) {
        fn inner(z) {
            return x + y + z    // captures x from outer, y from middle
        }
        return inner
    }
    return middle
}
```

### 8.2 Compilation Strategy

Each function's closure environment contains **only its directly captured variables**:

- `inner` captures: `x` (from outer), `y` (from middle) → 2 upvalues
- `middle` captures: `x` (from outer) → 1 upvalue (and defines `y` which is captured by inner)
- `outer` captures: nothing

When `middle` creates `inner`'s closure, it copies the upvalue box for `x` from its own environment into `inner`'s environment, and adds a new box for `y`.

### 8.3 Upvalue Index Mapping

The compiler assigns each captured variable an index in the flat upvalue array:

```
inner's env: [x_box (copied from middle's env[0]), y_box (new)]
              index 0                                    index 1
```

Access to `x` inside `inner` → `OP_GET_UPVALUE [r, envReg, 0]`
Access to `y` inside `inner` → `OP_GET_UPVALUE [r, envReg, 1]`

### 8.4 No Chain Walking

At runtime, `inner` does not need to traverse `middle`'s or `outer`'s frames. All captured variables are directly in its flat environment array. This is O(1) access.

---

## 9. VM ↔ TS Runtime Equivalence

### 9.1 Principle

Both runtimes implement **exactly the same closure model**:
- Same function value object layout (`__fn`, `fnIdx`, `env`)
- Same closure environment layout (`__env`, `upvalues`)
- Same upvalue box layout (`value`)
- Same opcodes with identical semantics

### 9.2 Implementation Parity

| Component | TLL VM (`vm.tll`) | TS Runtime (`runtime.ts`) |
|-----------|-------------------|--------------------------|
| Function value | map object `{__fn, fnIdx, env}` | JS object `{__fn, fnIdx, env}` |
| Closure env | map object `{__env, upvalues}` | JS object `{__env, upvalues}` |
| Upvalue box | map object `{value}` | JS object `{value}` |
| OP_CLOSURE | creates map objects | creates JS objects |
| OP_GET_UPVALUE | `env.upvalues[idx].value` | `env.upvalues[idx].value` |
| OP_SET_UPVALUE | `env.upvalues[idx].value = v` | `env.upvalues[idx].value = v` |
| OP_CALL (fn value) | extracts fnIdx + env, saves env in frame | identical |

### 9.3 Frame Extension

Both runtimes extend their frame state with a `closureEnv` field:

- TLL VM: add `vm_cs_closureEnv` parallel array, current `vm_closureEnv` global
- TS Runtime: add `closureEnv` to frame object

### 9.4 Equivalence Testing

New test suite `tests/runtime-equivalence/03_closures.js` will run all 6 acceptance tests (F1-F6) on both runtimes and compare stdout + exit status.

---

## 10. New Bytecode Opcodes

### 10.1 OP_CLOSURE (opcode 42)

**Purpose:** Create a function value object with a closure environment.

**Operands:** `[resultReg, fnIdx, upvalueCount]`

**Behavior:**
1. Create `ClosureEnv` object with `upvalues` array of size `upvalueCount`
2. Populate upvalues by copying from current frame's closure environment (for variables captured from enclosing scopes) or creating new boxes (for variables defined in current function)
3. Create function value object `{__fn: true, fnIdx: fnIdx, env: env}`
4. Store in `resultReg`

**Note:** The upvalue source indices are encoded in the function's metadata (a new `upvalueSources` field in the function object), telling the VM which current-frame upvalue to copy or which local to box.

### 10.2 OP_GET_UPVALUE (opcode 43)

**Purpose:** Read a captured variable.

**Operands:** `[resultReg, upvalueIdx]`

**Behavior:** `vm_registers[resultReg] = vm_closureEnv.upvalues[upvalueIdx].value`

### 10.3 OP_SET_UPVALUE (opcode 44)

**Purpose:** Write a captured variable.

**Operands:** `[upvalueIdx, valueReg]`

**Behavior:** `vm_closureEnv.upvalues[upvalueIdx].value = vm_registers[valueReg]`

### 10.4 OP_BOX_LOCAL (opcode 45)

**Purpose:** Box a local variable (create upvalue box and store reference).

**Operands:** `[localIdx, upvalueIdx]`

**Behavior:** Create `{value: vm_locals[localIdx]}`, store in `vm_closureEnv.upvalues[upvalueIdx]`. This is emitted at function entry for parameters and at `let` for captured locals.

### 10.5 Opcode Summary

| Opcode | Value | Purpose |
|--------|-------|---------|
| OP_CLOSURE | 42 | Create closure value + env |
| OP_GET_UPVALUE | 43 | Read captured variable |
| OP_SET_UPVALUE | 44 | Write captured variable |
| OP_BOX_LOCAL | 45 | Box local into upvalue slot |

Existing opcodes 0-41 unchanged. OP_CALL (21) is extended to recognize `__fn` objects.

---

## 11. GC / Lifecycle

### 11.1 Current Model

TLL currently has **no explicit GC**. Memory is managed by the host runtime (JavaScript's garbage collector in both TLL VM and TS Runtime). Heap objects (maps, arrays, function values, closure environments, upvalue boxes) are collected when no longer referenced.

### 11.2 Closure Impact

Closures create **reference cycles** in some patterns:

```tll
fn makeCycle() {
    let self = null
    fn f() { return self }   // captures self
    self = f                  // self now references f, f's env references self's box
    return f
}
```

The upvalue box for `self` references the function value `f`, and `f`'s environment references the box. This is a **reference cycle**.

### 11.3 Strategy

Since both runtimes run on JavaScript's garbage collector (mark-and-sweep), **reference cycles are handled automatically**. No explicit GC or reference counting is needed.

The TLL VM (`vm.tll`) itself runs on the TS Runtime, which runs on Node.js/V8. All heap objects are JS objects under the hood, collected by V8's GC.

### 11.4 Lifecycle Rules

- Upvalue boxes are created when a captured variable comes into scope
- They are referenced by: (a) the current frame's closure env, (b) any child closure's env
- When the function returns, the frame is destroyed, but child closures hold references to the boxes → they survive
- When all closures referencing a box are collected, the box is collected

---

## 12. Bootstrap Compiler Self-Hosting Compatibility

### 12.1 The Bootstrap Problem

The bootstrap compiler (`tll-compiler/src/`, TypeScript) compiles TLL source to bytecode. The self-hosted compiler (`tll-bootstrap/compiler.tll` + `lib/*.tll`) is itself TLL source that must compile to bytecode.

### 12.2 Impact on Bootstrap Compiler

The bootstrap compiler must be extended to:
1. Parse anonymous/nested function expressions (currently parser may reject them)
2. Perform capture analysis (find free variables per function)
3. Generate new opcodes (OP_CLOSURE, OP_GET_UPVALUE, OP_SET_UPVALUE, OP_BOX_LOCAL)
4. Emit function value objects for top-level functions at module init
5. Extend function metadata with `upvalueSources`

### 12.3 Impact on Self-Hosted Compiler

The self-hosted compiler (`codegen.tll`, `parser.tll`, etc.) must be similarly extended. Since it is written in TLL, it can **use closures itself** once the feature is implemented. However:

- **Phase 1**: Implement closures in bootstrap compiler + both runtimes
- **Phase 2**: Verify self-hosted compiler still compiles (it currently doesn't use closures, so no changes needed to its source)
- **Phase 3**: Verify A==B==C determinism (new opcodes must produce deterministic output)
- **Phase 4**: Optionally refactor self-hosted compiler to use closures (not required for v1.1)

### 12.4 Backward Compatibility

- Existing bytecode (without closures) continues to run unchanged
- New opcodes (42-45) are additive; old VM will simply not encounter them in old bytecode
- Function value objects are only created when source uses first-class functions
- The self-hosted compiler's own source does not use closures → its bytecode is unchanged → A==B==C remains valid

### 12.5 Determinism Guarantee

- OP_CLOSURE creates objects with deterministic field order
- Upvalue indices are assigned at compile time (deterministic)
- No timestamps, random numbers, or machine paths in closure creation
- Bytecode output is deterministic across machines

---

## 13. Acceptance Test Analysis (F1-F6)

### F1: Function as Value

```tll
fn add(a, b) { return a + b }
let f = add
let r = f(1, 2)  // r == 3
```

**Compilation:**
- `add` is a top-level function → module init creates `{__fn:true, fnIdx:0, env:null}`, stores in global
- `let f = add` → `OP_LOAD_GLOBAL [r_f, globalIdx_add]`
- `f(1, 2)` → indirect call: `OP_CALL [r_r, reg_f+100000, 2]`
- VM sees `__fn` object, extracts fnIdx=0, env=null, executes

### F2: Function as Parameter

```tll
fn apply(f, a, b) { return f(a, b) }
let r = apply(add, 1, 2)  // r == 3
```

**Compilation:**
- `add` function value pushed as arg
- `apply` receives `f` as local (reference to function value)
- `f(a, b)` → indirect call via local variable

### F3: Function as Return Value (Closure)

```tll
fn makeAdder(x) {
    fn add(y) { return x + y }
    return add
}
let add5 = makeAdder(5)
let r = add5(3)  // r == 8
```

**Compilation:**
- `x` is captured → boxed at `makeAdder` entry: `OP_BOX_LOCAL [paramIdx_x, upvalueIdx_0]`
- `fn add(y)` → `OP_CLOSURE [r_add, fnIdx_add, 1]` (1 upvalue: x)
  - VM creates env with upvalues[0] = current frame's upvalues[0] (the x box)
- `return add` → returns the closure value object
- `add5(3)` → indirect call, VM extracts fnIdx + env, sets frame's closureEnv
- `x + y` inside add → `OP_GET_UPVALUE [r_x, 0]` reads x_box.value (which is 5)

### F4: Mutable Capture (Counter)

```tll
fn makeCounter() {
    let n = 0
    fn inc() { n = n + 1; return n }
    return inc
}
```

**Compilation:**
- `n` is captured → `let n = 0` compiles to: store 0 in local, then `OP_BOX_LOCAL [localIdx_n, 0]`
- `n = n + 1` → `OP_GET_UPVALUE [r_n, 0]`, add 1, `OP_SET_UPVALUE [0, r_result]`
- Each `makeCounter()` call creates a new `n` box → independent counters

### F5: Multi-Level Nested Closure

```tll
fn outer(x) {
    fn middle(y) {
        fn inner(z) { return x + y + z }
        return inner
    }
    return middle
}
let r = outer(1)(2)(3)  // r == 6
```

**Compilation:**
- `outer`: x boxed (upvalue 0)
- `middle`: captures x (upvalue 0 from outer), defines y (upvalue 1 for inner)
  - `OP_CLOSURE` for middle: env=[x_box]
- `inner`: captures x (upvalue 0, copied from middle's env) and y (upvalue 1, new box)
  - `OP_CLOSURE` for inner: env=[x_box (copied), y_box (new)]
- `inner` accesses x via upvalue 0, y via upvalue 1 — both O(1)

### F6: Closure Escape (Multipliers)

```tll
fn makeMultiplier(factor) {
    fn multiply(x) { return x * factor }
    return multiply
}
let double = makeMultiplier(2)
let triple = makeMultiplier(3)
```

**Compilation:**
- Same as F3 pattern
- `double` and `triple` have independent env objects with independent factor boxes
- No shared state between them

---

## 14. Invariants (Must Not Break)

| Invariant | How preserved |
|-----------|---------------|
| 25/25 unified tests | New opcodes additive; existing tests don't use closures |
| 15/15 module tests | Same — no existing test uses first-class functions |
| VM == TS Runtime | Identical closure model implemented in both |
| A == B == C | Self-hosted compiler doesn't use closures → its bytecode unchanged |
| 3-platform CI | No platform-specific code; heap objects are JS objects in both runtimes |

---

## 15. Implementation Phases (for future reference, not executed now)

| Phase | Content | Estimated tests |
|-------|---------|-----------------|
| 1a | Bootstrap compiler: parse nested functions, capture analysis | parser tests |
| 1b | Bootstrap compiler: generate OP_CLOSURE/GET/SET/BOX | codegen tests |
| 2a | TS Runtime: implement 4 new opcodes + fn value CALL | F1-F6 on TS Runtime |
| 2b | TLL VM: implement 4 new opcodes + fn value CALL | F1-F6 on TLL VM |
| 3 | Runtime equivalence tests for closures | 03_closures.js |
| 4 | Self-host compiler rebuild + A==B==C verification | determinism |
| 5 | Update language spec, type checker | docs |

---

## 16. Open Questions for Audit

1. **Type checker**: Should v1.1 add function type signatures (`fn(int,int)->int`) or keep all functions as a single `fn` type? (Recommendation: single `fn` type for v1.1, signatures in v1.2)
2. **Recursive closures**: A closure that references itself (e.g., Y-combinator pattern) requires forward reference. Does v1.1 need this? (Recommendation: not required for v1.1)
3. **OP_BOX_LOCAL timing**: Box parameters at function entry, or lazily when first captured? (Recommendation: at entry, simpler and deterministic)
4. **Environment sharing**: Should `OP_CLOSURE` copy upvalue references, or share the entire env object? (Recommendation: copy references into new flat env — avoids accidental sharing between sibling closures)

---

**END OF DESIGN DOCUMENT**
