# TLL v1.1 P0-1: First-Class Functions & Closures — Design Document

**Base commit:** 17d49b1
**Phase:** Design only (no code changes)
**Status:** Revised for audit (v2)

**Revision notes (v2):**
- §1.1: Explicitly distinguished three callable types: Builtin / User Function / Closure
- §4: Replaced "box all captures" with static capture analysis — only captured variables are boxed
- §5: Corrected closure environment semantics — sibling closures share the **same UpvalueBox** (not independent copies)
- §10: Fixed opcode operand encoding — `OP_CLOSURE` takes `[resultReg, fnIdx, captureCount, upvalueSlot...]`; all slot indices are 2-byte design contract
- §13: Expanded acceptance tests from F1-F6 to A-H (8 tests), adding sibling-closure-share (E) and invocation-isolation (F)
- §16: Resolved OP_BOX_LOCAL timing and environment sharing questions; 2 open questions remain

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

### 1.1 Three Kinds of Callable

TLL has exactly three callable runtime types, each with a distinct object layout:

| Type | Object Layout | env | Created by |
|------|--------------|-----|------------|
| **Builtin** | `{__builtin: true, idx: int}` | N/A | `OP_LOAD_BUILTIN` |
| **User Function** | `{__fn: true, fnIdx: int, env: null}` | `null` | Module init (top-level fns) |
| **Closure** | `{__fn: true, fnIdx: int, env: ClosureEnv}` | `ClosureEnv` object | `OP_CLOSURE` (nested fns) |

Builtin and User Function/Closure are distinguished by `__builtin` vs `__fn` discriminator. User Function and Closure share the `__fn` discriminator, distinguished by `env === null` vs `env` being an object.

