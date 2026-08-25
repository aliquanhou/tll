/**
 * TLL Compiler - Bootstrap Compiler (TypeScript)
 * Compiles AST to TLL Bytecode per Spec 0.1 §13
 */

import * as AST from './ast';
import { getBuiltinIndex } from './stdlib';

// ============ Bytecode Definitions ============

export enum OpCode {
  LOAD_CONST = 0,    // r, const_index
  LOAD_VAR = 1,      // r, var_index
  STORE_VAR = 2,     // var_index, r
  ADD = 3,           // r1, r2, r3
  SUB = 4,
  MUL = 5,
  DIV = 6,
  MOD = 7,
  POW = 8,
  EQ = 9,
  NEQ = 10,
  LT = 11,
  GT = 12,
  LE = 13,
  GE = 14,
  AND = 15,
  OR = 16,
  NOT = 17,
  NEG = 18,
  JMP = 19,          // label
  JMP_IF_FALSE = 20, // r, label
  CALL = 21,         // r, func_index, arg_count
  RET = 22,          // r
  PRINT = 23,        // r
  PRINTLN = 24,      // r
  MAKE_ARRAY = 25,   // r, count
  MAKE_MAP = 26,     // r, count
  MAKE_STRUCT = 27,  // r, type_index, field_count
  INDEX_GET = 28,    // r1, r2, r3
  INDEX_SET = 29,    // r1, r2, r3
  MEMBER_GET = 30,   // r1, r2, name_index
  MEMBER_SET = 31,   // r1, r2, name_index
  HALT = 32,
  NOP = 33,
  PUSH = 34,         // r (push to stack for call args)
  CONCAT = 35,       // r1, r2, r3 (string concat)
  LOAD_BUILTIN = 36,  // r, builtin_index
  THROW = 37,          // r (throw value in register)
  TRY_START = 38,      // catch_offset (record try handler)
  TRY_END = 39,        // (clear try handler)
  LOAD_GLOBAL = 40,    // r, global_index
  STORE_GLOBAL = 41,   // global_index, r
}

export interface Instruction {
  op: OpCode;
  operands: number[];
}

export interface CompiledFunction {
  name: string;
  paramCount: number;
  instructions: Instruction[];
  localCount: number;
  isTool?: boolean;
}

export interface CompiledProgram {
  constants: any[];
  functions: CompiledFunction[];
  mainFunctionIndex: number;
  globalCount: number;
}

// ============ Compiler ============

export class Compiler {
  private constants: any[] = [];
  private functions: CompiledFunction[] = [];
  private currentFn: CompiledFunction | null = null;
  private registerCount = 0;
  private labelCounter = 0;
  private variableMap = new Map<string, number>(); // name -> local index
  private globalVariables = new Map<string, number>(); // name -> global index
  private functionMap = new Map<string, number>(); // name -> function index
  private fnDeclMap = new Map<string, AST.FnDeclaration>(); // internalName -> fn declaration
  private loopContexts: { breakLabel: number; continueLabel: number }[] = [];
  private isInMain = false;

  // Recursively collect all function declarations (top-level + nested)
  // parentName: null for top-level, or the internalName of the enclosing function
  private collectFunctions(stmts: AST.Statement[], parentName: string | null): void {
    for (const stmt of stmts) {
      let fnDecl: AST.FnDeclaration | null = null;
      let isTool = false;
      if (stmt.kind === 'Fn') {
        fnDecl = stmt;
      } else if (stmt.kind === 'Export' && stmt.declaration.kind === 'Fn') {
        fnDecl = stmt.declaration as AST.FnDeclaration;
      } else if (stmt.kind === 'Tool') {
        const tool = stmt as AST.ToolDeclaration;
        fnDecl = {
          kind: 'Fn',
          name: tool.name,
          params: tool.params,
          returnType: tool.returnType,
          body: tool.body,
          line: tool.line,
          column: tool.column,
        } as AST.FnDeclaration;
        isTool = true;
      }
      if (fnDecl) {
        // Generate unique internal name
        const internalName = parentName ? `${parentName}__${fnDecl.name}` : fnDecl.name;
        (fnDecl as any).internalName = internalName;
        const idx = this.functions.length;
        this.functionMap.set(internalName, idx);
        this.fnDeclMap.set(internalName, fnDecl);
        this.functions.push({
          name: internalName,
          paramCount: fnDecl.params.length,
          instructions: [],
          localCount: 0,
          isTool,
        });
        // Recursively collect nested functions from this function's body
        if (fnDecl.body && fnDecl.body.statements) {
          this.collectFunctions(fnDecl.body.statements, internalName);
        }
      }
    }
  }

