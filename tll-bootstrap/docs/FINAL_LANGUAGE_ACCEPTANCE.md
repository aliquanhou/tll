# TLL Final Language Acceptance Report
Baseline: 03cf0d8 (v0.2.0-freeze)
Final HEAD: (see git log)
Generated: 2026-08-25

## Acceptance Matrix

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Lexer | PASS | 90+ tokens, all tested |
| 2 | Parser | PASS | 31 AST nodes, all parse correctly |
| 3 | AST | PASS | Full node coverage |
| 4 | Type System | PARTIAL | Basic types work, 59 warnings, no generics |
| 5 | Codegen | PASS | 23 nodes compiled, 40 opcodes |
| 6 | Linker | PASS | Module resolution, aliases, circular dep detection |
| 7 | Module System | PASS | import/export, 10/10 tests |
| 8 | Bytecode | PASS | JSON format, 144 fn / 2841 const for compiler |
| 9 | VM | PASS | 40/41 opcodes, 9/9 acceptance tests |
| 10 | Builtins | PASS | 8 modules, all real implementations |
| 11 | Exception | PASS | try/catch/finally/throw, finally+return fixed |
| 12 | Functions | PASS | Named functions, recursion, cross-module calls |
| 13 | Closure | NOT IMPLEMENTED | Parser rejects anonymous functions |
| 14 | Globals | PASS | Module-level globals, scope isolation |
| 15 | Standard Library | PASS | io/strings/arrays/convert/json/math/fs/http |
| 16 | CLI | PASS | run/build/check/version/help |
| 17 | Error Diagnostics | PARTIAL | Parse errors with line/col, type warnings |
| 18 | Test Framework | PARTIAL | acceptance + equivalence + exception + VM tests |
| 19 | Cross-platform | PARTIAL | Windows + Linux CI verified, macOS pending |
| 20 | Deterministic | PASS | A==B verified (fn/const/instr/content all match) |
| 21 | Self-host | PASS | TLL VM executes compiler bytecode to compile itself |
| 22 | Runtime Independence | PARTIAL | VM independent of TS Runtime, http/fs use Node host APIs |
| 23 | Package | PARTIAL | tll.toml parser, cross-module map return bug |
| 24 | Agent/Workflow | NOT PART OF v1.0 | Reserved keywords, stdlib modules only |

## P0 Gate Status

| Gate | Status |
|------|--------|
| VM / TS Runtime opcode equivalence | PASS (4/4 equivalence tests) |
| VM / TS Runtime builtin equivalence | PASS (comprehensive test covers all) |
| Exception semantic equivalence | PASS (6 exception tests, finally+return fixed) |
| TLL VM self-loading | PASS (TLL VM compiles compiler.tll) |
| compiler self-host | PASS (144 fn, 2841 const) |
| A == B == C | PENDING (A==B verified, C generating) |
| no placeholder builtin | PASS |
| no hidden TS semantic dependency | PARTIAL (http/fs depend on Node host APIs) |

## P1 Gate Status

| Gate | Status |
|------|--------|
| tll run | PASS |
| tll build | PASS |
| tll check | PASS |
| tll.toml | PARTIAL |
| dependency resolution | NOT IMPLEMENTED |
| Windows | PASS |
| Linux | PASS (CI) |
| macOS | NOT VERIFIED |

## Bugs Fixed This Sprint

1. **codegen: try body return skips finally** — Added try-finally context with forward-reference JMP patches. Returns inside try body now jump to finally block before returning.
2. **VM: nested function call arg stack corruption** — CALL now reads args from stack top (LIFO) instead of stack bottom (FIFO), preserving outer args for nested calls. Fixed cross-module nested calls returning NaN.

## Known Limitations (v1.0)

- First-class functions / closures / lambdas: NOT SUPPORTED (parser rejects)
- for loops: parser has AST node, codegen does not handle (use while)
- Generics: parsed but not type-checked
- Structs/enums/interfaces: NOT SUPPORTED
- Package registry / version resolution: NOT IMPLEMENTED
- REPL: NOT IMPLEMENTED
- Formatter: NOT IMPLEMENTED
- macOS: NOT VERIFIED
