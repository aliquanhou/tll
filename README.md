# TLL Programming Language

> The Language for AI-Native Development

TLL is a modern, statically-typed programming language designed from first principles for AI-native development. Agents, tools, and workflows are first-class language constructs, not libraries.

## Status

**v1.0 Self-hosting Complete** 鈥?The TLL compiler is now fully written in TLL itself. TypeScript has been completely removed from the compiler toolchain. TLL compiles itself, and two consecutive bootstrap rounds produce byte-identical output.

| Metric | Value |
|--------|-------|
| Compiler functions | 126 |
| Constants | 2298 |
| Bootstrap rounds | 2 (identical) |
| Self-hosting | 鉁?Complete |

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

All components above are implemented in **pure TLL**. The TypeScript bootstrap compiler was used only to build the first TLL compiler and is no longer needed.

## Quick Start

```bash
# Run a TLL program
tll run hello.tll

# Build to bytecode
tll build hello.tll -o hello.tllbc

# Execute bytecode
tllvm hello.tllbc

# Type-check only
tll check hello.tll
```

## CLI Commands

```
tll run <file>       Compile and run
tll build <file>     Compile to bytecode
tll check <file>     Type-check only
tll lex <file>        Show token stream
tll parse <file>      Show AST
tll init <name>       Create new project with tll.toml
```

## Language Features

### Core
- Static typing with local type inference
- Register-based bytecode VM
- Module system with `import`/`export` (cross-module linking)
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
- **Agent** 鈥?declarative AI agents with system prompts and LLM API integration
- **Tool** 鈥?mark TLL functions as AI-callable tools; agents auto-invoke them in multi-turn loops
- **Workflow** 鈥?executable state machines with states, transitions, and history tracking
- **Memory** 鈥?persistent conversation memory (save/load/has/clear/list)

## Self-Hosting Verification

The compiler bootstraps cleanly across multiple rounds:

```
Round 0: TypeScript bootstrap compiler -> compiler.tll -> bytecode A
Round 1: TLL VM executes bytecode A -> compiles compiler.tll -> bytecode B
Round 2: TLL VM executes bytecode B -> compiles compiler.tll -> bytecode C
Result: B == C (126/126 functions, instruction-identical)
```

## Project Structure

```
tll-bootstrap/
鈹溾攢鈹€ compiler.tll          # Compiler entry point (pure TLL)
鈹溾攢鈹€ lib/
鈹?  鈹溾攢鈹€ lexer.tll         # Tokenizer
鈹?  鈹溾攢鈹€ parser.tll        # Recursive descent + Pratt parser
鈹?  鈹溾攢鈹€ typechecker.tll   # Type checker
鈹?  鈹溾攢鈹€ codegen.tll       # Bytecode generator
鈹?  鈹溾攢鈹€ vm.tll            # Register-based VM
鈹?  鈹斺攢鈹€ linker.tll        # Module linker (cross-module resolution)
鈹溾攢鈹€ examples/             # Example TLL programs
鈹溾攢鈹€ test_modules/         # Module system tests (T3.1-T3.5)
鈹斺攢鈹€ baseline/             # v1.0 self-hosting baseline snapshot
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
- [ ] P1-1: Renamed imports (`import { add as sum }`)
- [ ] P1-2: Circular dependency as hard error
- [ ] P2: VM performance optimization
- [ ] P2: Standard library expansion
- [ ] P2: Enhanced error messages

### Future
- [ ] TLL OS framework
- [ ] Commercial integration (payment/API/Web)

## License

MIT