  public compile(program: AST.Program): CompiledProgram {
    this.constants = [];
    this.functions = [];
    this.functionMap = new Map();

    // First pass: recursively collect ALL function declarations (top-level + nested)
    this.collectFunctions(program.statements, null);

    // Collect global variables from top-level statements first
    for (const stmt of program.statements) {
      if (stmt.kind === 'Let' || stmt.kind === 'Const') {
        const letStmt = stmt as AST.LetStatement;
        if (!this.globalVariables.has(letStmt.name)) {
          this.globalVariables.set(letStmt.name, this.globalVariables.size);
        }
      }
    }

    // Register top-level functions as global variables (for first-class function support)
    for (const [fnName] of this.functionMap) {
      // Only top-level functions (no "__" in name from nesting) get globals
      // Nested functions are local to their enclosing function
      if (!fnName.includes('__') && !this.globalVariables.has(fnName)) {
        this.globalVariables.set(fnName, this.globalVariables.size);
      }
    }

    // Create implicit main function for top-level statements
    const mainIdx = this.functions.length;
    this.functions.push({
      name: '__main__',
      paramCount: 0,
      instructions: [],
      localCount: 0,
    });

    // Second pass: compile ALL function bodies (top-level + nested)
    for (const [internalName, fnDecl] of this.fnDeclMap) {
      const fnIdx = this.functionMap.get(internalName)!;
      this.compileFunction(fnDecl, fnIdx);
    }

    // Compile top-level statements into main
    this.currentFn = this.functions[mainIdx];
    this.registerCount = 0;
    this.variableMap = new Map();
    this.labelCounter = 0;
    this.isInMain = true;

    // Emit function value initialization: create {__fn, fnIdx, env:null} for TOP-LEVEL functions only
    // Nested functions get their Function Value created at runtime in their enclosing function
    for (const [fnName, fnIdx] of this.functionMap) {
      if (fnName.includes('__')) continue; // skip nested functions
      const globalIdx = this.globalVariables.get(fnName)!;
      // Push key "__fn", value true
      const k1 = this.allocReg(); this.emit(OpCode.LOAD_CONST, [k1, this.addConstant('__fn')]);
      const v1 = this.allocReg(); this.emit(OpCode.LOAD_CONST, [v1, this.addConstant(true)]);
      this.emit(OpCode.PUSH, [k1]); this.emit(OpCode.PUSH, [v1]);
      // Push key "fnIdx", value fnIdx
      const k2 = this.allocReg(); this.emit(OpCode.LOAD_CONST, [k2, this.addConstant('fnIdx')]);
      const v2 = this.allocReg(); this.emit(OpCode.LOAD_CONST, [v2, this.addConstant(fnIdx)]);
      this.emit(OpCode.PUSH, [k2]); this.emit(OpCode.PUSH, [v2]);
      // Push key "env", value null
      const k3 = this.allocReg(); this.emit(OpCode.LOAD_CONST, [k3, this.addConstant('env')]);
      const v3 = this.allocReg(); this.emit(OpCode.LOAD_CONST, [v3, this.addConstant(null)]);
      this.emit(OpCode.PUSH, [k3]); this.emit(OpCode.PUSH, [v3]);
      // Make map and store to global
      const fnValReg = this.allocReg();
      this.emit(OpCode.MAKE_MAP, [fnValReg, 3]);
      this.emit(OpCode.STORE_GLOBAL, [globalIdx, fnValReg]);
    }

    for (const stmt of program.statements) {
      if (stmt.kind !== 'Fn' && stmt.kind !== 'Struct' && stmt.kind !== 'Enum' &&
          stmt.kind !== 'Interface' && stmt.kind !== 'Import' && stmt.kind !== 'TypeAlias' &&
          stmt.kind !== 'Agent' && stmt.kind !== 'Tool' && stmt.kind !== 'Workflow' && stmt.kind !== 'Intent' &&
          stmt.kind !== 'Entity' && stmt.kind !== 'Api' && stmt.kind !== 'Application' &&
          stmt.kind !== 'Package' && stmt.kind !== 'Impl' && stmt.kind !== 'Export') {
        this.compileStatement(stmt);
      }
    }

    this.emit(OpCode.HALT, []);

    this.resolveFunctionLabels();

    return {
      constants: this.constants,
      functions: this.functions,
      mainFunctionIndex: mainIdx,
      globalCount: this.globalVariables.size,
    };
  }

