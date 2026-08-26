# TLL OS Builtins Specification

**Version**: 1.1
**Status**: FROZEN
**Total**: 98 defined builtins (idx 0-97)

> idx 98-119 are reserved for agent/workflow (deferred, not in v1.1).

---

## io (Host ABI) — idx 0-2

| # | Name | Signature |
|---|------|-----------|
| 0 | `io.println` | `(value: any) -> null` |
| 1 | `io.print` | `(value: any) -> null` |
| 2 | `io.input` | `() -> string` |

## json (Stdlib) — idx 3-4

| # | Name | Signature |
|---|------|-----------|
| 3 | `json.parse` | `(s: string) -> any` |
| 4 | `json.stringify` | `(value: any) -> string` |

## math (Stdlib) — idx 5-23

| # | Name | Signature |
|---|------|-----------|
| 5 | `math.abs` | `(n: number) -> number` |
| 6 | `math.floor` | `(n: number) -> int` |
| 7 | `math.ceil` | `(n: number) -> int` |
| 8 | `math.round` | `(n: number) -> int` |
| 9 | `math.sqrt` | `(n: number) -> float` |
| 10 | `math.pow` | `(base: number, exp: number) -> number` |
| 11 | `math.min` | `(a: number, b: number) -> number` |
| 12 | `math.max` | `(a: number, b: number) -> number` |
| 13 | `math.sin` | `(n: float) -> float` |
| 14 | `math.cos` | `(n: float) -> float` |
| 15 | `math.tan` | `(n: float) -> float` |
| 16 | `math.log` | `(n: float) -> float` |
| 17 | `math.exp` | `(n: float) -> float` |
| 18 | `math.PI` | `() -> float` (constant) |
| 19 | `math.E` | `() -> float` (constant) |
| 20 | `math.random` | `() -> float` |
| 21 | `math.randomInt` | `(min: int, max: int) -> int` |
| 22 | `math.seedRandom` | `(seed: int) -> null` |
| 23 | `math.clamp` | `(n: number, min: number, max: number) -> number` |

## strings (Stdlib) — idx 24-48

| # | Name | Signature |
|---|------|-----------|
| 24 | `strings.length` | `(s: string) -> int` |
| 25 | `strings.charAt` | `(s: string, i: int) -> string` |
| 26 | `strings.substring` | `(s: string, start: int, end: int) -> string` |
| 27 | `strings.indexOf` | `(s: string, sub: string) -> int` |
| 28 | `strings.lastIndexOf` | `(s: string, sub: string) -> int` |
| 29 | `strings.includes` | `(s: string, sub: string) -> bool` |
| 30 | `strings.startsWith` | `(s: string, prefix: string) -> bool` |
| 31 | `strings.endsWith` | `(s: string, suffix: string) -> bool` |
| 32 | `strings.toUpperCase` | `(s: string) -> string` |
| 33 | `strings.toLowerCase` | `(s: string) -> string` |
| 34 | `strings.trim` | `(s: string) -> string` |
| 35 | `strings.trimStart` | `(s: string) -> string` |
| 36 | `strings.trimEnd` | `(s: string) -> string` |
| 37 | `strings.replace` | `(s: string, old: string, new: string) -> string` |
| 38 | `strings.replaceAll` | `(s: string, old: string, new: string) -> string` |
| 39 | `strings.split` | `(s: string, sep: string) -> array` |
| 40 | `strings.join` | `(arr: array, sep: string) -> string` |
| 41 | `strings.repeat` | `(s: string, n: int) -> string` |
| 42 | `strings.padStart` | `(s: string, len: int, pad: string) -> string` |
| 43 | `strings.padEnd` | `(s: string, len: int, pad: string) -> string` |
| 44 | `strings.reverse` | `(s: string) -> string` |
| 45 | `strings.slice` | `(s: string, start: int, end: int) -> string` |
| 46 | `strings.concat` | `(a: string, b: string) -> string` |
| 47 | `strings.escape` | `(s: string) -> string` |
| 48 | `strings.unescape` | `(s: string) -> string` |

