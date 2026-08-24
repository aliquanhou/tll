# A6-1: Runtime Equivalence Audit

**Date:** 2026-08-24
**Commit:** 95d5690
**Status:** Audit only — no code changes

---

## 1. Executive Summary

This audit compares the TypeScript Runtime (`tll-compiler/src/runtime.ts`, 455 lines) against the TLL VM (`tll-bootstrap/lib/vm.tll`, 458 lines) at the opcode level.

**Critical finding:** The TLL VM is **not equivalent** to the TypeScript Runtime. It cannot currently execute `compiler.tll` or any non-trivial TLL program. The three blocking gaps are:

1. **Builtin function coverage: 2/123+ implemented** — `vm_callBuiltin` only handles `io.println` (idx 0) and `io.print` (idx 1). All other builtins (json, math, strings, arrays, convert, fs, http, agent, workflow) return the first argument or undefined.
2. **Exception handling: stub only** — `TRY_START` and `TRY_END` are empty `return` statements. `THROW` halts the VM and prints an error, with no catch-block lookup.
3. **Indirect function calls: unsupported** — The `100000` register-offset convention used by the TypeScript Runtime for function-value calls is not implemented.

**Conclusion:** Integrating TLL VM as the default executor is not a "plug it in" task. It requires implementing ~120 builtin functions, full exception handling, and indirect call support before it can run `compiler.tll`.

---

## 2. Opcode Equivalence Matrix

### 2.1 Core Arithmetic & Logic (PASS)

| Opcode | TS Runtime | TLL VM | Result | Notes |
|--------|-----------|--------|--------|-------|
| LOAD_CONST (0) | `regs[a] = consts[b]` | `vm_setReg(a, constants[b])` | ✅ PASS | |
| LOAD_VAR (1) | `regs[a] = locals[b]` | `vm_setReg(a, locals[b])` | ✅ PASS | |
| STORE_VAR (2) | `locals[a] = regs[b]` | `vm_setLocal(a, regs[b])` | ✅ PASS | |
| ADD (3) | string-aware add | string-aware add | ✅ PASS | Both detect string operands |
| SUB (4) | `regs[b] - regs[c]` | same | ✅ PASS | |
| MUL (5) | `regs[b] * regs[c]` | same | ✅ PASS | |
| DIV (6) | `regs[b] / regs[c]` | same | ✅ PASS | |
| MOD (7) | `regs[b] % regs[c]` | same | ✅ PASS | |
| POW (8) | `Math.pow(regs[b], regs[c])` | `math.pow(regs[b], regs[c])` | ✅ PASS | |
| EQ (9) | `===` | `==` | ⚠️ MINOR | TS uses strict equality, TLL uses loose. Functionally equivalent for TLL value types. |
| NEQ (10) | `!==` | `!=` | ⚠️ MINOR | Same as above. |
| LT (11) | `<` | `<` | ✅ PASS | |
| GT (12) | `>` | `>` | ✅ PASS | |
| LE (13) | `<=` | `<=` | ✅ PASS | |
| GE (14) | `>=` | `>=` | ✅ PASS | |
| AND (15) | `&&` | `&&` | ✅ PASS | |
| OR (16) | `\|\|` | `\|\|` | ✅ PASS | |
| NOT (17) | `!` | `!` | ✅ PASS | |
| NEG (18) | `-` | `-` | ✅ PASS | |

### 2.2 Control Flow (PASS)

| Opcode | TS Runtime | TLL VM | Result | Notes |
|--------|-----------|--------|--------|-------|
| JMP (19) | `frame.pc = a` | `vm_pc = a` | ✅ PASS | |
| JMP_IF_FALSE (20) | `if (!regs[a]) pc = b` | same | ✅ PASS | |
| HALT (32) | `return 'HALT'` | `vm_halted = true; vm_result = lastReg` | ⚠️ DIFFER | TS returns undefined; TLL returns last expression result. |
| NOP (33) | no-op | `return` | ✅ PASS | |

### 2.3 Function Call & Return (PARTIAL)