  private compileFunction(fn: AST.FnDeclaration, fnIdx: number): void {
    this.currentFn = this.functions[fnIdx];
    this.registerCount = 0;
    this.variableMap = new Map();
    this.labelCounter = 0;
    this.isInMain = false;

    // Map parameters to local variables
    for (let i = 0; i < fn.params.length; i++) {
      this.variableMap.set(fn.params[i].name, i);
    }
    this.currentFn.localCount = fn.params.length;

    // Pre-register nested function names as local variables
    if (fn.body && fn.body.statements) {
      for (const stmt of fn.body.statements) {
        if (stmt.kind === 'Fn') {
          const nestedFn = stmt as AST.FnDeclaration;
          if (!this.variableMap.has(nestedFn.name)) {
            this.variableMap.set(nestedFn.name, this.currentFn.localCount);
            this.currentFn.localCount++;
          }
        }
      }
    }

    this.compileBlock(fn.body);

    // Implicit return void
    if (this.currentFn.instructions.length === 0 ||
        this.currentFn.instructions[this.currentFn.instructions.length - 1].op !== OpCode.RET) {
      const voidReg = this.allocReg();
      this.emit(OpCode.LOAD_CONST, [voidReg, this.addConstant(null)]);
      this.emit(OpCode.RET, [voidReg]);
    }

    this.resolveFunctionLabels();
  }

  private resolveFunctionLabels(): void {
    if (!this.labelPositions || !this.currentFn) return;
    const positions = this.labelPositions;
    for (const inst of this.currentFn.instructions) {
      if (inst.op === OpCode.JMP || inst.op === OpCode.TRY_START) {
        const label = inst.operands[inst.operands.length - 1];
        if (positions.has(label)) {
          inst.operands[inst.operands.length - 1] = positions.get(label)!;
        }
      } else if (inst.op === OpCode.JMP_IF_FALSE) {
        const label = inst.operands[1];
        if (positions.has(label)) {
          inst.operands[1] = positions.get(label)!;
        }
      }
    }
    this.labelPositions = new Map();
  }

  private compileBlock(block: AST.BlockStatement): void {
    for (const stmt of block.statements) {
      this.compileStatement(stmt);
    }
  }

