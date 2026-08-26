# TLL OS Syntax Specification

**Version**: 1.1
**Status**: FROZEN

---

## 1. Lexical Structure

### 1.1 Comments

```tll
// Single line comment

/*
  Multi-line comment
*/
```

### 1.2 Identifiers

- Start with letter or underscore
- Contain letters, digits, underscores
- Case-sensitive
- Cannot be a keyword

```tll
myVar
_private
camelCase
snake_case
```

### 1.3 Keywords

```
fn let const if else while for return
try catch finally throw import from export
true false null
```

### 1.4 Literals

| Type | Example |
|------|---------|
| Integer | `42`, `-7`, `0xFF`, `0b1010`, `0o777` |
| Float | `3.14`, `1.0`, `1e10`, `-0.5` |
| String | `"hello"`, `'world'` |
| Boolean | `true`, `false` |
| Null | `null` |
| Array | `[1, 2, 3]`, `[]` |
| Map | `{"a": 1, "b": 2}`, `{}` |

---

## 2. Program Structure

A TLL program is a sequence of top-level declarations:

```tll
// Imports
from "./module" import name

// Functions
fn myFunction() {
    // body
}

// Variables
let globalVar = 42

// Exports
export myFunction
```

---

## 3. Declarations

### 3.1 Variables

```tll
let x = 42           // mutable
const PI = 3.14      // immutable
let y: int = 100     // explicit type annotation (optional)
```

### 3.2 Functions

```tll
// Basic function
fn add(a, b) {
    return a + b
}

// With type annotations
fn multiply(a: int, b: int) -> int {
    return a * b
}

// No parameters
fn greet() {
    io.println("Hello")
}

// Nested function
fn outer() {
    fn inner() {
        return 42
    }
    return inner
}
```

### 3.3 Anonymous Functions

```tll
let f = fn(a, b) { return a + b }
let result = f(1, 2)
```

---

## 4. Control Flow

### 4.1 If/Else

```tll
if (x > 0) {
    io.println("positive")
} else if (x < 0) {
    io.println("negative")
} else {
    io.println("zero")
}
```

### 4.2 While

```tll
let i = 0
while (i < 10) {
    io.println(i)
    i = i + 1
}
```

### 4.3 For

```tll
for (let i = 0; i < 10; i = i + 1) {
    io.println(i)
}
```

### 4.4 Return

```tll
fn example() {
    return 42
    // code after return is unreachable
}
```

---

## 5. Expressions

### 5.1 Binary Operators

```tll
a + b    // addition / string concat
a - b    // subtraction
a * b    // multiplication
a / b    // division (float)
a % b    // modulo
a ** b   // power
a == b   // equal
a != b   // not equal
a < b    // less than
a > b    // greater than
a <= b   // less or equal
a >= b   // greater or equal
a && b   // logical AND (short-circuit)
a || b   // logical OR (short-circuit)
a ?? b   // null coalescing
```

### 5.2 Unary Operators

```tll
!a       // logical NOT
-a       // negation
```

### 5.3 Function Call

```tll
add(1, 2)
f(a, b, c)
obj.method(arg)
arr[i]
```

### 5.4 Member Access

```tll
obj.property
map["key"]
arr[index]
```

### 5.5 Assignment

```tll
x = 42
x = x + 1
arr[0] = "hello"
obj.key = value
```

---

## 6. Exception Handling

```tll
try {
    // code that might throw
    throw "Something went wrong"
} catch (e) {
    io.println("Error: " + e)
} finally {
    io.println("Always executes")
}
```

- `throw` can throw any value (string, map, etc.)
- `catch` captures the thrown value
- `finally` always executes, even on return or throw
- Nested try/catch is supported

---

## 7. Import/Export

```tll
// Import
from "./utils" import helper, formatter
from "../lib/math" import add, subtract

// Export
fn myFunc() { return 1 }
let myVar = 2
export myFunc
export myVar
```

---

## 8. Builtin Module Access

Builtin modules are accessed as member expressions:

```tll
io.println("hello")
json.parse('{"a": 1}')
math.sqrt(16)
strings.length("hello")
arrays.push(myArr, 42)
fs.readFile("data.txt")
```

---

## 9. Main Function

The program entry point is a top-level `main()` function:

```tll
fn main() {
    io.println("Hello, TLL OS!")
}
```

- `main()` is called automatically when the program runs
- If no `main()` exists, the program does nothing
- `main()` must be in the entry file
