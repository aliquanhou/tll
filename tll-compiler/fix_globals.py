import re

# ============ Modify compiler.ts ============
with open('src/compiler.ts', 'r') as f:
    compiler = f.read()

# 1. Add OpCode LOAD_GLOBAL and STORE_GLOBAL after TRY_END
compiler = compiler.replace(
    '  TRY_END = 39,        // (clear try handler)\n}',
    '  TRY_END = 39,        // (clear try handler)\n  LOAD_GLOBAL = 40,    // r, global_index\n  STORE_GLOBAL = 41,   // global_index, r\n}'
)

# 2. Add globalCount to CompiledProgram
compiler = compiler.replace(
    '  mainFunctionIndex: number;\n}',
    '  mainFunctionIndex: number;\n  globalCount: number;\n}'
)

# 3. Add globalVariables to Compiler class
compiler = compiler.replace(
    '  private variableMap = new Map<string, number>(); // name -> local index',
    '  private variableMap = new Map<string, number>(); // name -> local index\n  private globalVariables = new Map<string, number>(); // name -> global index'
)

# 4. Add isInMain flag
compiler = compiler.replace(
    '  private loopContexts: { breakLabel: number; continueLabel: number }[] = [];',
    '  private loopContexts: { breakLabel: number; continueLabel: number }[] = [];\n  private isInMain = false;'
)

# 5. Modify compile method: first pass collect global variables
# Find the section where main function is created and top-level statements compiled
old_main_section = """    // Create implicit main function for top-level statements
    const mainIdx = this.functions.length;
    this.functions.push({
      name: '__main__',
      paramCount: 0,
      instructions: [],
      localCount: 0,
    });"""

new_main_section = """    // Collect global variables from top-level statements first
    for (const stmt of program.statements) {
      if (stmt.kind === 'Let' || stmt.kind === 'Const') {
        const letStmt = stmt as AST.LetStatement;
        if (!this.globalVariables.has(letStmt.name)) {
          this.globalVariables.set(letStmt.name, this.globalVariables.size);
        }
      }
    }

    // Create implicit main function for top-level statements
    const mainIdx = this.functions.length;
    this.functions.push({
      name: '__main__',
      paramCount: 0,
      instructions: [],
      localCount: 0,
    });"""

compiler = compiler.replace(old_main_section, new_main_section)

# 6. Set isInMain when compiling top-level statements
old_top_compile = """    // Compile top-level statements into main
    this.currentFn = this.functions[mainIdx];
    this.registerCount = 0;
    this.variableMap = new Map();
    this.labelCounter = 0;"""

new_top_compile = """    // Compile top-level statements into main
    this.currentFn = this.functions[mainIdx];
    this.registerCount = 0;
    this.variableMap = new Map();
    this.labelCounter = 0;
    this.isInMain = true;"""

compiler = compiler.replace(old_top_compile, new_top_compile)

# 7. Set isInMain = false when compiling function
old_func_compile = """  private compileFunction(fn: AST.FnDeclaration, fnIdx: number): void {
    this.currentFn = this.functions[fnIdx];
    this.registerCount = 0;
    this.variableMap = new Map();
    this.labelCounter = 0;"""

new_func_compile = """  private compileFunction(fn: AST.FnDeclaration, fnIdx: number): void {
    this.currentFn = this.functions[fnIdx];
    this.registerCount = 0;
    this.variableMap = new Map();
    this.labelCounter = 0;
    this.isInMain = false;"""

compiler = compiler.replace(old_func_compile, new_func_compile)

# 8. Add resolveVar helper method (before getOrCreateVar)
old_getorcreate = """  private getOrCreateVar(name: string): number {
    let idx = this.variableMap.get(name);
    if (idx === undefined) {
      idx = this.currentFn!.localCount++;
      this.variableMap.set(name, idx);
    }
    return idx;
  }"""

new_getorcreate = """  private resolveVar(name: string): { index: number; isGlobal: boolean } {
    const localIdx = this.variableMap.get(name);
    if (localIdx !== undefined) {
      return { index: localIdx, isGlobal: false };
    }
    const globalIdx = this.globalVariables.get(name);
    if (globalIdx !== undefined) {
      return { index: globalIdx, isGlobal: true };
    }
    // Not found - create as local
    const idx = this.currentFn!.localCount++;
    this.variableMap.set(name, idx);
    return { index: idx, isGlobal: false };
  }

  private getOrCreateVar(name: string): number {
    const { index } = this.resolveVar(name);
    return index;
  }"""

compiler = compiler.replace(old_getorcreate, new_getorcreate)