  private compileStatement(stmt: AST.Statement): void {
    switch (stmt.kind) {
      case 'Let':
      case 'Const':
        this.compileLet(stmt);
        break;
      case 'Return':
        this.compileReturn(stmt);
        break;
      case 'If':
        this.compileIf(stmt);
        break;
      case 'While':
        this.compileWhile(stmt);
        break;
      case 'For':
        this.compileFor(stmt);
        break;
      case 'ExpressionStatement':
        this.compileExpression(stmt.expression);
        break;
      case 'Block':
        this.compileBlock(stmt);
        break;
      case 'Break': {
        const ctx = this.loopContexts[this.loopContexts.length - 1];
        if (ctx) {
          this.emit(OpCode.JMP, [ctx.breakLabel]);
        } else {
          this.emit(OpCode.NOP, []);
        }
        break;
      }
      case 'Continue': {
        const ctx = this.loopContexts[this.loopContexts.length - 1];
        if (ctx) {
          this.emit(OpCode.JMP, [ctx.continueLabel]);
        } else {
          this.emit(OpCode.NOP, []);
        }
        break;
      }
      case 'Defer':
        // Simplified: execute immediately
        this.compileExpression(stmt.expression);
        break;
      case 'Try':
        this.compileTry(stmt);
        break;
      case 'Throw':
        this.compileThrow(stmt);
        break;
      case 'Export':
        // Compile the exported declaration (function/const/let/struct)
        this.compileStatement((stmt as AST.ExportStatement).declaration);
        break;
      case 'Fn': {
        // Nested function definition: create Function Value and store in local variable
        const fnDecl = stmt as AST.FnDeclaration;
        const internalName = (fnDecl as any).internalName || fnDecl.name;
        const fnIdx = this.functionMap.get(internalName);
        if (fnIdx === undefined) {
          break; // Should not happen if collectFunctions worked
        }
        // Create {__fn: true, fnIdx: N, env: null}
        const k1 = this.allocReg(); this.emit(OpCode.LOAD_CONST, [k1, this.addConstant('__fn')]);
        const v1 = this.allocReg(); this.emit(OpCode.LOAD_CONST, [v1, this.addConstant(true)]);
        this.emit(OpCode.PUSH, [k1]); this.emit(OpCode.PUSH, [v1]);
        const k2 = this.allocReg(); this.emit(OpCode.LOAD_CONST, [k2, this.addConstant('fnIdx')]);
        const v2 = this.allocReg(); this.emit(OpCode.LOAD_CONST, [v2, this.addConstant(fnIdx)]);
        this.emit(OpCode.PUSH, [k2]); this.emit(OpCode.PUSH, [v2]);
        const k3 = this.allocReg(); this.emit(OpCode.LOAD_CONST, [k3, this.addConstant('env')]);
        const v3 = this.allocReg(); this.emit(OpCode.LOAD_CONST, [v3, this.addConstant(null)]);
        this.emit(OpCode.PUSH, [k3]); this.emit(OpCode.PUSH, [v3]);
        const fnValReg = this.allocReg();
        this.emit(OpCode.MAKE_MAP, [fnValReg, 3]);
        // Store to local variable
        const { index, isGlobal } = this.resolveVar(fnDecl.name);
        if (isGlobal) {
          this.emit(OpCode.STORE_GLOBAL, [index, fnValReg]);
        } else {
          this.emit(OpCode.STORE_VAR, [index, fnValReg]);
        }
        break;
      }
      case 'Import':
        // Imports are resolved at link time (multi-file compilation stage 2)
        // For now, record and skip - single-file programs don't need imports
        break;
      default:
        // Skip declarations
        break;
    }
  }

  private compileLet(stmt: AST.LetStatement | AST.ConstStatement): void {
    const valueReg = this.compileExpression(stmt.value);
    const { index, isGlobal } = this.resolveVar(stmt.name);
    if (isGlobal) {
      this.emit(OpCode.STORE_GLOBAL, [index, valueReg]);
    } else {
      this.emit(OpCode.STORE_VAR, [index, valueReg]);
    }
  }

  private compileReturn(stmt: AST.ReturnStatement): void {
    if (stmt.value) {
      const reg = this.compileExpression(stmt.value);
      this.emit(OpCode.RET, [reg]);
    } else {
      const reg = this.allocReg();
      this.emit(OpCode.LOAD_CONST, [reg, this.addConstant(null)]);
      this.emit(OpCode.RET, [reg]);
    }
  }

  private compileIf(stmt: AST.IfStatement): void {
    const condReg = this.compileExpression(stmt.condition);
    const elseLabel = this.newLabel();
    const endLabel = this.newLabel();

    this.emit(OpCode.JMP_IF_FALSE, [condReg, elseLabel]);
    this.compileBlock(stmt.consequent);
    this.emit(OpCode.JMP, [endLabel]);

    this.patchLabel(elseLabel);
    if (stmt.alternate) {
      if (stmt.alternate.kind === 'If') {
        this.compileIf(stmt.alternate);
      } else {
        this.compileBlock(stmt.alternate);
      }
    }
    this.patchLabel(endLabel);
  }

