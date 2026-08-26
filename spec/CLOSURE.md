# TLL OS Closure Semantics Specification

**Version**: 1.1
**Status**: FROZEN

---

## 1. Overview

TLL supports full lexical closures with:
- First-class functions (functions as values)
- Higher-order functions (functions as parameters and return values)
- Nested functions (functions defined inside functions)
- Immutable capture (reading captured variables)
- Mutable capture (writing captured variables)
- Shared upvalue boxes (sibling closures share state)
- Closure isolation (different invocations have independent environments)
- Flat closures (nested closures directly reference outer upvalues)
- Escaping closures (closures survive after enclosing frame returns)

---

## 2. Function Value Representation

```
FunctionValue {
  fnIdx: int              // index into bytecode function table
  env: ClosureEnv | null  // null for top-level functions
}
```

- Top-level functions: `env = null`
- Nested functions with no capture: `env = null` (same as top-level)
- Closures: `env = ClosureEnv` with upvalue references

---

## 3. Closure Environment

```
ClosureEnv {
  upvalues: UpvalueBox[]  // array of upvalue box references
  length: int             // number of captured variables
}
```

### UpvalueBox

```
UpvalueBox {
  value: TLLValue   // the captured variable's current value
  refCount: int     // reference count for memory management
}
```

---

## 4. Capture Semantics

### 4.1 Immutable Capture (Read)

When a nested function reads a variable from an enclosing scope:

```tll
fn makeAdder(x) {
    fn add(y) { return x + y }  // x is captured (read-only in add)
    return add
}
```

1. Compiler identifies `x` as captured by `add`
2. At `makeAdder` entry: `x` is boxed into an UpvalueBox via BOX_LOCAL
3. `add`'s closure.env[0] references the same UpvalueBox
4. `add` reads `x` via GET_UPVALUE slot 0

### 4.2 Mutable Capture (Write)

When a nested function writes to a captured variable:

```tll
fn makeCounter() {
    let n = 0
    fn inc() {
        n = n + 1  // n is captured and mutated
        return n
    }
    return inc
}
```

1. `n` is boxed into UpvalueBox at `makeCounter` entry
2. `inc` reads `n` via GET_UPVALUE, writes via SET_UPVALUE
3. The UpvalueBox is shared, so mutations persist across calls

### 4.3 Shared UpvalueBox (Sibling Closures)

When multiple nested functions capture the same variable:

```tll
fn makePair() {
    let n = 0
    fn inc() { n = n + 1; return n }
    fn get() { return n }
    return [inc, get]
}
```

- `inc` and `get` **share the same UpvalueBox** for `n`
- `inc.env.upvalues[0] === get.env.upvalues[0]` (same reference)
- Mutations by `inc` are visible to `get`
- This is NOT value copying — it is reference sharing

### 4.4 Closure Isolation (Independent Invocations)

```tll
let c1 = makeCounter()
let c2 = makeCounter()
c1()  // 1
c1()  // 2
c2()  // 1  (independent from c1)
```

- Each invocation of `makeCounter` creates a **new UpvalueBox** for `n`
- `c1.env !== c2.env`
- `c1.env.upvalues[0] !== c2.env.upvalues[0]` (different boxes)
- Mutations in one closure do not affect the other

---

## 5. Flat Closure (Nested Closures)

TLL uses **flat closure** (also called "display" or "static link optimization"):

```tll
fn outer(x) {
    fn middle() {
        fn inner() {
            return x  // directly captures outer.x
        }
        return inner
    }
    return middle()
}
```

- `inner` directly references `outer.x`'s UpvalueBox
- `inner.env[0]` points to the same box as `outer`'s upvalue for `x`
- NOT: `inner.env -> middle.env -> outer.env` (chain)
- This is achieved by the compiler copying upvalue references through CLOSURE opcode operands

### CLOSURE Opcode Operand Layout

```
OP_CLOSURE resultReg, fnIdx, captureCount, upvalueSlot_0, upvalueSlot_1, ...
```

- `captureCount` = number of variables captured by this closure
- Each `upvalueSlot_i` = index into the **current frame's** closureEnv.upvalues
- The new closure copies references from current frame's upvalues

