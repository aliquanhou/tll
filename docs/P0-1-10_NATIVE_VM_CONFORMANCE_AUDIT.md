# P0-1.10 Native VM Conformance Audit

**Status**: Audit Only (no code modified)
**Date**: 2026-08-26
**Baseline**: commit 282b041 (P0-1.9.3 Language Specification)
**Spec Authority**: spec/ (single source of truth)

---

## 1. Executive Summary

Native tllvm (C) is **NOT conformant** with TLL v1.1 Language Specification.

| Category | Spec Requirement | Native VM | Status |
|----------|-----------------|-----------|--------|
| Opcodes | 46/46 | 45/46 | FAIL (missing MAKE_STRUCT) |
| Builtins | 98 defined | 91/98 | FAIL (missing http 91-97) |
| Closure Semantics | Full | Partial | FAIL (env loss on map-load) |
| Exception Semantics | try/catch/finally | try/catch only | FAIL (no finally) |
| Value Model | Complete | Mostly complete | WARN (map order, no GC) |
| Module/Linker | N/A (compiler) | N/A | N/A |
| Self-Hosting | compiler.tllbc runs | CRASH | FAIL (heap corruption) |
| Metacircular | vm_run -> vm.tll -> user | CRASH | FAIL |
| Full Test Suite | 32/32 | ~9 verified | FAIL |

**Overall**: Native tllvm = Experimental Bootstrap VM, NOT Production VM.

---

## 2. Opcode Conformance Matrix

Spec: spec/OPCODES.md (46 opcodes, 0-45)

| # | Opcode | Spec | Native VM | Status | Evidence |
|---|--------|------|-----------|--------|----------|
| 0 | LOAD_CONST | r, const_idx | implemented | PASS | vm.c:203 |
| 1 | LOAD_VAR | r, var_idx | implemented | PASS | vm.c:206 |
| 2 | STORE_VAR | var_idx, r | implemented | PASS | vm.c:209 |
| 3 | ADD | r1,r2,r3 | implemented (int/float/string) | PASS | vm.c:273 |
| 4 | SUB | r1,r2,r3 | implemented | PASS | vm.c:290 |
| 5 | MUL | r1,r2,r3 | implemented | PASS | vm.c:296 |
| 6 | DIV | r1,r2,r3 | implemented (float div) | PASS | vm.c:302 |
| 7 | MOD | r1,r2,r3 | implemented (int only) | WARN | vm.c:308 |
| 8 | POW | r1,r2,r3 | implemented | PASS | vm.c:311 |
| 9 | EQ | r1,r2,r3 | implemented | PASS | vm.c:317 |
| 10 | NEQ | r1,r2,r3 | implemented | PASS | vm.c:318 |
| 11 | LT | r1,r2,r3 | implemented (string+numeric) | PASS | vm.c:319 |
| 12 | GT | r1,r2,r3 | implemented | PASS | vm.c:329 |
| 13 | LE | r1,r2,r3 | implemented (numeric only) | WARN | vm.c:339 |
| 14 | GE | r1,r2,r3 | implemented (numeric only) | WARN | vm.c:345 |
| 15 | AND | r1,r2,r3 | implemented (NOT short-circuit) | FAIL | vm.c:351 |
| 16 | OR | r1,r2,r3 | implemented (NOT short-circuit) | FAIL | vm.c:352 |
| 17 | NOT | r1,r2 | implemented | PASS | vm.c:353 |
| 18 | NEG | r1,r2 | implemented | PASS | vm.c:354 |
| 19 | JMP | label | implemented | PASS | vm.c:357 |
| 20 | JMP_IF_FALSE | r,label | implemented | PASS | vm.c:358 |
| 21 | CALL | r,func,argc | implemented (direct+indirect) | PASS* | vm.c:361 |
| 22 | RET | r | implemented | PASS | vm.c:364 |
| 23 | PRINT | r | implemented | PASS | vm.c:374 |
| 24 | PRINTLN | r | implemented | PASS | vm.c:380 |
| 25 | MAKE_ARRAY | r,count | implemented | PASS | vm.c:386 |
| 26 | MAKE_MAP | r,count | implemented | PASS | vm.c:402 |
| 27 | MAKE_STRUCT | r,type,fields | NOT IMPLEMENTED | FAIL | no case |
| 28 | INDEX_GET | r1,r2,r3 | implemented (array+map) | PASS | vm.c:414 |
| 29 | INDEX_SET | r1,r2,r3 | implemented (array+map) | PASS | vm.c:428 |
| 30 | MEMBER_GET | r1,r2,name | implemented (BUG for fn/builtin) | FAIL | vm.c:440 |
| 31 | MEMBER_SET | r1,r2,name | implemented (map only) | PASS | vm.c:454 |
| 32 | HALT | (none) | implemented | PASS | vm.c:462 |
| 33 | NOP | (none) | implemented | PASS | vm.c:464 |
| 34 | PUSH | r | implemented | PASS | vm.c:466 |
| 35 | CONCAT | r1,r2,r3 | implemented | PASS | vm.c:469 |
| 36 | LOAD_BUILTIN | r,idx | implemented | PASS | vm.c:477 |
| 37 | THROW | r | implemented (no finally) | FAIL | vm.c:486 |
| 38 | TRY_START | catch_offset | implemented | PASS | vm.c:480 |
| 39 | TRY_END | (none) | implemented | PASS | vm.c:483 |
| 40 | LOAD_GLOBAL | r,idx | implemented | PASS | vm.c:213 |
| 41 | STORE_GLOBAL | idx,r | implemented | PASS | vm.c:216 |
| 42 | CLOSURE | r,fnIdx,captureCount,[slots] | implemented | PASS | vm.c:255 |
| 43 | GET_UPVALUE | r,slot | implemented | PASS | vm.c:240 |
| 44 | SET_UPVALUE | slot,r | implemented | PASS | vm.c:248 |
| 45 | BOX_LOCAL | localSlot,upvalueSlot | implemented | PASS | vm.c:220 |