| Opcode | TS Runtime | TLL VM | Result | Notes |
|--------|-----------|--------|--------|-------|
| CALL (21) direct | New frame, set params, push | `vm_saveFrame`, new regs/locals, set params | ✅ PASS | Direct function calls equivalent. |
| CALL (21) indirect (>=100000) | Load function from register, call with try/catch | **Not implemented** — only checks for `__builtin` map | ❌ FAIL | Function-value calls (closures, first-class functions) will not work. |
| CALL (21) builtin | `possibleFn(...args)` with try/catch | `vm_callBuiltin(builtin, args)` | ❌ FAIL | See §2.7 — only 2/123+ builtins implemented. |
| RET (22) | Pop frame, set caller reg | `vm_restoreFrame`, set caller reg | ✅ PASS | |

### 2.4 Data Structures (PASS with workarounds)

| Opcode | TS Runtime | TLL VM | Result | Notes |
|--------|-----------|--------|--------|-------|
| MAKE_ARRAY (25) | `elements.unshift(pop())` | Complex prepend via new list | ✅ PASS | Both produce correct order. TLL uses workaround for list index assignment. |
| MAKE_MAP (26) | Direct object creation, `map[k] = v` | **JSON serialize/deserialize** | ✅ PASS | Functionally equivalent. TLL uses JSON workaround because `map[k] = v` is unreliable. |
| INDEX_GET (28) | Array/object access | Array/object access | ✅ PASS | |
| INDEX_SET (29) | `obj[idx] = val` | `obj[idx] = val; vm_setReg(objReg, obj)` | ✅ PASS | Redundant setReg but correct. |
| MEMBER_GET (30) | length special-case, null/undefined check | length special-case, null check | ⚠️ MINOR | TLL doesn't check undefined separately, but `obj != null` covers both in practice. |
| MEMBER_SET (31) | `obj[prop] = val` | `obj[prop] = val; vm_setReg` | ✅ PASS | |

### 2.5 Stack & String (PASS)

| Opcode | TS Runtime | TLL VM | Result | Notes |
|--------|-----------|--------|--------|-------|
| PUSH (34) | `argStack.push(regs[a])` | `arrays.push(vm_argStack, regs[a])` | ✅ PASS | |
| CONCAT (35) | `String(b) + String(c)` | `convert.toString(b) + convert.toString(c)` | ✅ PASS | |

### 2.6 Global Variables (PASS)

| Opcode | TS Runtime | TLL VM | Result | Notes |
|--------|-----------|--------|--------|-------|
| LOAD_GLOBAL (40) | `regs[a] = globals[b]` | `vm_setReg(a, globals[b])` | ✅ PASS | |
| STORE_GLOBAL (41) | `globals[a] = regs[b]` | `vm_setGlobal(a, regs[b])` | ✅ PASS | |

### 2.7 Builtin Functions (❌ CRITICAL FAIL)

| Aspect | TS Runtime | TLL VM | Result |
|--------|-----------|--------|--------|
| LOAD_BUILTIN (36) | `regs[a] = builtinFunctions[b]` (direct function ref) | `regs[a] = { __builtin: true, idx: b }` (wrapper) | ⚠️ DIFFER | Different representation, but TLL CALL handles the wrapper. |
| Builtin count | 123+ functions (io, json, math, strings, arrays, convert, fs, http, agent, workflow) | **2 functions** (io.println idx 0, io.print idx 1) | ❌ FAIL | All other builtins return first arg or undefined. |
| io.println (0) | ✅ | ✅ | ✅ PASS | |
| io.print (1) | ✅ | ✅ | ✅ PASS | |
| json.parse/stringify (3-4) | ✅ | ❌ returns first arg | ❌ FAIL | |
| math.* (5-23) | ✅ | ❌ returns first arg | ❌ FAIL | |
| strings.* (24-48) | ✅ | ❌ returns first arg | ❌ FAIL | |
| arrays.* (49-70) | ✅ | ❌ returns first arg | ❌ FAIL | |
| convert.* (71-78) | ✅ | ❌ returns first arg | ❌ FAIL | |
| fs.* (79-90) | ✅ | ❌ returns first arg | ❌ FAIL | |
| http.* (91-98) | ✅ | ❌ returns first arg | ❌ FAIL | |
| agent.* (99+) | ✅ | ❌ returns first arg | ❌ FAIL | |
| workflow.* | ✅ | ❌ returns first arg | ❌ FAIL | |

**Impact:** `compiler.tll` uses `strings`, `arrays`, `convert`, `json`, and `fs` modules extensively. The TLL VM cannot run it without implementing these ~120 builtin functions.

