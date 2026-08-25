# TLL Bootstrap Report
Generated: 2026-08-25

## Bootstrap Chain

```
Stage A: TypeScript Bootstrap Compiler
  ↓ compiles compiler.tll + lib/*.tll
  ↓
Bytecode A (compiler_generated.tllbc)
  144 functions, 2841 constants, 14022 instructions
  mainFunctionIndex: 143

Stage B: TLL VM executes Bytecode A
  ↓ runs compiler.tll (which compiles compiler.tll)
  ↓
Bytecode B (compiler_self_compiled.tllbc)
  144 functions, 2841 constants
  mainFunctionIndex: 143

Stage C: TLL VM executes Bytecode B
  ↓ runs compiler.tll (which compiles compiler.tll)
  ↓
Bytecode C (PENDING)
```

## A == B Verification

| Metric | A | B | Match |
|--------|---|---|-------|
| function count | 144 | 144 | ✅ |
| constant count | 2841 | 2841 | ✅ |
| mainFunctionIndex | 143 | 143 | ✅ |
| instruction count (per fn) | all match | all match | ✅ |
| constant content | all match | all match | ✅ |

## TLL VM Self-Host Performance

- Reference VM (TS Runtime) executing compiler: ~6.2 seconds
- TLL VM executing compiler bytecode: ~12-15 minutes (dual interpretation overhead)
- The TLL VM is itself a TLL program being interpreted by the TS Runtime, creating a double-interpretation bottleneck.

## Runtime Independence Analysis

### What TLL VM does NOT depend on from TypeScript Runtime:
- Language semantics (all opcodes implemented in vm.tll)
- Type checking (done at compile time by TLL compiler)
- Module resolution (done at compile time by TLL linker)
- Bytecode execution (fully implemented in vm.tll)
- Exception handling (TRY_START/TRY_END/THROW in vm.tll)
- Builtin semantics (9 inlined + rest via vm_callBuiltin)

### What TLL VM DOES depend on from host:
- File system (fs.readFile/writeFile/etc.) — host API
- HTTP (http.get/post/etc.) — host API via curl
- Process/stdout (io.println) — host API
- Math functions (math.sin/cos/etc.) — host API
- JSON (json.parse/stringify) — host API

### Conclusion:
TLL VM is **semantically independent** of TypeScript Runtime. The TS Runtime only serves as:
1. Bootstrap compiler (to generate initial bytecode)
2. Host platform (providing fs/http/io/math/json APIs)

A future native VM implementation could replace the host APIs without changing any TLL language semantics.

## Node.js Dependency Audit

| Component | Node.js Dependency | Type |
|-----------|-------------------|------|
| Bootstrap compiler (tll-compiler) | Yes (TypeScript) | Build-time |
| TLL compiler (compiler.tll) | No (pure TLL) | N/A |
| TLL VM (vm.tll) | No (pure TLL) | N/A |
| CLI (bin/tll.js) | Yes (Node.js) | Dev tool |
| fs builtin | Yes (host API) | Runtime platform |
| http builtin | Yes (curl via exec) | Runtime platform |
| io builtin | Yes (stdout/stdin) | Runtime platform |
| math/json/convert/strings/arrays | No (pure TLL or inline) | N/A |

## Determinism

- Same source → identical bytecode on all runs
- No timestamps, random numbers, or absolute paths in bytecode
- A==B verified with full content comparison
