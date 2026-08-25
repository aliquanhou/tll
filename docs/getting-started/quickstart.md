# Getting Started with TLL OS

## Installation

```bash
git clone https://github.com/aliquanhou/tllos.git
cd tllos
npm install
npm run build-bootstrap
```

## Your First Program

Create `hello.tll`:

```tll
fn main() {
    io.println("Hello, TLL OS!")
}
```

Run it:

```bash
node tools/tll.js run hello.tll
# Output: Hello, TLL OS!
```

## Language Basics

### Variables

```tll
let x = 42
const name = "TLL"
```

### Functions

```tll
fn add(a, b) {
    return a + b
}

let result = add(3, 4)  // 7
```

### Closures

```tll
fn makeAdder(x) {
    fn add(y) {
        return x + y
    }
    return add
}

let add5 = makeAdder(5)
io.println(add5(10))  // 15
```

### Modules

```tll
// math.tll
export fn square(x) {
    return x * x
}

// main.tll
from "./math" import square
io.println(square(5))  // 25
```

### Control Flow

```tll
if x > 10 {
    io.println("big")
} else {
    io.println("small")
}

let i = 0
while i < 5 {
    io.println(i)
    i = i + 1
}
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `tll run <file>` | Compile and execute |
| `tll build <file>` | Compile to .tllbc |
| `tll check <file>` | Typecheck only |
| `tll repl` | Interactive REPL |

## Next Steps

- Read the [Language Core Specification](../architecture/language-core-freeze.md)
- Explore [examples](../../examples/)
- See [OPCODES.json](../../spec/OPCODES.json) for bytecode reference
