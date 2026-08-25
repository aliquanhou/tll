# Contributing to TLL OS

Thank you for your interest in contributing to TLL OS! This document outlines the process and guidelines for contributing.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/tllos.git`
3. Install dependencies: `npm install`
4. Build bootstrap: `npm run build-bootstrap`
5. Run tests: `npm test`

## Development Workflow

### Branching

- Create feature branches from `main`
- Use descriptive branch names: `feature/your-feature`, `fix/your-fix`

### Commit Messages

Use clear, descriptive commit messages:
```
<type>: <short description>

<optional longer description>
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`

### Testing

- All changes must include tests
- Run `npm test` before submitting
- Run `npm run selfhost` for compiler changes
- Do not modify existing tests to make them pass

### Code Style

- TLL files: follow existing style in `compiler/` and `runtime/`
- TypeScript files: follow existing style in `bootstrap/ts/`
- JavaScript files: 2-space indent, single quotes

## Frozen Items (Do Not Modify)

The following are frozen at v1.1 and require a major version bump to change:

- Opcode contract 0-45 (especially 42-45)
- Closure semantics (UpvalueBox, shared box, isolation)
- Bytecode schema
- Builtin function indices
- CLI command interface

See `docs/architecture/language-core-freeze.md` for details.

## Pull Request Process

1. Ensure all tests pass
2. Update documentation if needed
3. Create a Pull Request with a clear description
4. Link any related issues
5. Wait for review

## Reporting Issues

- Use GitHub Issues
- Include: TLL OS version, OS, Node.js version
- Include minimal reproduction steps
- For compiler bugs, include the source file and expected vs actual output

## Questions?

Open a discussion on GitHub or reach out via issues.
