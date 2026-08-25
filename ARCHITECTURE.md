# TLL OS Architecture

## High-Level Architecture

```
                 TLL OS
                   │
        ┌──────────┴──────────┐
        │                     │
   TLL Language          Agent Native
        │                     │
   ┌────┼────┐          ┌────┼────┐
 Compiler VM  Stdlib   Agent Tool Workflow
        │                     │
        └──────────┬──────────┘
                   │
              TLL Runtime
                   │
              Applications
```

## Layers

### 1. TLL Language Core (Frozen v1.1)

- **Compiler** (`compiler/`): lexer, parser, typechecker, codegen, linker — all pure TLL
- **Runtime** (`runtime/`): register-based bytecode VM — pure TLL
- **Package** (`package/`): tll.toml manifest and dependency resolution — pure TLL

### 2. Bootstrap Layer (`bootstrap/ts/`)

- TypeScript reference compiler and runtime
- Used only to: (a) first build TLL compiler bytecode, (b) load TLL VM bytecode, (c) reference for equivalence testing
- **Not** part of production execution chain

### 3. Tooling (`tools/`)

- `tll.js`: Official CLI (run, build, check, repl)
- `tll-repl.js`: Interactive REPL
- `gen_compiler_bc.tll`: Bootstrap compiler bytecode generator

### 4. Production Execution Chain

```
tll.js
  ├─ compileWithTLLCompiler()  →  TLL Compiler  →  user.tllbc
  └─ new Runtime(vm_run.tllbc)  →  TS Runtime loads TLL VM
       └─ TLL VM (lib/vm.tll)  →  executes user.tllbc
            └─ user program output
```

TS Runtime only loads `vm_run.tllbc` (the TLL VM itself). It does NOT execute user bytecode directly.

## Bootstrap Process

```
1. npm run build-bootstrap
   → tsc compiles bootstrap/ts/ → bootstrap/dist/

2. npm run gen-compiler-bc
   → TS compiler runs tools/gen_compiler_bc.tll
   → generates compiler_generated.tllbc (TLL compiler as bytecode)

3. First tll run
   → auto-builds runtime/vm_run.tllbc (TLL VM as bytecode)
   → TLL VM ready for production execution
```

## Self-Hosting (A==B==C)

```
Stage A: TS Compiler → compiles compiler.tll → bytecode A
Stage B: TLL VM executes bytecode A → compiles compiler.tll → bytecode B
Stage C: TLL VM executes bytecode B → compiles compiler.tll → bytecode C

Verify: A == B == C (9 dimensions, 0 diffs)
```

Current baseline: 152 functions, 3867 constants, 18463 instructions.

## Closure Model

```
outer frame
    │
    ├── local x
    │
    ▼
UpvalueBox { value: x }
    ▲
    │
closure.env.upvalues[0]  (shared by all sibling closures)
```

- **Shared box:** sibling closures reference the same UpvalueBox
- **Isolation:** each outer invocation creates new UpvalueBox instances
- **Flat closure:** deeply nested closures directly reference outer UpvalueBox, no chain
- **Escaping:** UpvalueBox survives frame destruction via closure.env reference

## Blood Relationship

TLL OS is derived from the TLL project:
- **Source:** https://github.com/aliquanhou/tll
- **Frozen baseline:** v1.1-language-core-freeze (commit 2cf1dbd)
- **Migration manifest:** `spec/MIGRATION.json`

TLL (private mother repo) retains full experiment history. TLL OS (public product repo) starts fresh with clean history.