**Opcode Summary**: 40 PASS, 1 WARN (MOD int-only), 2 WARN (LE/GE numeric-only), 5 FAIL

### Critical Opcode Bugs

**AND/OR not short-circuit (FAIL)**:
- Spec: `&&` and `||` must short-circuit (not evaluate right operand if left determines result)
- Native: `regs[a] = tll_bool(tll_truthy(regs[b]) && tll_truthy(regs[c]))` — both operands already evaluated
- Impact: side effects in right operand always execute, differing from spec

**MEMBER_GET on function/builtin crashes (FAIL)**:
- vm.c:447-448: `map_get((obj.type==TLL_MAP)?obj.as.map:NULL, propName)` — passes NULL when obj is function
- Impact: accessing `.length` or any property on a function value causes NULL dereference

**THROW does not execute finally (FAIL)**:
- throw_exception (vm.c:87-113) only searches for catch handlers
- No finally block execution during stack unwinding
- Spec requires finally to always execute

---

## 3. Closure Conformance Matrix

Spec: spec/CLOSURE.md

| Feature | Spec | Native VM | Status | Evidence |
|---------|------|-----------|--------|----------|
| Function Value | {fnIdx, env} | TLL_FUNCTION struct | PASS | tllvm.h:57 |
| Top-level fn env=null | env=NULL | create_frame with NULL | PASS | vm.c:169 |
| BOX_LOCAL | create UpvalueBox, move local | implemented | PASS | vm.c:220-238 |
| GET_UPVALUE | read box.value | implemented | PASS | vm.c:240-246 |
| SET_UPVALUE | write box.value | implemented | PASS | vm.c:248-253 |
| CLOSURE create env | copy upvalue refs, refCount++ | implemented | PASS | vm.c:255-271 |
| Shared UpvalueBox | sibling closures share box | PASS (by ref copy) | PASS | vm.c:264-266 |
| Closure Isolation | different invocations = different boxes | PASS (new box each call) | PASS | vm.c:233 |
| Flat Closure | nested directly refs outer | PASS (slot copy) | PASS | vm.c:263 |
| Escaping Closure | survives frame destruction | PASS (box refCount) | PASS* | refCount |
| **Map-load env loss** | env must persist in constants | **BUG: empty env created** | **FAIL** | vm.c:132-138 |

### Critical Closure Bug: Map-load env loss (FAIL)

When a Function Value is stored in the constant pool as a map `{"__fn":true, "fnIdx":N, "env":...}`, the indirect call handler (do_call, vm.c:127-140) converts it to TLL_FUNCTION but:

```c
TLLValue envVal = map_get(possibleFn.as.map, "env");
TLLClosureEnv *env = NULL;
if (envVal.type != TLL_NULL) {
    env = (TLLClosureEnv*)calloc(1, sizeof(TLLClosureEnv));  // EMPTY env!
    env->capacity = 1;
    env->upvalues = (TLLUpvalue**)calloc(1, sizeof(TLLUpvalue*));
}
```

**Problem**: Creates an empty ClosureEnv instead of deserializing the actual upvalues from the map. The env's upvalues array is empty, so GET_UPVALUE returns null.

**Impact**: Any closure loaded from constants (rather than created at runtime via OP_CLOSURE) loses its captured environment. This is the root cause of metacircular execution failure.

---

## 4. Builtin Conformance Matrix

Spec: spec/BUILTINS.md (98 defined, idx 0-97)

| Module | Idx Range | Count | Native VM | Status |
|--------|-----------|-------|-----------|--------|
| io | 0-2 | 3 | 3/3 | PASS |
| json | 3-4 | 2 | 2/2 | PASS |
| math | 5-23 | 19 | 19/19 | PASS |
| strings | 24-48 | 25 | 25/25 | PASS |
| arrays | 49-71 | 23 | 23/23 | PASS |
| convert | 72-78 | 7 | 7/7 | PASS |
| fs | 79-90 | 12 | 12/12 | PASS |
| http | 91-97 | 7 | 0/7 | FAIL |
| **Total** | **0-97** | **98** | **91/98** | **FAIL** |

**Missing**: http.get (91), http.post (92), http.request (93), http.serve (94), http.encodeURI (95), http.decodeURI (96), http.parseJSON (97)

Note: idx 98-119 are deferred (agent/workflow), not required for v1.1 conformance.

---

## 5. Value Model Conformance

Spec: spec/VALUE_MODEL.md

| Aspect | Spec | Native VM | Status |
|--------|------|-----------|--------|
| Type tags | 10 types | 10 types (NULL/BOOL/INT/FLOAT/STRING/ARRAY/MAP/FUNCTION/BUILTIN/UPVALUE) | PASS |
| int | 64-bit signed | long long | PASS |
| float | IEEE 754 double | double | PASS |
| string | UTF-8 | char* (UTF-8) | PASS |
| array | dynamic, zero-indexed | TLLArray with items/length/capacity | PASS |
| map | string keys, hash | TLLMap with linked-list buckets | PASS |
| Map iteration order | NOT guaranteed by spec | hash order (not insertion) | PASS (spec says not guaranteed) |
| Function Value | {fnIdx, env} | TLL_FUNCTION struct | PASS |
| Truthiness | 0/0.0/""/null/false = falsy | tll_truthy() implements | PASS |
| Equality | value for primitives, ref for composites | tll_equals() implements | PASS* |
| GC | required (any algorithm) | NONE (manual free, leak-on-exit) | FAIL |
| UpvalueBox refCount | required | implemented | PASS |

### Value Model Issues

**No Garbage Collection (FAIL)**:
- Native VM uses manual malloc/free with no tracing GC
- UpvalueBox has refCount, but arrays/maps/strings/functions are never freed during execution
- Long-running programs will leak memory
- Spec requires GC (algorithm unspecified)

**String equality may differ**:
- tll_equals for strings likely uses strcmp (content equality) — matches spec
- Need to verify int 1 == float 1.0 behavior

---

## 6. Exception Conformance

Spec: spec/SYNTAX.md (try/catch/finally/throw)

| Feature | Spec | Native VM | Status |
|---------|------|-----------|--------|
| throw | throw any value | implemented | PASS |
| try/catch | catch captures error | implemented | PASS |
| finally | always executes | NOT IMPLEMENTED | FAIL |
| Nested try | supported | supported (try stack) | PASS |
| Stack unwinding | search up call stack | implemented | PASS |
| Uncaught exception | fatal error | exit(1) with message | PASS |

**Missing finally**: throw_exception (vm.c:87-113) unwinds the call stack searching for catch handlers but never executes finally blocks. Spec requires finally to always execute, even on return or throw.

---