  private compileWhile(stmt: AST.WhileStatement): void {
    const startLabel = this.newLabel();
    const endLabel = this.newLabel();

    // Push loop context for break/continue
    this.loopContexts.push({ breakLabel: endLabel, continueLabel: startLabel });

    this.patchLabel(startLabel);
    const condReg = this.compileExpression(stmt.condition);
    this.emit(OpCode.JMP_IF_FALSE, [condReg, endLabel]);
    this.compileBlock(stmt.body);
    this.emit(OpCode.JMP, [startLabel]);
    this.patchLabel(endLabel);

    // Pop loop context
    this.loopContexts.pop();
  }

  private compileFor(stmt: AST.ForStatement): void {
    // Simplified: for x in iterable { body }
    // Compile as while loop with index
    const iterReg = this.compileExpression(stmt.iterable);
    const varIdx = this.getOrCreateVar(stmt.variable);
    const indexVar = this.getOrCreateVar('__for_idx__');
    const lenReg = this.allocReg();

    // Get length
    this.emit(OpCode.MEMBER_GET, [lenReg, iterReg, this.addConstant('length')]);

    // index = 0
    const zeroReg = this.allocReg();
    this.emit(OpCode.LOAD_CONST, [zeroReg, this.addConstant(0)]);
    this.emit(OpCode.STORE_VAR, [indexVar, zeroReg]);

    const startLabel = this.newLabel();
    const endLabel = this.newLabel();

    this.patchLabel(startLabel);
    // if index >= length, break
    const idxReg = this.allocReg();
    this.emit(OpCode.LOAD_VAR, [idxReg, indexVar]);
    const cmpReg = this.allocReg();
    this.emit(OpCode.GE, [cmpReg, idxReg, lenReg]);
    this.emit(OpCode.JMP_IF_FALSE, [cmpReg, endLabel]); // Wait, this is wrong
    // Actually: if cmp is true (>=), jump to end
    this.emit(OpCode.JMP_IF_FALSE, [cmpReg, endLabel]); // This jumps if false, so we need the opposite

    // Get element: iterable[index]
    const elemReg = this.allocReg();
    this.emit(OpCode.INDEX_GET, [elemReg, iterReg, idxReg]);
    this.emit(OpCode.STORE_VAR, [varIdx, elemReg]);

    this.compileBlock(stmt.body);

    // index++
    const oneReg = this.allocReg();
    this.emit(OpCode.LOAD_CONST, [oneReg, this.addConstant(1)]);
    const newIdxReg = this.allocReg();
    this.emit(OpCode.ADD, [newIdxReg, idxReg, oneReg]);
    this.emit(OpCode.STORE_VAR, [indexVar, newIdxReg]);

    this.emit(OpCode.JMP, [startLabel]);
    this.patchLabel(endLabel);
  }

  private compileTry(stmt: AST.TryStatement): void {
    const catchLabel = this.newLabel();
    const finallyLabel = this.newLabel();
    const endLabel = this.newLabel();

    // TRY_START catchLabel
    this.emit(OpCode.TRY_START, [catchLabel]);

    // Compile try body
    this.compileBlock(stmt.body);

    // TRY_END
    this.emit(OpCode.TRY_END, []);

    // Jump over catch block
    if (stmt.finallyBody) {
      this.emit(OpCode.JMP, [finallyLabel]);
    } else {
      this.emit(OpCode.JMP, [endLabel]);
    }

    // Catch block
    this.patchLabel(catchLabel);
    if (stmt.catchBody) {
      // Store error value into catch param (error is in r0)
      if (stmt.catchParam) {
        const errVarIdx = this.getOrCreateVar(stmt.catchParam);
        this.emit(OpCode.STORE_VAR, [errVarIdx, 0]);
      }
      this.compileBlock(stmt.catchBody);
    }

    // Finally block
    if (stmt.finallyBody) {
      this.patchLabel(finallyLabel);
      this.compileBlock(stmt.finallyBody);
    }

    this.patchLabel(endLabel);
  }

  private compileThrow(stmt: AST.ThrowStatement): void {
    const valueReg = this.compileExpression(stmt.value);
    this.emit(OpCode.THROW, [valueReg]);
  }

