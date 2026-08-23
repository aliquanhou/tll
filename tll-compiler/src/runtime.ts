/**
 * TLL Runtime - Bootstrap Compiler (TypeScript)
 * Bytecode Virtual Machine per TLL Spec 0.1 §13
 */

import { CompiledProgram, OpCode, Instruction, CompiledFunction } from './compiler';
import { builtinFunctions } from './stdlib';

interface CallFrame {
  function: CompiledFunction;
  pc: number;
  registers: any[];
  locals: any[];
  argStack: any[];
  tryStack: number[]; // stack of catch block pc offsets
  returnReg: number; // register in caller to store return value
}

export class Runtime {
  private program: CompiledProgram;
  private callStack: CallFrame[] = [];
  private globals: any[] = [];
  private toolRegistry: Map<string, number> = new Map(); // tool name -> function index

  // Global runtime instance for stdlib callbacks (e.g. agent tool calling)
  static current: Runtime | null = null;

  constructor(program: CompiledProgram) {
    this.program = program;
    this.globals = new Array(program.globalCount || 0).fill(undefined);
    Runtime.current = this;
    // Expose to stdlib via global (avoids circular dependency)
    (globalThis as any).__tll_runtime = this;
  }

  public run(): any {
    // Register all tool functions
    this.toolRegistry.clear();
    for (let i = 0; i < this.program.functions.length; i++) {
      const fn = this.program.functions[i];
      if (fn.isTool) {
        this.toolRegistry.set(fn.name, i);
      }
    }

    const mainFn = this.program.functions[this.program.mainFunctionIndex];
    const frame: CallFrame = {
      function: mainFn,
      pc: 0,
      registers: new Array(256).fill(undefined),
      locals: new Array(mainFn.localCount).fill(undefined),
      argStack: [],
      tryStack: [],
      returnReg: -1,
    };
    this.callStack.push(frame);

    while (this.callStack.length > 0) {
      const current = this.callStack[this.callStack.length - 1];
      if (current.pc >= current.function.instructions.length) {
        this.callStack.pop();
        continue;
      }

      const inst = current.function.instructions[current.pc];
      current.pc++;

      const result = this.executeInstruction(inst, current);
      if (result === 'HALT') return undefined;
    }

    return undefined;
  }

  /**
   * Call a user-defined TLL function by name (used by stdlib for tool calling).
   * Returns the function's return value.
   */
  public callUserFunction(name: string, args: any[]): any {
    // Find function index
    let fnIdx = this.toolRegistry.get(name);
    if (fnIdx === undefined) {
      for (let i = 0; i < this.program.functions.length; i++) {
        if (this.program.functions[i].name === name) {
          fnIdx = i;
          break;
        }
      }
    }
    if (fnIdx === undefined) {
      throw new Error(`callUserFunction: function '${name}' not found`);
    }

    const fn = this.program.functions[fnIdx];
    const frame: CallFrame = {
      function: fn,
      pc: 0,
      registers: new Array(256).fill(undefined),
      locals: new Array(fn.localCount).fill(undefined),
      argStack: [],
      tryStack: [],
      returnReg: 0,
    };
    // Set parameters
    for (let i = 0; i < args.length && i < fn.paramCount; i++) {
      frame.locals[i] = args[i];
    }

    // Save current call stack and execute function in isolation
    const savedStack = this.callStack;
    this.callStack = [frame];

    let returnValue: any = undefined;
    while (this.callStack.length > 0) {
      const cur = this.callStack[this.callStack.length - 1];
      if (cur.pc >= cur.function.instructions.length) {
        // Function ended without explicit return
        this.callStack.pop();
        break;
      }
      const inst = cur.function.instructions[cur.pc];
      cur.pc++;
      if (inst.op === OpCode.RET) {
        returnValue = cur.registers[inst.operands[0]];
        this.callStack.pop();
        break;
      }
      const result = this.executeInstruction(inst, cur);
      if (result === 'HALT') break;
    }

    // Restore call stack
    this.callStack = savedStack;
    return returnValue;
  }

