# TLL Programming Language

> The Language for AI-Native Development

TLL is a modern, statically-typed programming language designed from first principles for AI-native development. Agents, intents, and tools are first-class language constructs, not libraries.

## Status

**v0.1 Bootstrap** — The compiler is currently implemented in TypeScript (bootstrap phase). The goal is self-hosting: eventually TLL will be compiled by TLL itself.

## Architecture

```
TLL Source (.tll)
    |
    v
Lexer -> Parser -> Type Checker -> Compiler -> TLL Bytecode
    |
    v
TLL Runtime (Register-based VM)
```

## Quick Start

```bash
cd tll-compiler
npm install
npx tsc
node dist/src/cli.js run examples/hello.tll
```

## CLI Commands

```
tll run <file>       Compile and run
tll build <file>     Compile to bytecode
tll check <file>     Type-check only
tll lex <file>       Show token stream
tll parse <file>     Show AST
```

## Language Features

- Static typing with local type inference
- Ownership-based memory model (no GC)
- Pattern matching with exhaustive checking
- Async/await with task spawning
- Agent system (AI-native)
- Entity/API/Application framework
- Module system with imports/exports

## Roadmap

- [x] Language Specification 0.1
- [x] Lexer (10/10 tests)
- [x] Parser (recursive descent + Pratt)
- [x] AST (30+ node types)
- [x] Type Checker
- [x] Bytecode Compiler
- [x] Runtime VM
- [x] CLI
- [ ] Standard library (io, math, strings, collections)
- [ ] Agent system runtime
- [ ] Self-hosting compiler (TLL written in TLL)
- [ ] TLL OS

## License

MIT
