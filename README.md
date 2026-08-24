# TLL Programming Language

> The Language for AI-Native Development

TLL is a modern, statically-typed programming language designed from first principles for AI-native development. Agents, tools, and workflows are first-class language constructs, not libraries.

## Status

**v1.1 in progress** — The TLL compiler is fully self-hosted (written in pure TLL). The TypeScript bootstrap compiler is used only for the initial build and CI verification. Three consecutive self-hosting rounds produce byte-identical output.

| Metric | Value |
|--------|-------|
| Compiler functions | 143 |
| Constants | 2808 |
| Instructions | 13924 |
| Main function index | 142 |
| Self-hosting rounds | 3 (A == B == C) |
| Determinism dimensions | 9 (all 0 diffs) |
| Module regression tests | 10/10 |
| CI | GitHub Actions |

> Current verification snapshot. Actual build results are verified by CI on every push.

## Architecture

```
TLL Source (.tll)
    |
    v
Module Linker (cross-module resolution + dependency graph)
    |
    v
Lexer -> Parser -> Type Checker -> Codegen -> TLL Bytecode
    |
    v
TLL Runtime (Register-based VM)
```

All compiler components (lexer, parser, type checker, codegen, VM, module linker) are implemented in **pure TLL**. The TypeScript bootstrap compiler (`tll-compiler/`) provides the initial build environment and runtime for CI.

## Quick Start

```bash
# Clone
git clone https://github.com/aliquanhou/tll.git
cd tll

# Run full engineering validation (build + module tests + self-hosting L4/L5)
cd tll-bootstrap
npm test

# Run only module regression tests
npm run test:modules

# Run only self-hosting verification (L4 + L5 + determinism)
npm run test:selfhost
```

## CI / Engineering Validation

Every push to `main` and every pull request triggers GitHub Actions CI:

1. **Build**: TypeScript bootstrap compiler (`tsc`)
2. **Module Regression**: 10 tests covering import alias, circular dependency, same-name symbol isolation, path collision, symbol identity
3. **Self-Hosting L4**: Bootstrap compiler -> `compiler.tll` -> bytecode A -> TLL VM -> bytecode B
4. **Self-Hosting L5 Determinism**: bytecode B -> TLL VM -> bytecode C, strict three-way comparison A vs B, B vs C, A vs C (9 dimensions: function count, main index, constant count, function metadata, constant content, instruction count, instruction sequence, global count, schema keys — all 0 diffs)

## Language Features

### Core
- Static typing with local type inference
- Register-based bytecode VM
- Module system with `import`/`export` (cross-module linking, dependency graph)
- Package manifest (`tll.toml`)
- Error handling (`try`/`catch`/`finally`/`throw`)

### Standard Library (123+ functions, 10 modules)
| Module | Functions | Description |
|--------|-----------|-------------|
| `io` | 3 | println, print, readLine |
| `json` | 2 | parse, stringify |
| `math` | 19 | sqrt, abs, pow, pi, random, etc. |
| `strings` | 25 | split, replace, contains, case, etc. |
| `arrays` | 22 | map, filter, reduce, sort, get, etc. |
| `convert` | 8 | toInt, toFloat, toBool, typeOf, etc. |
| `fs` | 12 | readFile, writeFile, exists, mkdir, etc. |
| `http` | 8 | get, post, getText, postJson, etc. |
| `agent` | 7+ | AI agent runtime (LLM API, tools, memory) |
| `workflow` | 5+ | Executable state machines |

### AI Native (v0.4+)
- **Agent** — declarative AI agents with system prompts and LLM API integration
- **Tool** — mark TLL functions as AI-callable tools; agents auto-invoke them in multi-turn loops
- **Workflow** — executable state machines with states, transitions, and history tracking
- **Memory** — persistent conversation memory (save/load/has/clear/list)

## Self-Hosting Verification

The compiler bootstraps across three rounds with **full bytecode determinism** — all 9 dimensions are identical across A, B, and C:

```
Round A: TypeScript bootstrap compiler -> compiler.tll -> bytecode A
Round B: TLL VM executes bytecode A -> compiles compiler.tll -> bytecode B
Round C: TLL VM executes bytecode B -> compiles compiler.tll -> bytecode C
Result: A == B == C (0 diff across all 9 dimensions)
        143 functions, 2808 constants, 13924 instructions, main index 142
```

**Determinism dimensions (all verified 0 diff):**
1. Function count
2. Main function index
3. Constant count
4. Function metadata (name + param count + local count)
5. Constant content
6. Instruction count
7. Instruction sequence (opcode + operands)
8. Global count
9. Bytecode schema keys

