import re

with open('src/runtime.ts', 'r') as f:
    content = f.read()

old = """        if (fnIdx >= 0 && fnIdx < this.program.functions.length) {
          const fn = this.program.functions[fnIdx];"""

new = """        // Check for indirect call first (register holds a function value, e.g. builtin)
        const possibleFn = regs[b];
        if (typeof possibleFn === 'function') {
          try {
            regs[a] = possibleFn(...args);
          } catch (e: any) {
            const errMsg = e instanceof Error ? e.message : String(e);
            this.throwException(frame, errMsg);
          }
        } else if (fnIdx >= 0 && fnIdx < this.program.functions.length) {
          const fn = this.program.functions[fnIdx];"""

content = content.replace(old, new)

old_else = """        } else {
          // Indirect call (function value, e.g. builtin functions)
          const fnValue = regs[b] as Function;
          if (typeof fnValue === 'function') {
            try {
              regs[a] = fnValue(...args);
            } catch (e: any) {
              const errMsg = e instanceof Error ? e.message : String(e);
              this.throwException(frame, errMsg);
            }
          }
        }"""

new_else = """        }"""

content = content.replace(old_else, new_else)

with open('src/runtime.ts', 'w') as f:
    f.write(content)

print('Done')