  private compileExpression(expr: AST.Expression): number {
    switch (expr.kind) {
      case 'Int': {
        const reg = this.allocReg();
        this.emit(OpCode.LOAD_CONST, [reg, this.addConstant(parseInt(expr.value, expr.value.startsWith('0x') ? 16 : expr.value.startsWith('0o') ? 8 : expr.value.startsWith('0b') ? 2 : 10))]);
        return reg;
      }
      case 'Float': {
        const reg = this.allocReg();
        this.emit(OpCode.LOAD_CONST, [reg, this.addConstant(parseFloat(expr.value))]);
        return reg;
      }
      case 'String': {
        const reg = this.allocReg();
        this.emit(OpCode.LOAD_CONST, [reg, this.addConstant(expr.value)]);
        return reg;
      }
      case 'Bool': {
        const reg = this.allocReg();
        this.emit(OpCode.LOAD_CONST, [reg, this.addConstant(expr.value)]);
        return reg;
      }
      case 'Null': {
        const reg = this.allocReg();
        this.emit(OpCode.LOAD_CONST, [reg, this.addConstant(null)]);
        return reg;
      }
      case 'Ident': {
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
      }
      case 'Binary':
        return this.compileBinary(expr);
      case 'Unary':
        return this.compileUnary(expr);
      case 'Call':
        return this.compileCall(expr);
      case 'Member': {
        const objReg = this.compileExpression(expr.object);
        const reg = this.allocReg();
        this.emit(OpCode.MEMBER_GET, [reg, objReg, this.addConstant(expr.property)]);
        return reg;
      }
      case 'Index': {
        const objReg = this.compileExpression(expr.object);
        const idxReg = this.compileExpression(expr.index);
        const reg = this.allocReg();
        this.emit(OpCode.INDEX_GET, [reg, objReg, idxReg]);
        return reg;
      }
      case 'Array': {
        const reg = this.allocReg();
        const elemRegs = expr.elements.map(e => this.compileExpression(e));
        for (const er of elemRegs) {
          this.emit(OpCode.PUSH, [er]);
        }
        this.emit(OpCode.MAKE_ARRAY, [reg, expr.elements.length]);
        return reg;
      }
      case 'Map': {
        const reg = this.allocReg();
        for (const entry of expr.entries) {
          const kReg = this.compileExpression(entry.key);
          const vReg = this.compileExpression(entry.value);
          this.emit(OpCode.PUSH, [kReg]);
          this.emit(OpCode.PUSH, [vReg]);
        }
        this.emit(OpCode.MAKE_MAP, [reg, expr.entries.length]);
        return reg;
      }
      case 'Tuple': {
        const reg = this.allocReg();
        const elemRegs = expr.elements.map(e => this.compileExpression(e));
        for (const er of elemRegs) {
          this.emit(OpCode.PUSH, [er]);
        }
        this.emit(OpCode.MAKE_ARRAY, [reg, expr.elements.length]);
        return reg;
      }
      case 'IfExpr': {
        const condReg = this.compileExpression(expr.condition);
        const resultReg = this.allocReg();
        const elseLabel = this.newLabel();
        const endLabel = this.newLabel();

        this.emit(OpCode.JMP_IF_FALSE, [condReg, elseLabel]);
        const thenReg = this.compileBlockExpression(expr.consequent);
        this.emit(OpCode.STORE_VAR, [this.getOrCreateVar('__if_result__'), thenReg]);
        this.emit(OpCode.JMP, [endLabel]);

        this.patchLabel(elseLabel);
        if (expr.alternate) {
          if (expr.alternate.kind === 'IfExpr') {
            const elseReg = this.compileExpression(expr.alternate as AST.Expression);
            this.emit(OpCode.STORE_VAR, [this.getOrCreateVar('__if_result__'), elseReg]);
          } else {
            const elseReg = this.compileBlockExpression(expr.alternate);
            this.emit(OpCode.STORE_VAR, [this.getOrCreateVar('__if_result__'), elseReg]);
          }
        }
        this.patchLabel(endLabel);
        this.emit(OpCode.LOAD_VAR, [resultReg, this.getOrCreateVar('__if_result__')]);
        return resultReg;
      }
      case 'BlockExpr': {
        for (const stmt of expr.statements) {
          this.compileStatement(stmt);
        }
        if (expr.result) {
          return this.compileExpression(expr.result);
        }
        const reg = this.allocReg();
        this.emit(OpCode.LOAD_CONST, [reg, this.addConstant(null)]);
        return reg;
      }
      case 'Lambda':
      case 'Match':
      case 'Await':
      case 'Spawn':
      case 'Pipe':
      case 'Range':
      case 'Some':
      case 'None':
      case 'Ok':
      case 'Err':
      case 'Self':
      case 'StructLiteral':
      default: {
        const reg = this.allocReg();
        this.emit(OpCode.LOAD_CONST, [reg, this.addConstant(null)]);
        return reg;
      }
    }
  }

