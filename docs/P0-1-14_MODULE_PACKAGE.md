# P0-1.14 Module / Package Conformance

**Status**: PASS
**Date**: 2026-08-26
**Baseline**: P0-1-13-CLOSURE-EXCEPTION-VALUE
**Code commits**: (circular), 1df17b0 (package)
**Tag**: P0-1-14-MODULE-PACKAGE

---

## Executive Summary

All P0-1.14 acceptance criteria pass. Two linker issues were found and fixed:
1. Circular dependencies were treated as fatal errors (spec violation)
2. Bare specifier package imports were silently skipped (missing feature)

Both fixed in compiler/linker.tll. No Native VM changes. No opcode changes.

---

## Acceptance Criteria

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Module import/export | ✅ PASS | cross-module test |
| 2 | Cross-module call | ✅ PASS | cross-module: addA(1,2)=3, multiplyB(3,4)=12 |
| 3 | Cross-module return value | ✅ PASS | int, map, array all verified |
| 4 | Cross-module map/array | ✅ PASS | getMapA()["value"]=42, getArrayA()[2]=3 |
| 5 | Cross-module closure | ✅ PASS | makeAdderA(5)(100)=105, useImportedClosureB()=15 |
| 6 | Package dependency | ✅ PASS | pkg-test: from "mypkg" import greet,add |
| 7 | Error handling | ✅ PASS | import nonexistent → ENOENT error |
| 8 | ASAN 0 errors | ✅ PASS | all 6 test suites |

---

## Findings & Fixes

### Finding 1: Circular dependency not supported

**Classification**: SPEC VIOLATION

**Spec**: MODULE.md §2.2: "Circular imports are supported — all symbols are resolved after full linking"

**Implementation**: linker load() set `circularDependencyError` and returned error on `isVisited()`.

**Fix**: load() returns silently on isVisited (module already in resolution queue). Removed circularDependencyError check in linkAndCompile(). Phase 2/3 resolves all symbols after all files are loaded.

**Test**: tests/module-system/circular/ — A imports B, B imports A. Both call each other's functions. Result: 42, 100, 100, 42.

### Finding 2: Bare specifier package imports not implemented

**Classification**: IMPLEMENTATION GAP

**Spec**: PACKAGE.md §3.1: node_modules-style lookup for bare specifiers

**Implementation**: linker load() only processed relative paths (./ ../). All bare specifiers were silently skipped with comment "Stdlib modules are built-in, skip".

**Fix**:
- Added `isStdlibModule()`: identifies io/math/strings/arrays/convert/fs/json/range
- Added `resolvePackagePath()`: walks up directory tree looking for node_modules/<pkg>/, reads tll.toml [package].main, falls back to index.tll/main.tll
- Modified load(): for non-relative, non-stdlib imports, calls resolvePackagePath()

**Test**: tests/module-system/pkg-test/ — node_modules/mypkg/ with tll.toml + index.tll. `from "mypkg" import greet, add`. Result: Hello, World! / 30.

---

## Cross-Module Test Results (comprehensive)

| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| Cross-module function call | 3, 12 | 3, 12 | ✅ |
| Cross-module int return | 7 | 7 | ✅ |
| Cross-module map return | moduleA, 42 | moduleA, 42 | ✅ |
| Cross-module array return | 1, 5 | 1, 5 | ✅ |
| Cross-module closure | 105, 15 | 105, 15 | ✅ |
| Cross-module mutable global | 1, 2 | 1, 2 | ✅ |
| B uses A's map | 42 | 42 | ✅ |
| B uses A's array | 3 | 3 | ✅ |

---

## Circular Dependency Test Results

| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| A.getAValue() | 42 | 42 | ✅ |
| B.getBValue() | 100 | 100 | ✅ |
| A.useB() (calls B) | 100 | 100 | ✅ |
| B.useA() (calls A) | 42 | 42 | ✅ |

---

## Package Test Results

| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| greet("World") | Hello, World! | Hello, World! | ✅ |
| add(10, 20) | 30 | 30 | ✅ |

---

## Error Handling

| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| import nonexistent module | Compile error (ENOENT) | ENOENT: no such file | ✅ |

---

## ASAN Verification

All tests with MSVC `/fsanitize=address`, `detect_leaks=0`:

| Test | Exit | ASAN Errors |
|------|------|-------------|
| cross-module/main.tllbc | 0 | 0 |
| circular/main.tllbc | 0 | 0 |
| pkg-test/main.tllbc | 0 | 0 |
| closure_exception_test.tllbc | 0 | 0 |
| builtin_test_1.tllbc | 0 | 0 |
| builtin_test_2.tllbc | 0 | 0 |

---

## Cross-Module Findings (Recorded, Not Fixed)

| # | Finding | Module |
|---|---------|--------|
| 1 | 61 pre-existing type errors in linker.tll (do not affect compilation) | Compiler |
| 2 | Package version constraints parsed but not enforced (per PACKAGE.md §5) | Package |
| 3 | Remote packages / registry not supported (per PACKAGE.md §5, planned) | Package |

---

## Conclusion

P0-1.14 Module/Package Conformance: **PASS**.

All module import/export, cross-module calls/returns/closures, package dependencies, circular dependencies, and error handling are conformant with spec/. Two linker issues found and fixed. ASAN clean.

**Next**: P0-1.15 Compiler full test suite, or as directed.