---

## 6. Escaping Closures

When a closure outlives its enclosing function's frame:

```tll
fn makeAdder(x) {
    fn add(y) { return x + y }
    return add  // add escapes makeAdder's frame
}

let add10 = makeAdder(10)  // makeAdder frame is destroyed
add10(5)                   // 15 — add10 still has access to x
```

**Lifecycle**:
1. `makeAdder(10)` creates frame with local `x = 10`
2. `x` is boxed into UpvalueBox (BOX_LOCAL)
3. `add` closure created with env referencing the box
4. `makeAdder` returns — frame is destroyed, but UpvalueBox survives (referenced by closure)
5. `add10(5)` executes — reads x from UpvalueBox via GET_UPVALUE
6. When `add10` is garbage collected, UpvalueBox refCount drops to 0 and is freed

---

## 7. Compiler Capture Analysis

The compiler performs static analysis to determine:

### 7.1 CapturedByNested

For each function, which of its local variables are referenced by nested functions.

```
For function F:
  For each nested function G:
    For each variable reference in G:
      If the variable is declared in F:
        Mark F's variable as "captured"
```

### 7.2 CapturedFromParent

For each function, which variables from enclosing scopes it references.

```
For function F:
  For each variable reference in F:
    Walk up the scope chain:
      If variable found in parent scope:
        Add to F's "captured from parent" list
        Record the upvalue slot index
```

### 7.3 BOX_LOCAL Insertion

Only variables marked as "captured" are boxed. Uncaptured locals remain on the stack (register allocation).

---

## 8. Opcodes

### OP_BOX_LOCAL (45)

**Operands**: `localSlot, upvalueSlot`

Creates UpvalueBox from a local variable, stores in current frame's closureEnv.

```
box = UpvalueBox { value: frame.locals[localSlot], refCount: 1 }
frame.locals[localSlot] = null  // move, not copy
frame.closureEnv.upvalues[upvalueSlot] = box
```

### OP_CLOSURE (42)

**Operands**: `resultReg, fnIdx, captureCount, [upvalueSlots...]`

Creates a closure with a new ClosureEnv, copying upvalue references.

```
newEnv = ClosureEnv { upvalues: [], length: captureCount }
for i in 0..captureCount:
  slot = operands[3 + i]
  newEnv.upvalues[i] = frame.closureEnv.upvalues[slot]  // copy reference
  newEnv.upvalues[i].refCount++
resultReg = FunctionValue { fnIdx, env: newEnv }
```

### OP_GET_UPVALUE (43)

**Operands**: `resultReg, slot`

```
resultReg = frame.closureEnv.upvalues[slot].value
```

### OP_SET_UPVALUE (44)

**Operands**: `slot, sourceReg`

```
frame.closureEnv.upvalues[slot].value = sourceReg
```

---

## 9. Frame Lifecycle with Closures

```
Function Entry:
  1. Create frame with locals, registers, arg stack
  2. If function has captured variables:
     a. Allocate closureEnv (empty upvalues array)
     b. Execute BOX_LOCAL for each captured parameter/local
  3. If function is a closure (called via Function Value):
     a. Set frame.closureEnv = the closure's env

Function Exit (RET):
  1. Pop return value
  2. Destroy frame (locals, registers freed)
  3. closureEnv is NOT destroyed if referenced by returned closure
  4. UpvalueBoxes survive as long as any closure references them
```

---

## 10. Acceptance Tests (A-H)

| # | Test | Validates |
|---|------|-----------|
| A | Function as value | `let f = add; f(1,2) == 3` |
| B | Function as parameter | `apply(add, 2, 3) == 5` |
| C | Function as return value | `makeAdder(10)(5) == 15` |
| D | Mutable closure | counter increments across calls |
| E | Shared box | inc/get share same UpvalueBox |
| F | Isolation | two counters independent |
| G | Nested closure | inner accesses outer variable (flat closure) |
| H | Escaping closure | closure works after outer frame destroyed |

All 8 tests must pass on every conforming VM implementation.
