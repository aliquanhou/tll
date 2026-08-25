# TLL Programming Language Specification v1.0

## 1. Overview
TLL is a statically-typed, compiled programming language that runs on the TLL Virtual Machine.
TLL v1.0 is self-hosting: the TLL compiler is written in TLL and compiles itself.

## 2. Types
### 2.1 Primitive Types
- `int` — 64-bit integer
- `float` — 64-bit floating point
- `string` — UTF-8 string
- `bool` — boolean (true/false)
- `null` — null value
- `void` — no return value

### 2.2 Composite Types
- `array` — ordered collection (dynamic size)
- `map` — key-value collection (string keys)

### 2.3 Type Annotations
Type annotations are optional and use the `: type` syntax:
```
fn add(a: int, b: int) -> int {
    return a + b
}
let x: int = 42
```

### 2.4 NOT SUPPORTED in v1.0
- Generics (List<T>, Map<K,V> are parsed but treated as raw List/Map)
- Union types
- Interfaces / traits
- Structs / classes
- Enums
- Function types as first-class values

## 3. Variables
```
let x = 42           // inferred type
let y: int = 100     // explicit type
const PI = 3.14      // constant
x = 10               // assignment
```

### 3.1 Scope
- Block-level scoping
- Variables shadow outer scope
- Global variables are module-level

## 4. Functions
```
fn name(param1: type, param2: type) -> returnType {
    // body
    return value
}
```

### 4.1 Function Calls
```
let result = add(3, 4)
```

### 4.2 Recursion
Functions can call themselves recursively.

### 4.3 NOT SUPPORTED in v1.0
- Anonymous functions / lambda expressions
- First-class functions (functions cannot be assigned to variables)
- Higher-order functions (functions cannot be passed as arguments)
- Closures (no lexical variable capture)
- Default parameters
- Variadic parameters

**Rationale**: These features require VM support for function values and upvalue capture.
They are planned for v1.1.

## 5. Control Flow
### 5.1 If/Else
```
if condition {
    // then
} else {
    // else
}
```

### 5.2 While
```
while condition {
    // body
}
```

### 5.3 For-in
```
for variable in iterable {
    // body
}
```
Iterates over array elements. `iterable` must be an array (use `arrays.range(start, end)` for numeric ranges).
Supports `break` and `continue`.

### 5.4 Break / Continue
Supported inside `while` and `for` loops.

### 5.5 Return
Returns from current function. `return` without value returns null.

## 6. Operators
### 6.1 Arithmetic
`+` `-` `*` `/` `%` `**` (power) `-` (unary negation)

### 6.2 Comparison
`==` `!=` `<` `>` `<=` `>=`

### 6.3 Logical
`&&` `||` `!`

### 6.4 Assignment
`=` `+=` `-=` `*=` `/=` `%=`

### 6.5 Null Coalescing
`??` — reserved keyword, not implemented in v1.0

### 6.6 String Concatenation
`+` operator concatenates strings.

### 6.7 Reserved Operators (not implemented)
- `|>` (pipe) — parser supports, codegen does not
- `..` / `..=` (range) — parser supports, codegen does not. Use `arrays.range()`

## 7. Exception Handling
```
try {
    // code that may throw
} catch errorVariable {
    // handle exception
} finally {
    // always executes (before return, after catch, or on success)
}

throw "error message"
```

### 7.1 Semantics
- Exceptions propagate up the call stack until caught
- `finally` always executes, even on return or exception
- Uncaught exceptions halt the VM with an error

## 8. Module System
### 8.1 Import
```
from "./path/to/module" import functionName, variableName
from "./path/to/module" import name as alias
```

### 8.2 Export
```
export fn myFunction() -> void { ... }
export let myVariable = 42
```

### 8.3 Module Resolution
- Relative paths only (starting with `./` or `../`)
- Circular dependencies are detected and reported as errors
- Modules are isolated: symbols do not leak between modules

### 8.4 NOT SUPPORTED in v1.0
- Package imports (non-relative paths)
- Package registry
- Version resolution

## 9. Builtin Modules
### 9.1 io
- `println(value)` — print with newline
- `print(value)` — print without newline
- `readLine()` — read line from stdin

### 9.2 strings
- `length(s)`, `toUpper(s)`, `toLower(s)`, `trim(s)`, `trimStart(s)`, `trimEnd(s)`
- `split(s, sep)`, `join(arr, sep)`, `contains(s, sub)`, `startsWith(s, sub)`, `endsWith(s, sub)`
- `substring(s, start, end?)`, `replace(s, from, to)`, `replaceAll(s, from, to)`
- `repeat(s, n)`, `padStart(s, len, char?)`, `padEnd(s, len, char?)`
- `charAt(s, i)`, `charCodeAt(s, i)`, `indexOf(s, sub)`, `lastIndexOf(s, sub)`
- `isEmpty(s)`, `reverse(s)`, `lines(s)`, `words(s)`

### 9.3 arrays
- `length(a)`, `get(a, i)`, `push(a, x)`, `pop(a)`, `shift(a)`, `unshift(a, x)`
- `concat(a, b)`, `slice(a, start, end?)`, `includes(a, x)`, `indexOf(a, x)`
- `join(a, sep)`, `reverse(a)`, `sort(a)`, `fill(a, x)`
- `range(start, end)` — generate integer range

### 9.4 convert
- `toInt(x)`, `toFloat(x)`, `toString(x)`, `toBool(x)`
- `toChar(code)`, `charCode(c)`, `typeOf(x)`

### 9.5 json
- `parse(text)` — parse JSON string to value
- `stringify(value, indent?)` — serialize value to JSON string

### 9.6 math
- `sqrt(x)`, `abs(x)`, `floor(x)`, `ceil(x)`, `round(x)`
- `min(a, b)`, `max(a, b)`, `pow(base, exp)`
- `sin(x)`, `cos(x)`, `tan(x)`, `log(x)`, `log2(x)`, `log10(x)`, `exp(x)`
- `pi`, `e` — constants
- `random()`, `randomInt(min, max)`

### 9.7 fs
- `readFile(path)`, `writeFile(path, content)`, `appendFile(path, content)`
- `exists(path)`, `mkdir(path)`, `remove(path)`, `listDir(path)`
- `isFile(path)`, `isDir(path)`, `fileSize(path)`, `copyFile(src, dst)`, `rename(old, new)`

### 9.8 http
- `get(url)`, `getText(url)`, `post(url, body)`, `postJson(url, obj)`, `request(opts)`

**Note**: http and fs depend on platform host interfaces. In the final runtime-independent
distribution, these are provided by the VM host layer, not by Node.js.

## 10. Bytecode
TLL compiles to a JSON-based bytecode format:
```json
{
  "functions": [{"name": "...", "paramCount": N, "localCount": N, "instructions": [{"op": N, "operands": [...}]}],
  "constants": [...],
  "mainFunctionIndex": N,
  "globalCount": N
}
```

### 10.1 Opcodes (41 total, 40 implemented)
0-26, 28-41 are implemented. Opcode 27 (MAKE_STRUCT) is reserved but unused (no struct support).

## 11. Concurrency
### NOT SUPPORTED in v1.0
- `agent` and `workflow` keywords are reserved in the lexer but not implemented
- No goroutines, threads, or async/await
- These are planned for TLL OS extension, not the core language

## 12. Version
- Language version: 1.0.0
- Bytecode version: 1 (no schema version field yet — planned)
- This specification is frozen for the v1.0 release.