## 7. Test Coverage on Native VM

| Test Category | Total | Native Verified | Status |
|---------------|-------|-----------------|--------|
| hello | 1 | 1 | PASS |
| simple_fn | 1 | 1 | PASS |
| higher-order function | 1 | 1 | PASS |
| min_closure | 1 | 1 | PASS |
| mut_closure | 1 | 1 | PASS |
| closures (combined) | 1 | 1 | PASS |
| vm_run (empty target) | 1 | 1 | PASS |
| Full acceptance suite | 32+ | ~9 | FAIL |
| Closure A-H | 8 | ~4 | FAIL |
| Exception tests | 6+ | 0 | FAIL |
| Module tests | 5+ | 0 | FAIL |
| Package tests | 3+ | 0 | FAIL |

---

## 8. Self-Hosting & Metacircular

| Test | Spec Requirement | Native VM | Status |
|------|-----------------|-----------|--------|
| compiler.tllbc executes | Must run | CRASH (0xC0000374 heap corruption) | FAIL |
| compiler compiles hello | Must produce hello.tllbc | N/A (compiler crashes) | FAIL |
| A==B==C | 3 rounds identical | N/A | FAIL |
| vm_run -> vm.tll -> user | Metacircular execution | CRASH (with functions) | FAIL |
| vm_run -> vm.tll -> empty | Metacircular (no functions) | PASS | PASS |

**Root cause of metacircular failure**: The map-load env loss bug (section 3) means when vm.tll's runtime creates Function Values and stores them, then later calls them indirectly, the closure environment is lost. This causes crashes or incorrect behavior when executing any program with functions.

---

## 9. Summary of All Failures

### P0 (Blocks Production Use)

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 1 | Map-load closure env loss | vm.c:132-138 | All closures from constants lose env; metacircular execution impossible |
| 2 | compiler.tllbc heap corruption | vm.c (unknown) | Self-hosting impossible |
| 3 | No GC | global | Memory leaks in long-running programs |

### P1 (Correctness)

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 4 | AND/OR not short-circuit | vm.c:351-352 | Side effects differ from spec |
| 5 | MEMBER_GET crashes on fn/builtin | vm.c:447-448 | NULL dereference |
| 6 | No finally execution | vm.c:87-113 | Exception semantics incomplete |
| 7 | OP_MAKE_STRUCT missing | no case | Struct creation fails |

### P2 (Completeness)

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| 8 | http builtins missing (7) | builtin.c | Network programs fail |
| 9 | MOD int-only | vm.c:308 | Float modulo returns wrong result |
| 10 | LE/GE numeric-only | vm.c:339,345 | String comparison incomplete |
| 11 | Full test suite not verified | tests/ | Unknown regressions |

---

## 10. Conformance Verdict

**Native tllvm is NOT conformant with TLL v1.1 Specification.**

It is an **Experimental Bootstrap VM** capable of executing simple TLL programs (hello, basic functions, simple closures) but cannot:
- Execute the TLL compiler (self-hosting)
- Execute metacircularly (vm.tll interpreting user programs)
- Pass the full 32/32 acceptance suite
- Handle exceptions with finally
- Garbage collect memory

### Required for Conformance

Minimum fixes to achieve v1.1 conformance:
1. Fix map-load closure env deserialization (P0)
2. Fix compiler.tllbc heap corruption (P0)
3. Implement GC or document leak-on-exit as acceptable for bootstrap (P0)
4. Fix AND/OR short-circuit (P1)
5. Fix MEMBER_GET on function values (P1)
6. Implement finally execution (P1)
7. Implement OP_MAKE_STRUCT or remove from spec (P1)
8. Implement http builtins or mark as platform-optional (P2)
9. Run and pass full 32/32 test suite (P2)
10. Verify self-hosting A==B==C (P2)

---

## 11. Architecture Note

The Native VM's closure implementation (BOX_LOCAL/GET_UPVALUE/SET_UPVALUE/CLOSURE) is **architecturally correct** and matches spec/CLOSURE.md. The failures are implementation bugs, not design flaws.

The single biggest blocker is the **map-load env loss bug** — this prevents any closure that passes through the constant pool from working, which includes all functions in metacircular execution.

**No code was modified in this audit.** All findings are from static analysis of host/c/*.c.