# 9. Modify compileLet to use STORE_GLOBAL for top-level
old_compilelet = """  private compileLet(stmt: AST.LetStatement | AST.ConstStatement): void {
    const valueReg = this.compileExpression(stmt.value);
    const varIdx = this.getOrCreateVar(stmt.name);
    this.emit(OpCode.STORE_VAR, [varIdx, valueReg]);
  }"""

new_compilelet = """  private compileLet(stmt: AST.LetStatement | AST.ConstStatement): void {
    const valueReg = this.compileExpression(stmt.value);
    const { index, isGlobal } = this.resolveVar(stmt.name);
    if (isGlobal) {
      this.emit(OpCode.STORE_GLOBAL, [index, valueReg]);
    } else {
      this.emit(OpCode.STORE_VAR, [index, valueReg]);
    }
  }"""

compiler = compiler.replace(old_compilelet, new_compilelet)

# 10. Modify assignment in compileBinary
old_assign = """    } else if (expr.operator === '=') {
      // Assignment
      if (expr.left.kind === 'Ident') {
        const varIdx = this.getOrCreateVar(expr.left.name);
        this.emit(OpCode.STORE_VAR, [varIdx, rightReg]);
        return rightReg;
      }
    }"""

new_assign = """    } else if (expr.operator === '=') {
      // Assignment
      if (expr.left.kind === 'Ident') {
        const { index, isGlobal } = this.resolveVar(expr.left.name);
        if (isGlobal) {
          this.emit(OpCode.STORE_GLOBAL, [index, rightReg]);
        } else {
          this.emit(OpCode.STORE_VAR, [index, rightReg]);
        }
        return rightReg;
      }
    }"""

compiler = compiler.replace(old_assign, new_assign)

# 11. Modify identifier reference in compileExpression
old_ident = """      case 'Ident': {
        const reg = this.allocReg();
        const varIdx = this.variableMap.get(expr.name);
        if (varIdx !== undefined) {
          this.emit(OpCode.LOAD_VAR, [reg, varIdx]);
        } else {
          // Could be a function reference or undefined
          this.emit(OpCode.LOAD_CONST, [reg, this.addConstant(undefined)]);
        }
        return reg;
      }"""

new_ident = """      case 'Ident': {
        const reg = this.allocReg();
        const { index, isGlobal } = this.resolveVar(expr.name);
        if (isGlobal) {
          this.emit(OpCode.LOAD_GLOBAL, [reg, index]);
        } else if (this.variableMap.has(expr.name) || this.globalVariables.has(expr.name)) {
          this.emit(OpCode.LOAD_VAR, [reg, index]);
        } else {
          // Could be a function reference or undefined
          this.emit(OpCode.LOAD_CONST, [reg, this.addConstant(undefined)]);
        }
        return reg;
      }"""

compiler = compiler.replace(old_ident, new_ident)

# 12. Add globalCount to return statement
old_return = """    return {
      constants: this.constants,
      functions: this.functions,
      mainFunctionIndex: mainIdx,
    };"""

new_return = """    return {
      constants: this.constants,
      functions: this.functions,
      mainFunctionIndex: mainIdx,
      globalCount: this.globalVariables.size,
    };"""

compiler = compiler.replace(old_return, new_return)

with open('src/compiler.ts', 'w') as f:
    f.write(compiler)

print("compiler.ts modified")

# ============ Modify runtime.ts ============
with open('src/runtime.ts', 'r') as f:
    runtime = f.read()

# 1. Change globals from Map to array
runtime = runtime.replace(
    '  private globals: Map<string, any> = new Map();',
    '  private globals: any[] = [];'
)

# 2. Initialize globals array in constructor (after program assignment)
runtime = runtime.replace(
    '  constructor(program: CompiledProgram) {\n    this.program = program;',
    '  constructor(program: CompiledProgram) {\n    this.program = program;\n    this.globals = new Array(program.globalCount || 0).fill(undefined);'
)

# 3. Add LOAD_GLOBAL and STORE_GLOBAL after STORE_VAR
old_storevar = """      case OpCode.STORE_VAR:
        frame.locals[a] = regs[b];
        break;"""

new_storevar = """      case OpCode.STORE_VAR:
        frame.locals[a] = regs[b];
        break;

      case OpCode.LOAD_GLOBAL:
        regs[a] = this.globals[b];
        break;

      case OpCode.STORE_GLOBAL:
        this.globals[a] = regs[b];
        break;"""

runtime = runtime.replace(old_storevar, new_storevar)

with open('src/runtime.ts', 'w') as f:
    f.write(runtime)

print("runtime.ts modified")
print("Done!")
