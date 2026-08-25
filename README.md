# TLL OS

> An AI-Native Programming Language and Runtime

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.1.0-green.svg)](https://github.com/aliquanhou/tllos)

TLL OS is a self-hosted programming language with a pure-TLL compiler, bytecode VM, and first-class support for functions, closures, modules, and packages. It is designed to be the foundation for AI-native application development.

**Licensed under the Apache License, Version 2.0.**

---

## Features

- **Self-hosting compiler** — The TLL compiler is written in TLL and compiles itself
- **Register-based bytecode VM** — 46 opcodes, including closure support (OP_CLOSURE, OP_GET_UPVALUE, OP_SET_UPVALUE, OP_BOX_LOCAL)
- **First-class functions and closures** — Function values, higher-order functions, nested functions, mutable capture, shared box, escaping closures
- **Module and package system** — `from "./path" import name`, `tll.toml` manifest
- **Runtime independence** — Production execution runs on TLL VM; TypeScript is bootstrap only
- **Deterministic builds** — A==B==C three-round self-host verification

---

## Quick Start

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
git clone https://github.com/aliquanhou/tllos.git
cd tllos
npm install
npm run build-bootstrap
```

### Hello World

```tll
// examples/hello.tll
fn main() {
    io.println("Hello, TLL OS!")
}
```

```bash
node tools/tll.js run examples/hello.tll
# Output: Hello, TLL OS!
```

### CLI Commands

| Command | Description |
|---------|-------------|
| `tll run <file>` | Compile and execute a TLL program |
| `tll build <file>` | Compile to bytecode (.tllbc) |
| `tll check <file>` | Parse and typecheck only |
| `tll repl` | Start interactive REPL |
| `tll version` | Print version |

---

## Project Structure

```
tllos/
├── compiler/          # TLL Compiler (pure TLL)
│   ├── compiler.tll   # Entry point
│   ├── lexer.tll
│   ├── parser.tll
│   ├── typechecker.tll
│   ├── codegen.tll
│   └── linker.tll
├── runtime/           # TLL Runtime (pure TLL)
│   ├── vm.tll         # TLL Virtual Machine
│   ├── vm_run.tll     # VM runner entry
│   └── vm_launcher.tll
├── package/           # Package system
│   └── package.tll
├── bootstrap/         # TS Reference Implementation
│   └── ts/            # Bootstrap Seed + Reference Compiler/Runtime
├── tools/             # Developer tooling
│   ├── tll.js         # Official CLI
│   └── tll-repl.js
├── tests/             # Test suite
├── examples/          # Example programs
├── language/          # Language specification
├── spec/              # Machine-readable specs
├── docs/              # Developer documentation
└── website/           # Project website
```

---

## Architecture

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

**Bootstrap chain:** TypeScript compiler builds TLL compiler bytecode → TLL VM executes → TLL compiler compiles itself.

**Production chain:** TLL Compiler → bytecode → TLL VM → execution.

---

## Development

### Build Bootstrap

```bash
npm run build-bootstrap    # Compile TS reference implementation
npm run gen-compiler-bc    # Generate TLL compiler bytecode
```

### Testing

```bash
npm test                   # Run full test suite (32/32)
npm run selfhost           # A==B==C self-host verification
```

### Verification

- **32/32 tests** — Language core, closures, modules, packages, exceptions
- **A==B==C** — Three-round deterministic self-host (152 functions, 3867 constants, 18463 instructions)
- **TS Runtime == TLL VM** — Same bytecode produces identical results

---

## Language Core (Frozen v1.1)

The following are frozen and must not change without a major version bump:

- Lexer, Parser, AST, Type System
- Function Value, Nested Function, Closure semantics
- Upvalue / Shared Box / Isolation (flat closure model)
- Module / Package / Linker
- Bytecode schema
- **Opcode contract 0-45** (especially 42-45: CLOSURE, GET_UPVALUE, SET_UPVALUE, BOX_LOCAL)
- TLL VM execution model
- Builtin/stdlib API
- CLI command interface

See [`docs/architecture/language-core-freeze.md`](docs/architecture/language-core-freeze.md) for full specification.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Code of Conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## License

[Apache License 2.0](LICENSE)