  /** Get list of registered tool function names */
  public getToolNames(): string[] {
    return Array.from(this.toolRegistry.keys());
  }

  private executeInstruction(inst: Instruction, frame: CallFrame): string | void {
    const [a, b, c] = inst.operands;
    const regs = frame.registers;
    const consts = this.program.constants;

    switch (inst.op) {
      case OpCode.LOAD_CONST:
        regs[a] = consts[b];
        break;

      case OpCode.LOAD_VAR:
        regs[a] = frame.locals[b];
        break;

      case OpCode.STORE_VAR:
        frame.locals[a] = regs[b];
        break;

      case OpCode.LOAD_GLOBAL:
        regs[a] = this.globals[b];
        break;

      case OpCode.STORE_GLOBAL:
        this.globals[a] = regs[b];
        break;

      case OpCode.ADD:
        regs[a] = this.add(regs[b], regs[c]);
        break;

      case OpCode.SUB:
        regs[a] = regs[b] - regs[c];
        break;

      case OpCode.MUL:
        regs[a] = regs[b] * regs[c];
        break;

      case OpCode.DIV:
        regs[a] = regs[b] / regs[c];
        break;

      case OpCode.MOD:
        regs[a] = regs[b] % regs[c];
        break;

      case OpCode.POW:
        regs[a] = Math.pow(regs[b], regs[c]);
        break;

      case OpCode.EQ:
        regs[a] = regs[b] === regs[c];
        break;

      case OpCode.NEQ:
        regs[a] = regs[b] !== regs[c];
        break;

      case OpCode.LT:
        regs[a] = regs[b] < regs[c];
        break;

      case OpCode.GT:
        regs[a] = regs[b] > regs[c];
        break;

      case OpCode.LE:
        regs[a] = regs[b] <= regs[c];
        break;

      case OpCode.GE:
        regs[a] = regs[b] >= regs[c];
        break;

      case OpCode.AND:
        regs[a] = regs[b] && regs[c];
        break;

      case OpCode.OR:
        regs[a] = regs[b] || regs[c];
        break;

      case OpCode.NOT:
        regs[a] = !regs[b];
        break;

      case OpCode.NEG:
        regs[a] = -regs[b];
        break;

      case OpCode.JMP:
        frame.pc = a;
        break;

      case OpCode.JMP_IF_FALSE:
        if (!regs[a]) {
          frame.pc = b;
        }
        break;

      case OpCode.CALL: {
        const fnIdx = b;
        const argCount = c;
        const args: any[] = [];
        for (let i = 0; i < argCount; i++) {
          args.unshift(frame.argStack.pop());
        }

        // Check for indirect call first (register holds a function value, e.g. builtin)
        const possibleFn = regs[b];
        if (typeof possibleFn === 'function') {
          try {
            regs[a] = possibleFn(...args);
          } catch (e: any) {
            const errMsg = e instanceof Error ? e.message : String(e);
            this.throwException(frame, errMsg);
          }
        } else if (fnIdx >= 0 && fnIdx < this.program.functions.length) {
          const fn = this.program.functions[fnIdx];
          const newFrame: CallFrame = {
            function: fn,
            pc: 0,
            registers: new Array(256).fill(undefined),
            locals: new Array(fn.localCount).fill(undefined),
            argStack: [],
            tryStack: [],
            returnReg: a,
          };
          for (let i = 0; i < argCount && i < fn.paramCount; i++) {
            newFrame.locals[i] = args[i];
          }
          this.callStack.push(newFrame);
        }
        break;
      }

      case OpCode.RET: {
        const returnValue = regs[a];
        const returnReg = frame.returnReg;
        this.callStack.pop();
        if (this.callStack.length > 0 && returnReg >= 0) {
          const callerFrame = this.callStack[this.callStack.length - 1];
          callerFrame.registers[returnReg] = returnValue;
        }
        break;
      }

      case OpCode.PRINT:
        process.stdout.write(this.stringify(regs[a]));
        break;

      case OpCode.PRINTLN:
        console.log(this.stringify(regs[a]));
        break;

      case OpCode.MAKE_ARRAY: {
        const elements: any[] = [];
        for (let i = 0; i < b; i++) {
          elements.unshift(frame.argStack.pop());
        }
        const arr = elements;
        (arr as any).length = elements.length;
        regs[a] = arr;
        break;
      }

      case OpCode.MAKE_MAP: {
        const map: Record<string, any> = {};
        for (let i = 0; i < b; i++) {
          const v = frame.argStack.pop();
          const k = frame.argStack.pop();
          map[String(k)] = v;
        }
        regs[a] = map;
        break;
      }

      case OpCode.INDEX_GET:
        if (Array.isArray(regs[b])) {
          regs[a] = regs[b][regs[c]];
        } else if (typeof regs[b] === 'object' && regs[b] !== null) {
          regs[a] = regs[b][regs[c]];
        }
        break;

      case OpCode.INDEX_SET:
        if (Array.isArray(regs[a])) {
          regs[a][regs[b]] = regs[c];
        } else if (typeof regs[a] === 'object' && regs[a] !== null) {
          regs[a][regs[b]] = regs[c];
        }
        break;

      case OpCode.MEMBER_GET: {
        const obj = regs[b];
        const propName = consts[c];
        if (propName === 'length' && Array.isArray(obj)) {
          regs[a] = obj.length;
        } else if (obj !== null && obj !== undefined) {
          regs[a] = obj[propName];
        } else {
          regs[a] = undefined;
        }
        break;
      }

      case OpCode.MEMBER_SET: {
        const obj = regs[a];
        const propName = consts[b];
        if (obj !== null && obj !== undefined) {
          obj[propName] = regs[c];
        }
        break;
      }

      case OpCode.PUSH:
        frame.argStack.push(regs[a]);
        break;

      case OpCode.CONCAT:
        regs[a] = String(regs[b]) + String(regs[c]);
        break;

      case OpCode.HALT:
        return 'HALT';

      case OpCode.NOP:
        break;

      case OpCode.LOAD_BUILTIN: {
        const fn = builtinFunctions[b];
        if (typeof fn === 'function') {
          regs[a] = fn;
        } else {
          throw new RuntimeError('Unknown builtin index: ' + b);
        }
        break;
      }

      case OpCode.TRY_START:
        frame.tryStack.push(a); // a = catch label (pc offset)
        break;

      case OpCode.TRY_END:
        frame.tryStack.pop();
        break;

      case OpCode.THROW: {
        const errorValue = regs[a];
        this.throwException(frame, errorValue);
        break;
      }

      default:
        throw new RuntimeError(`Unknown opcode: ${inst.op}`);
    }
  }