### 2.8 Exception Handling (❌ CRITICAL FAIL)

| Opcode | TS Runtime | TLL VM | Result | Notes |
|--------|-----------|--------|--------|-------|
| TRY_START (38) | `tryStack.push(a)` (a = catch PC) | `return` (empty) | ❌ FAIL | No try stack management. |
| TRY_END (39) | `tryStack.pop()` | `return` (empty) | ❌ FAIL | No try stack management. |
| THROW (37) | `throwException(frame, errorValue)` — searches current frame tryStack, then walks up callStack, sets PC to catch, error to r0, or fatal RuntimeError | `vm_halted = true; io.println("Runtime error: " + value)` | ❌ FAIL | No catch lookup. Always halts. try/catch/finally will not work. |

**TS Runtime throwException algorithm:**
1. Search current frame's `tryStack` for catch PC → set PC, r0 = error, return
2. Walk up callStack, popping frames, checking each parent's `tryStack`
3. If no handler found → throw `RuntimeError('Uncaught exception: ...')`

**TLL VM:** None of this. Just halts.

**Impact:** Any TLL program using `try/catch` will not behave correctly under TLL VM. `compiler.tll` may or may not use try/catch — needs verification.

### 2.9 Missing Opcodes

| Opcode | TS Runtime | TLL VM | Result | Notes |
|--------|-----------|--------|--------|-------|
| PRINT | ✅ `process.stdout.write` | ❌ Not in if-chain | ❌ MISSING | May not be generated by codegen (io uses builtin call instead). |
| PRINTLN | ✅ `console.log` | ❌ Not in if-chain | ❌ MISSING | Same as above. |

**Note:** Codegen likely generates `LOAD_BUILTIN + CALL` for `io.println` rather than `PRINTLN` opcode. Need to verify codegen.tll doesn't emit PRINT/PRINTLN.

---

## 3. Runtime Infrastructure Comparison

| Feature | TS Runtime | TLL VM | Result |
|---------|-----------|--------|--------|
| Register count | 256 per frame | 256 per frame | ✅ PASS |
| Call frame structure | function, pc, registers, locals, argStack, tryStack, returnReg | pc, registers, locals, argStack, returnReg, fnIdx | ⚠️ MISSING tryStack | TLL frame has no tryStack (consistent with stub exception handling). |
| Global variables | Array of globalCount, initialized to undefined | Array of globalCount, initialized to null | ⚠️ DIFFER | undefined vs null, functionally similar. |
| Tool registry | `Map<string, number>` for tool fn | ❌ None | ❌ MISSING | `tool fn` registration not supported. |
| callUserFunction | Public method for stdlib callbacks | ❌ None | ❌ MISSING | Agent tool calling (AI auto-invoke TLL functions) will not work. |
| Safety counter | None (true infinite loop possible) | 100000 instruction limit | ⚠️ DIFFER | TLL VM will halt after 100k instructions. compiler.tll may exceed this. |
| HALT return value | undefined | Last expression result register | ⚠️ DIFFER | |
| Indirect call (>=100000) | Full support | ❌ Not supported | ❌ FAIL | |

---

## 4. Can TLL VM Run compiler.tll?

**Answer: No, not currently.** Three blocking gaps:

### Gap 1: Builtin Functions (~120 functions to implement)

`compiler.tll` and its imported modules use:
- `strings.*` (split, replace, contains, length, etc.) — essential for lexer/parser
- `arrays.*` (push, pop, get, length, etc.) — essential for all modules
- `convert.*` (toString, toInt, typeOf, etc.) — essential for codegen/VM
- `json.*` (parse, stringify) — used for bytecode output
- `fs.*` (readFile, writeFile, exists) — used for file I/O
- `io.*` (println, print) — used for output

**Estimated effort:** Each builtin is 1-10 lines of TLL. ~120 functions × ~5 lines = ~600 lines. Plus testing.

### Gap 2: Exception Handling

If `compiler.tll` uses `try/catch` anywhere, TLL VM will halt instead of catching. Need to:
1. Add `tryStack` to frame structure
2. Implement `TRY_START` (push catch PC)
3. Implement `TRY_END` (pop)
4. Implement `THROW` (search tryStack, walk callStack, set PC/r0)
5. Update `vm_saveFrame`/`vm_restoreFrame` to include tryStack