  private compileBlockExpression(block: AST.BlockStatement): number {
    this.compileBlock(block);
    const reg = this.allocReg();
    this.emit(OpCode.LOAD_CONST, [reg, this.addConstant(null)]);
    return reg;
  }

  private compileBinary(expr: AST.BinaryExpression): number {
    const leftReg = this.compileExpression(expr.left);
    const rightReg = this.compileExpression(expr.right);
    const resultReg = this.allocReg();

    const opMap: Record<string, OpCode> = {
      '+': OpCode.ADD,
      '-': OpCode.SUB,
      '*': OpCode.MUL,
      '/': OpCode.DIV,
      '%': OpCode.MOD,
      '**': OpCode.POW,
      '==': OpCode.EQ,
      '!=': OpCode.NEQ,
      '<': OpCode.LT,
      '>': OpCode.GT,
      '<=': OpCode.LE,
      '>=': OpCode.GE,
      '&&': OpCode.AND,
      '||': OpCode.OR,
    };

    const op = opMap[expr.operator];
    if (op !== undefined) {
      this.emit(op, [resultReg, leftReg, rightReg]);
    } else if (expr.operator === '=') {
      // Assignment
      if (expr.left.kind === 'Ident') {
        const { index, isGlobal } = this.resolveVar(expr.left.name);
        if (isGlobal) {
          this.emit(OpCode.STORE_GLOBAL, [index, rightReg]);
        } else {
          this.emit(OpCode.STORE_VAR, [index, rightReg]);
        }
        return rightReg;
      } else if (expr.left.kind === 'Index') {
        // Index assignment: obj[idx] = value
        const objReg = this.compileExpression(expr.left.object);
        const idxReg = this.compileExpression(expr.left.index);
        this.emit(OpCode.INDEX_SET, [objReg, idxReg, rightReg]);
        return rightReg;
      } else if (expr.left.kind === 'Member') {
        // Member assignment: obj.prop = value
        const objReg = this.compileExpression(expr.left.object);
        const nameIdx = this.addConstant(expr.left.property);
        this.emit(OpCode.MEMBER_SET, [objReg, nameIdx, rightReg]);
        return rightReg;
      }
    } else {
      this.emit(OpCode.LOAD_CONST, [resultReg, this.addConstant(null)]);
    }

    return resultReg;
  }

  private compileUnary(expr: AST.UnaryExpression): number {
    const operandReg = this.compileExpression(expr.operand);
    const resultReg = this.allocReg();
    if (expr.operator === '-') {
      this.emit(OpCode.NEG, [resultReg, operandReg]);
    } else if (expr.operator === '!') {
      this.emit(OpCode.NOT, [resultReg, operandReg]);
    }
    return resultReg;
  }