  private throwException(frame: CallFrame, errorValue: any): void {
    // Search current frame's try stack first
    while (frame.tryStack.length > 0) {
      const catchPc = frame.tryStack.pop()!;
      frame.pc = catchPc;
      frame.registers[0] = errorValue; // error value goes to r0
      return;
    }

    // Search up the call stack
    while (this.callStack.length > 1) {
      this.callStack.pop();
      const parentFrame = this.callStack[this.callStack.length - 1];
      if (parentFrame.tryStack.length > 0) {
        const catchPc = parentFrame.tryStack.pop()!;
        parentFrame.pc = catchPc;
        parentFrame.registers[0] = errorValue;
        return;
      }
    }

    // No handler found - fatal error
    const errMsg = typeof errorValue === 'string' ? errorValue :
                   errorValue instanceof Error ? errorValue.message :
                   JSON.stringify(errorValue);
    throw new RuntimeError('Uncaught exception: ' + errMsg);
  }

  private add(a: any, b: any): any {
    if (typeof a === 'string' || typeof b === 'string') {
      return String(a) + String(b);
    }
    return a + b;
  }

  private stringify(value: any): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (Array.isArray(value)) return '[' + value.map(v => this.stringify(v)).join(', ') + ']';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }
}

export class RuntimeError extends Error {
  constructor(message: string) {
    super(`Runtime error: ${message}`);
    this.name = 'RuntimeError';
  }
}