## CI / Engineering Validation

Every push to `main` and every pull request triggers GitHub Actions CI (`.github/workflows/ci.yml`):

1. **Build**: TypeScript bootstrap compiler (`tsc`)
2. **Module Regression**: 10 tests (import alias, circular dependency, same-name symbol isolation, path collision, symbol identity)
3. **Self-Hosting L4**: Bootstrap -> bytecode A -> TLL VM -> bytecode B
4. **Self-Hosting L5**: bytecode B -> TLL VM -> bytecode C, three-way full determinism check (A vs B, B vs C, A vs C — 9 dimensions, all 0 diffs)

Run locally:
```bash
cd tll-bootstrap
npm test                # Full: build + module tests + self-host L4/L5
npm run test:modules    # Module regression only
npm run test:selfhost   # Self-hosting L4/L5 only
```

## Project Structure

```
tll/
├── tll-bootstrap/          # Self-hosted TLL compiler (pure TLL)
│   ├── compiler.tll        # Compiler entry point
│   ├── lib/
│   │   ├── lexer.tll       # Tokenizer
│   │   ├── parser.tll      # Recursive descent + Pratt parser
│   │   ├── typechecker.tll # Type checker
│   │   ├── codegen.tll     # Bytecode generator
│   │   ├── vm.tll          # Register-based VM
│   │   └── linker.tll      # Module linker (cross-module resolution)
│   ├── tests/
│   │   ├── run-tests.js    # Module regression test runner (10 tests)
│   │   ├── selfhost.js     # Self-hosting verification (L4 + L5 + determinism)
│   │   ├── regression/     # A1/A2/A3 regression tests
│   │   └── module-system/  # A4 path collision + symbol identity tests
│   ├── baseline/           # v1.0 self-hosting baseline snapshot
│   └── package.json        # npm test entry point
│
├── tll-compiler/           # TypeScript bootstrap compiler (build environment)
│   ├── src/
│   ├── tests/
│   └── package.json
│
├── .github/workflows/
│   ├── ci.yml              # Compiler CI (build + tests + selfhost)
│   └── deploy.yml          # Website deployment
│
├── docs/                   # Language specification and documentation
├── website/                # Official website (tll.knitoem.com)
└── tools/                  # Development tools
```

## Roadmap

### v1.0 (Completed)
- [x] Language Specification 1.0 (20 semantic rules)
- [x] Lexer (pure TLL, 8/8 tests)
- [x] Parser (recursive descent + Pratt, 10/10 tests)
- [x] AST (30+ node types)
- [x] Type Checker (13/13 tests)
- [x] Bytecode Codegen (10/10 tests)
- [x] Runtime VM
- [x] Module Linker (cross-module resolution, dependency graph)
- [x] Standard library (123+ functions, 10 modules)
- [x] AI Native (agent/tool/workflow/memory)
- [x] Error handling (try/catch/finally)
- [x] Package system (tll.toml)
- [x] **Self-hosting compiler (TLL written in TLL)**

### v1.1 (In Progress)
- [x] P0-1: Fix CALL instruction direct/indirect disambiguation
- [x] P0-2: `export const` support (cross-module constants)
- [x] P1-1: Renamed imports (`import { add as sum }`)
- [x] P1-2: Circular dependency as hard error
- [x] A1: Import alias AST-level symbol binding (fix lexical replacement)
- [x] A2: Circular dependency error propagation
- [x] A3: Module symbol conflict resolution (namespaced internal symbols)
- [x] A4: Module system semantic regression audit + test hardening (10 tests, AST coverage 0 missing)
- [x] A5: Engineering CI + portable verification (GitHub Actions, npm test, clean-room)
- [x] A5.1: Self-host determinism closure — fix strip-export string replacement corrupting string literals in linker itself (root cause: `strings.replaceAll(source, "export fn ", "fn ")` corrupted the `"export fn "` literal inside `stripExports`). Result: full function-name + constant determinism, 0 metadata diffs
- [x] A5.2: Verification closure — three-way full determinism (A vs B, B vs C, A vs C), 9 comparison dimensions, function metadata checks, no false-pass paths
- [ ] P2: VM performance optimization
- [ ] P2: Standard library expansion
- [ ] P2: Enhanced error messages

### Future
- [ ] TLL OS framework
- [ ] LSP / debugger
- [ ] Package registry
- [ ] Commercial integration (payment/API/Web)

## License

MIT