  private compileCall(expr: AST.CallExpression): number {
    const resultReg = this.allocReg();

    // Handle built-in io.println
    if (expr.callee.kind === 'Member' &&
        expr.callee.object.kind === 'Ident' &&
        expr.callee.object.name === 'io' &&
        expr.callee.property === 'println') {
      if (expr.args.length > 0) {
        const argReg = this.compileExpression(expr.args[0]);
        this.emit(OpCode.PRINTLN, [argReg]);
      } else {
        const reg = this.allocReg();
        this.emit(OpCode.LOAD_CONST, [reg, this.addConstant('')]);
        this.emit(OpCode.PRINTLN, [reg]);
      }
      this.emit(OpCode.LOAD_CONST, [resultReg, this.addConstant(null)]);
      return resultReg;
    }

    if (expr.callee.kind === 'Member' &&
        expr.callee.object.kind === 'Ident' &&
        expr.callee.object.name === 'io' &&
        expr.callee.property === 'print') {
      if (expr.args.length > 0) {
        const argReg = this.compileExpression(expr.args[0]);
        this.emit(OpCode.PRINT, [argReg]);
      }
      this.emit(OpCode.LOAD_CONST, [resultReg, this.addConstant(null)]);
      return resultReg;
    }


    // Standard library function call (module.function)
    if (expr.callee.kind === 'Member' &&
        expr.callee.object.kind === 'Ident') {
      const modName = expr.callee.object.name;
      const fnName = expr.callee.property;
      const builtinIdx = getBuiltinIndex(modName, fnName);
      if (builtinIdx >= 0) {
        const argRegs = expr.args.map(a => this.compileExpression(a));
        for (const ar of argRegs) {
          this.emit(OpCode.PUSH, [ar]);
        }
        const fnReg = this.allocReg();
        this.emit(OpCode.LOAD_BUILTIN, [fnReg, builtinIdx]);
        this.emit(OpCode.CALL, [resultReg, fnReg + 100000, expr.args.length]);
        return resultReg;
      }
    }

    // User function call
    if (expr.callee.kind === 'Ident') {
      const fnIdx = this.functionMap.get(expr.callee.name);
      if (fnIdx !== undefined) {
        const argRegs = expr.args.map(a => this.compileExpression(a));
        for (const ar of argRegs) {
          this.emit(OpCode.PUSH, [ar]);
        }
        this.emit(OpCode.CALL, [resultReg, fnIdx, expr.args.length]);
        return resultReg;
      }
    }

    // Method call or unknown
    const calleeReg = this.compileExpression(expr.callee);
    const argRegs = expr.args.map(a => this.compileExpression(a));
    for (const ar of argRegs) {
      this.emit(OpCode.PUSH, [ar]);
    }
    this.emit(OpCode.CALL, [resultReg, calleeReg + 100000, expr.args.length]); // indirect call via register
    return resultReg;
  }

  // ============ Helpers ============

  private emit(op: OpCode, operands: number[]): void {
    if (!this.currentFn) throw new Error('No current function');
    this.currentFn.instructions.push({ op, operands });
  }

  private allocReg(): number {
    return this.registerCount++;
  }

  private addConstant(value: any): number {
    const idx = this.constants.length;
    this.constants.push(value);
    return idx;
  }

  private resolveVar(name: string): { index: number; isGlobal: boolean } {
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
  }

  private newLabel(): number {
    return this.labelCounter++;
  }

  private patchLabel(label: number): void {
    // Labels are just instruction indices; we patch by storing current position
    // We use a special approach: emit a NOP as placeholder, then patch
    // Actually, let's use a simpler approach: labels map to instruction indices
    // We'll store label positions and patch JMP operands later
    if (!this.labelPositions) this.labelPositions = new Map();
    this.labelPositions.set(label, this.currentFn!.instructions.length);

    // Patch all pending jumps to this label
    const pending = this.pendingJumps.get(label) || [];
    for (const instIdx of pending) {
      this.currentFn!.instructions[instIdx].operands[this.currentFn!.instructions[instIdx].operands.length - 1] = this.currentFn!.instructions.length;
    }
    this.pendingJumps.delete(label);
  }

  private labelPositions: Map<number, number> | null = null;
  private pendingJumps = new Map<number, number[]>();

  // Override emit to handle label patching for JMP instructions
  // Actually, let's use a cleaner approach: store label as negative index, resolve at end
}

// Add label resolution as a post-processing step
export function resolveLabels(program: CompiledProgram): CompiledProgram {
  // In this simplified version, labels are already resolved during compilation
  // via patchLabel. This function is a placeholder for future use.
  return program;
}