All three are heap-allocated map objects (consistent with TLL's existing object representation).

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

### 4.2 Compiler Capture Analysis (Static)

The compiler performs **static capture analysis** at compile time:

1. For each function, scan its AST to identify **free variables** (variables used but not defined in the function)
2. A variable is **captured** if it is a free variable of any nested function
3. **Only captured variables are boxed** — non-captured locals remain stack-allocated in `vm_locals[]`
4. Captured parameters are boxed at function entry; captured locals are boxed at their `let` statement

This is precise, not conservative: if a variable is never referenced by a nested function, it stays on the stack with zero overhead.

### 4.3 Box Creation Timing

- **Captured parameters**: boxed at function entry (`OP_BOX_LOCAL` emitted in function prologue)
- **Captured `let` locals**: boxed immediately after initialization (`OP_BOX_LOCAL` after the initial value is computed and stored)
- **Non-captured variables**: no boxing, normal `vm_locals[]` access

---

## 5. Closure Environment Representation

### 5.1 Design Choice: Flat Closure with Shared UpvalueBoxes

We use **flat closures** (also known as "display" or "vector of upvalues"):

- Each closure environment is a **flat array** of upvalue slots
- The compiler determines, at compile time, exactly which variables each function captures
- The environment contains only those variables — no parent pointer, no chain walking
- **Sibling closures share the same UpvalueBox** for a given lexical binding: when `OP_CLOSURE` creates a child closure, it copies the **reference** to the parent's UpvalueBox into the child's flat array. Both closures hold a reference to the identical box object.

### 5.2 Shared Box Semantics (Critical)

```
Lexical Binding (variable x)
        │
        ▼
   UpvalueBox { value: ... }
   ┌───────┴───────┐
   │               │
   ▼               ▼
Closure A       Closure B
env[0] = box    env[0] = box  (same reference, not a copy)
```

- **Same invocation, sibling closures**: share one UpvalueBox → mutation in one closure is visible in the other
- **Different invocations**: each invocation creates new UpvalueBoxes → closures from different calls are fully isolated
- The box is created once per variable per function invocation, shared by all closures created during that invocation

### 5.3 Environment Object Layout

```
ClosureEnv = {
  "__env": true,          // type discriminator
  "upvalues": [box0, box1, ...]  // array of upvalue boxes
}
```

### 5.4 Upvalue Box Layout

```
UpvalueBox = {
  "value": <any>   // the actual captured variable value
}
```

Boxing is required for **mutable capture** (see §7). The box is shared between the original scope and all closures that capture the variable.

### 5.5 Why Flat, Not Chained

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

### 8.1 Multi-Level Capture

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

## 10. New Bytecode Opcodes (Fixed Encoding)

All opcodes use the existing TLL instruction format: `{op: int, operands: [int, ...]}`. Slot indices are logical integers (range 0–65535, "2 bytes" denotes the design contract).

### 10.1 OP_CLOSURE (opcode 42)

**Purpose:** Create a closure value object with a flat closure environment.

**Operands:** `[resultReg, fnIdx, captureCount, upvalueSlot_0, upvalueSlot_1, ...]`

- `resultReg`: register to store the created closure value
- `fnIdx`: index into `vm_functions[]` for the nested function
- `captureCount`: number of upvalue slots that follow
- `upvalueSlot_N`: index into the **current frame's** closure environment upvalues array; the VM copies that UpvalueBox reference into the new closure's environment

**Behavior:**
1. Create `ClosureEnv` object with `upvalues` array of size `captureCount`
2. For each `upvalueSlot_N`, copy the reference `currentFrame.closureEnv.upvalues[upvalueSlot_N]` into the new environment
3. Create function value object `{__fn: true, fnIdx: fnIdx, env: newEnv}`
4. Store in `resultReg`

**Note:** For variables defined in the current function (not captured from an enclosing scope), the box must have been created earlier by `OP_BOX_LOCAL` and stored in the current frame's closure env at the given slot.

### 10.2 OP_GET_UPVALUE (opcode 43)

**Purpose:** Read a captured variable from the current frame's closure environment.

**Operands:** `[resultReg, slot]`

- `resultReg`: register to store the read value
- `slot`: index into `currentFrame.closureEnv.upvalues`

**Behavior:** `vm_registers[resultReg] = vm_closureEnv.upvalues[slot].value`

### 10.3 OP_SET_UPVALUE (opcode 44)

**Purpose:** Write a captured variable in the current frame's closure environment.

**Operands:** `[slot, valueReg]`

- `slot`: index into `currentFrame.closureEnv.upvalues`
- `valueReg`: register holding the value to write

**Behavior:** `vm_closureEnv.upvalues[slot].value = vm_registers[valueReg]`

### 10.4 OP_BOX_LOCAL (opcode 45)

**Purpose:** Create an UpvalueBox for a captured local variable and store it in the current frame's closure environment.

**Operands:** `[localSlot, upvalueSlot]`

- `localSlot`: index into `vm_locals[]` (the variable's current stack value)
- `upvalueSlot`: index into `currentFrame.closureEnv.upvalues` to store the new box

**Behavior:** Create `{value: vm_locals[localSlot]}`, store reference in `vm_closureEnv.upvalues[upvalueSlot]`. Emitted at function entry for captured parameters, and immediately after initialization for captured `let` locals.

### 10.5 Opcode Summary (Fixed)

| Opcode | Value | Operands | Purpose |
|--------|-------|----------|---------|
| OP_CLOSURE | 42 | `resultReg, fnIdx, captureCount, [upvalueSlot...]` | Create closure value + env |
| OP_GET_UPVALUE | 43 | `resultReg, slot` | Read captured variable |
| OP_SET_UPVALUE | 44 | `slot, valueReg` | Write captured variable |
| OP_BOX_LOCAL | 45 | `localSlot, upvalueSlot` | Box captured local into upvalue slot |

Existing opcodes 0-41 unchanged. OP_CALL (21) is extended to recognize `__fn` objects (both User Function with env=null and Closure with env object).

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

## 13. Acceptance Tests (A–H, Fixed)

### A: Function as Value

```tll
fn add(a, b) { return a + b }
let f = add
let r = f(1, 2)  // r == 3
```

**Verifies:** Top-level function creates `{__fn, fnIdx, env:null}` at module init; indirect CALL recognizes `__fn` object.

### B: Function as Parameter

```tll
fn apply(f, a, b) { return f(a, b) }
let r = apply(add, 2, 3)  // r == 5
```

**Verifies:** Function value passed as argument; indirect CALL via local variable.

### C: Function as Return Value

```tll
fn makeAdder(x) {
    fn add(y) { return x + y }
    return add
}
let r = makeAdder(10)(5)  // r == 15
```

**Verifies:** `OP_BOX_LOCAL` for captured param `x`; `OP_CLOSURE` creates env with shared box; frame destroyed but box survives via closure reference.

### D: Mutable Closure (Counter)

```tll
fn makeCounter() {
    let n = 0
    fn inc() { n = n + 1; return n }
    return inc
}
let c = makeCounter()
c()  // 1
c()  // 2
```

**Verifies:** `OP_SET_UPVALUE` mutates shared box; repeated calls see accumulated value.

### E: Sibling Closures Share Box

```tll
fn makePair() {
    let n = 0
    fn inc() { n = n + 1 }
    fn get() { return n }
    return {inc: inc, get: get}
}
let p = makePair()
p.inc()
p.inc()
p.get()  // 2
```

**Verifies:** `inc` and `get` share the **same UpvalueBox** for `n`; mutation via `inc` is visible to `get`.

### F: Independent Invocations Are Isolated

```tll
let c1 = makeCounter()
let c2 = makeCounter()
c1()  // 1
c1()  // 2
c2()  // 1  (not 3 — independent box)
```

**Verifies:** Each `makeCounter()` invocation creates a new UpvalueBox; closures from different calls do not share state.

### G: Nested Closures (Multi-Level Capture)

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

**Verifies:** `inner`'s flat env contains upvalue refs for both `x` (copied from `middle`'s env) and `y` (new box); O(1) access, no chain walking.

### H: Closure Escape After Frame Destruction

```tll
fn makeMultiplier(factor) {
    fn multiply(x) { return x * factor }
    return multiply
}
let double = makeMultiplier(2)
let triple = makeMultiplier(3)
double(10)  // 20
triple(10)  // 30
```

**Verifies:** After `makeMultiplier` returns, its stack frame is destroyed; the `factor` UpvalueBox survives because `double`/`triple` hold references. Each closure has its own box (independent invocations).

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

### Resolved (from prior draft)

- ~~OP_BOX_LOCAL timing~~ → **Resolved**: box captured parameters at function entry, captured `let` at initialization. Non-captured locals stay on stack.
- ~~Environment sharing~~ → **Resolved**: sibling closures share the **same UpvalueBox** reference; each closure has its own flat env array but copied box references point to identical boxes. Different invocations create new boxes (isolation).

---

**END OF DESIGN DOCUMENT**