## arrays (Stdlib) — idx 49-71

| # | Name | Signature |
|---|------|-----------|
| 49 | `arrays.length` | `(a: array) -> int` |
| 50 | `arrays.push` | `(a: array, v: any) -> int` |
| 51 | `arrays.pop` | `(a: array) -> any` |
| 52 | `arrays.shift` | `(a: array) -> any` |
| 53 | `arrays.unshift` | `(a: array, v: any) -> int` |
| 54 | `arrays.concat` | `(a: array, b: array) -> array` |
| 55 | `arrays.slice` | `(a: array, start: int, end: int) -> array` |
| 56 | `arrays.splice` | `(a: array, start: int, count: int) -> array` |
| 57 | `arrays.indexOf` | `(a: array, v: any) -> int` |
| 58 | `arrays.includes` | `(a: array, v: any) -> bool` |
| 59 | `arrays.reverse` | `(a: array) -> array` |
| 60 | `arrays.sort` | `(a: array, cmp: fn) -> array` |
| 61 | `arrays.map` | `(a: array, fn: fn) -> array` |
| 62 | `arrays.filter` | `(a: array, fn: fn) -> array` |
| 63 | `arrays.reduce` | `(a: array, fn: fn, init: any) -> any` |
| 64 | `arrays.forEach` | `(a: array, fn: fn) -> null` |
| 65 | `arrays.find` | `(a: array, fn: fn) -> any` |
| 66 | `arrays.findIndex` | `(a: array, fn: fn) -> int` |
| 67 | `arrays.some` | `(a: array, fn: fn) -> bool` |
| 68 | `arrays.every` | `(a: array, fn: fn) -> bool` |
| 69 | `arrays.flat` | `(a: array) -> array` |
| 70 | `arrays.fill` | `(a: array, v: any, start: int, end: int) -> array` |
| 71 | `arrays.copy` | `(a: array) -> array` |

## convert (Stdlib) — idx 72-78

| # | Name | Signature |
|---|------|-----------|
| 72 | `convert.toString` | `(v: any) -> string` |
| 73 | `convert.toInt` | `(v: any) -> int` |
| 74 | `convert.toFloat` | `(v: any) -> float` |
| 75 | `convert.toBool` | `(v: any) -> bool` |
| 76 | `convert.typeOf` | `(v: any) -> string` |
| 77 | `convert.parseInt` | `(s: string, radix: int) -> int` |
| 78 | `convert.parseFloat` | `(s: string) -> float` |

## fs (Host ABI) — idx 79-90

See HOST_ABI.md for details.

| # | Name |
|---|------|
| 79 | `fs.readFile` |
| 80 | `fs.writeFile` |
| 81 | `fs.appendFile` |
| 82 | `fs.exists` |
| 83 | `fs.isFile` |
| 84 | `fs.isDirectory` |
| 85 | `fs.mkdir` |
| 86 | `fs.readdir` |
| 87 | `fs.remove` |
| 88 | `fs.rename` |
| 89 | `fs.copy` |
| 90 | `fs.stat` |

## http (Host ABI) — idx 91-97

See HOST_ABI.md for details.

| # | Name |
|---|------|
| 91 | `http.get` |
| 92 | `http.post` |
| 93 | `http.request` |
| 94 | `http.serve` |
| 95 | `http.encodeURI` |
| 96 | `http.decodeURI` |
| 97 | `http.parseJSON` |

---

## Notes

1. All builtins are called via `OP_LOAD_BUILTIN` + `OP_CALL` (indirect call with fnIdx >= 100000)
2. `io.println` and `io.print` are compiler intrinsics, inlined as OP_PRINTLN/OP_PRINT when called directly
3. Stdlib builtins (json/math/strings/arrays/convert) are pure computation and could be reimplemented in TLL
4. Host ABI builtins (io/fs/http) require OS access and must be implemented by the VM host
