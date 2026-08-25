# AGENT.md — Guide for AI Contributors

This file helps AI agents understand and contribute to TLL OS effectively.

## What is TLL OS?

TLL OS is a self-hosted programming language. The compiler, VM, and standard library are all written in TLL itself. TypeScript is used only as a bootstrap seed and reference implementation.

## Directory Layout

```
compiler/    — TLL compiler source (pure .tll)
runtime/     — TLL VM source (pure .tll)
package/     — Package manager (pure .tll)
bootstrap/ts/ — TypeScript reference implementation (bootstrap only)
tools/       — CLI and developer tools (JavaScript)
tests/       — Test suite
language/    — Human-readable language spec
spec/        — Machine-readable specs (JSON)
docs/        — Developer documentation
examples/    — Example programs
```

## How to Build

```bash
npm install
npm run build-bootstrap    # Compile TS reference
npm run gen-compiler-bc    # Generate TLL compiler bytecode
npm test                   # Run tests
npm run selfhost           # A==B==C verification
```

## How to Run

```bash
node tools/tll.js run examples/hello.tll
node tools/tll.js build file.tll
node tools/tll.js check file.tll
```

## FROZEN Items (Do NOT Modify)

These are frozen at v1.1. Changes require major version bump:

1. **Opcodes 0-45** — See `spec/OPCODES.json`
2. **Closure semantics** — UpvalueBox, shared box, flat closure, isolation
3. **Bytecode schema** — `{functions, constants, mainFunctionIndex, globalCount, schema}`
4. **Builtin indices** — See `spec/BUILTINS.json`
5. **CLI commands** — run, build, check, repl, version
6. **Module import syntax** — `from "./path" import name`

## Key Implementation Details

- **Closure opcodes:** OP_CLOSURE(42), OP_GET_UPVALUE(43), OP_SET_UPVALUE(44), OP_BOX_LOCAL(45)
- **Function value:** `{__fn: true, fnIdx: N, env: null|ClosureEnv}`
- **Indirect call:** OP_CALL with func >= 100000 means register-based indirect call
- **TLL arrays have no `set` function** — use direct index: `arr[idx] = val`
- **vm_run.tll** reads `vm_run_target.tllbc` from cwd and executes it via TLL VM
- **Production chain:** tll.js → TLL Compiler → user.tllbc → vm_run.tllbc → TLL VM → execution

## Testing Rules

- Every new feature needs tests
- Do not modify existing tests to make them pass
- Do not delete failing tests
- Test framework requires `expected.txt` or `test.json` with `checkSymbolIdentity`
- No string-based PASS markers (ALL PASS, TEST DONE, etc.)

## When Stuck

1. Check `spec/` for machine-readable specs
2. Check `docs/architecture/` for design docs
3. Look at existing tests in `tests/` for patterns
4. The TS reference in `bootstrap/ts/` is the ground truth for semantics