**Estimated effort:** ~50-100 lines of TLL.

### Gap 3: Indirect Function Calls

If `compiler.tll` uses first-class function values or closures, TLL VM will fail. Need to:
1. Detect `fnIdxOrReg >= 100000` in `vm_executeCall`
2. Load function from register `(fnIdxOrReg - 100000)`
3. Execute the function (same as direct call but using register-held function)

**Estimated effort:** ~20-30 lines of TLL.

### Additional Concerns

- **Safety counter (100000):** `compiler.tll` compilation likely executes millions of instructions. The 100k limit must be removed or raised significantly.
- **callUserFunction:** If `compiler.tll` or stdlib uses callbacks (e.g., `arrays.map`), this is needed.
- **PRINT/PRINTLN opcodes:** Verify codegen doesn't emit these.

---

## 5. Summary Table

| Category | PASS | FAIL | DIFFER | MISSING |
|----------|------|------|--------|---------|
| Core arithmetic & logic | 19 | 0 | 2 | 0 |
| Control flow | 3 | 0 | 1 | 0 |
| Function call/return | 2 | 2 | 0 | 0 |
| Data structures | 6 | 0 | 1 | 0 |
| Stack & string | 2 | 0 | 0 | 0 |
| Global variables | 2 | 0 | 0 | 0 |
| Builtin functions | 2 | ~120 | 1 | 0 |
| Exception handling | 0 | 3 | 0 | 0 |
| Missing opcodes | 0 | 0 | 0 | 2 |
| Runtime infrastructure | 2 | 3 | 3 | 0 |
| **Total** | **38** | **~128** | **10** | **2** |

**Equivalence: ~38/178 opcodes/aspects fully PASS (21%).** The remaining 79% are either failing, different, or missing.

---

## 6. Recommendations

### Immediate (before any VM integration)

1. **Do NOT integrate TLL VM as default executor.** It cannot run compiler.tll.
2. **Keep TypeScript Runtime as the sole execution engine.** It is complete and verified.
3. **Document the VM gap clearly** in README and docs — TLL VM exists as source but is not operational for real programs.

### Short-term (v1.2 — VM activation)

Implement in priority order:
1. **Remove safety counter** (or raise to 10M+) — blocks any real program
2. **Implement all builtin functions** in `vm_callBuiltin` (~120 functions, ~600 lines)
3. **Implement exception handling** (TRY_START/TRY_END/THROW with tryStack)
4. **Implement indirect function calls** (100000 offset)
5. **Implement callUserFunction** (if needed for stdlib callbacks)
6. **Verify PRINT/PRINTLN opcode usage** in codegen

### Verification criteria for VM activation

TLL VM can be considered equivalent to TypeScript Runtime when:
- ✅ All 10 module regression tests pass under TLL VM
- ✅ `compiler.tll` compiles and runs under TLL VM, producing identical bytecode to TS Runtime
- ✅ Self-hosting A/B/C verification passes under TLL VM (TLL VM executes bytecode A → B → C)
- ✅ Exception handling tests pass (try/catch/finally/throw)
- ✅ All builtin functions produce identical results to TS Runtime

---

## 7. Conclusion

The TLL VM (`vm.tll`) is a **partial prototype**, not an equivalent runtime. It correctly implements core arithmetic, control flow, direct function calls, and basic data structures — sufficient for simple "hello world" style programs. But it lacks:

- ~120 builtin functions (only io.println/io.print work)
- Exception handling (try/catch is stubbed)
- Indirect function calls
- Tool registry and callUserFunction
- PRINT/PRINTLN opcodes (may not be needed)

**The path from "VM source exists" to "VM is the default executor" requires ~700-800 lines of TLL implementation and comprehensive testing.** This is a v1.2 effort, not a quick integration.

**Current accurate status:**
- ✅ TLL Language: independent (lexer, parser, typechecker, codegen, linker, compiler, bytecode, module system)
- ✅ TLL Compiler: self-hosting (compiles itself, A==B==C deterministic)
- ❌ TLL Runtime: NOT independent (TypeScript Runtime is sole executor; TLL VM is prototype)
- ❌ TLL Platform: NOT independent (Node.js required for CLI and runtime host)

---

*Audit performed at commit 95d5690. Three-place SHA verified: Local=GitHub=Server=95d5690.*
