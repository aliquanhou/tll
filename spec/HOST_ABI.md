# TLL OS Host ABI Specification

**Version**: 1.1
**Status**: FROZEN

---

## 1. Overview

The Host ABI defines the interface between TLL VM implementations and the underlying operating system. Host capabilities are exposed as builtin functions with specific index ranges.

> **Principle**: The Host ABI is NOT part of the TLL language semantics. It is the boundary between TLL and the OS. A conforming TLL implementation must provide these host capabilities, but the implementation is platform-specific.

---

## 2. Host vs Stdlib Classification

| Category | Index Range | Count | Type |
|----------|------------|-------|------|
| `io` | 0-2 | 3 | **Host ABI** |
| `json` | 3-4 | 2 | Stdlib (pure computation) |
| `math` | 5-23 | 19 | Stdlib (pure computation) |
| `strings` | 24-48 | 25 | Stdlib (pure computation) |
| `arrays` | 49-71 | 23 | Stdlib (pure computation) |
| `convert` | 72-78 | 7 | Stdlib (pure computation) |
| `fs` | 79-90 | 12 | **Host ABI** |
| `http` | 91-97 | 7 | **Host ABI** |
| `agent`/`workflow` | 98-119 | 22 | Deferred (not in v1.1) |

**Host ABI total**: 22 builtins (io: 3, fs: 12, http: 7)
**Stdlib total**: 76 builtins (pure computation, can be implemented in TLL)

---

## 3. io Module (Host ABI)

| Index | Name | Signature | Description |
|-------|------|-----------|-------------|
| 0 | `io.println` | `(value: any) -> null` | Print value + newline to stdout |
| 1 | `io.print` | `(value: any) -> null` | Print value to stdout (no newline) |
| 2 | `io.input` | `() -> string` | Read line from stdin |

**Compiler Intrinsic Note**: `io.println` and `io.print` are typically inlined by the compiler as OP_PRINTLN (24) and OP_PRINT (23) opcodes. They remain available as builtins for indirect calls.

---

## 4. fs Module (Host ABI)

| Index | Name | Signature | Description |
|-------|------|-----------|-------------|
| 79 | `fs.readFile` | `(path: string) -> string` | Read entire file as string |
| 80 | `fs.writeFile` | `(path: string, content: string) -> null` | Write string to file |
| 81 | `fs.appendFile` | `(path: string, content: string) -> null` | Append to file |
| 82 | `fs.exists` | `(path: string) -> bool` | Check if path exists |
| 83 | `fs.isFile` | `(path: string) -> bool` | Check if path is a file |
| 84 | `fs.isDirectory` | `(path: string) -> bool` | Check if path is a directory |
| 85 | `fs.mkdir` | `(path: string) -> null` | Create directory |
| 86 | `fs.readdir` | `(path: string) -> array` | List directory contents |
| 87 | `fs.remove` | `(path: string) -> null` | Delete file or empty directory |
| 88 | `fs.rename` | `(old: string, new: string) -> null` | Rename/move file |
| 89 | `fs.copy` | `(src: string, dst: string) -> null` | Copy file |
| 90 | `fs.stat` | `(path: string) -> map` | Get file stats (size, mtime, etc.) |

---

## 5. http Module (Host ABI)

| Index | Name | Signature | Description |
|-------|------|-----------|-------------|
| 91 | `http.get` | `(url: string) -> map` | HTTP GET request |
| 92 | `http.post` | `(url: string, body: string) -> map` | HTTP POST request |
| 93 | `http.request` | `(options: map) -> map` | Generic HTTP request |
| 94 | `http.serve` | `(port: int, handler: fn) -> null` | Start HTTP server |
| 95 | `http.encodeURI` | `(s: string) -> string` | URL encode |
| 96 | `http.decodeURI` | `(s: string) -> string` | URL decode |
| 97 | `http.parseJSON` | `(s: string) -> any` | Parse JSON (alias for json.parse) |

> **Note**: HTTP builtins require network access. Implementations on restricted platforms may return errors or throw exceptions.

---

## 6. Host ABI Requirements

A conforming TLL implementation must:

1. Provide all 22 Host ABI builtins (or throw "not implemented" for unavailable ones)
2. File paths use the host OS's native path format
3. stdin/stdout/stderr map to the process's standard streams
4. Network operations follow the host OS's network stack
5. Errors are thrown as TLL exceptions with descriptive messages

---

## 7. Implementation Freedom

Host ABI implementations are platform-specific. For example:

| Platform | io.println | fs.readFile | http.get |
|----------|-----------|-------------|----------|
| Node.js (Semantic VM) | console.log | fs.readFileSync | http.get |
| C (Native VM) | printf | fopen/fread | libcurl/sockets |
| WASM | JS bridge | WASI fs | WASI http |
| Rust | println! | std::fs::read | reqwest |

All must produce the same observable behavior from the TLL program's perspective.
