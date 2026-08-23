/**
 * TLL Runtime - Bootstrap Compiler (TypeScript)
 * Bytecode Virtual Machine per TLL Spec 0.1 §13
 */

import { CompiledProgram, OpCode, Instruction, CompiledFunction } from './compiler';

interface CallFrame {
  function: CompiledFunction;
  pc: number;
  registers: any[];
  locals: any[];
  argStack: any[];
}

export class Runtime {
  private program: CompiledProgram;
  private callStack: CallFrame[] = [];
  private globals: Map<string, any> = new Map();

  constructor(program: CompiledProgram) {
    this.program = program;
  }

  public run(): any {
    const mainFn = this.program.functions[this.program.mainFunctionIndex];
    const frame: CallFrame = {
      function: mainFn,
      pc: 0,
      registers: new Array(256).fill(undefined),
      locals: new Array(mainFn.localCount).fill(undefined),
      argStack: [],
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

        if (fnIdx >= 0 && fnIdx < this.program.functions.length) {
          const fn = this.program.functions[fnIdx];
          const newFrame: CallFrame = {
            function: fn,
            pc: 0,
            registers: new Array(256).fill(undefined),
            locals: new Array(fn.localCount).fill(undefined),
            argStack: [],
          };
          for (let i = 0; i < argCount && i < fn.paramCount; i++) {
            newFrame.locals[i] = args[i];
          }
          this.callStack.push(newFrame);
        } else {
          // Indirect call (function value)
          const fnValue = regs[b] as Function;
          if (typeof fnValue === 'function') {
            regs[a] = fnValue(...args);
          }
        }
        break;
      }

      case OpCode.RET: {
        const returnValue = regs[a];
        this.callStack.pop();
        if (this.callStack.length > 0) {
          // Store return value in caller's register (simplified)
          // The caller will read from a known location
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

      default:
        throw new RuntimeError(`Unknown opcode: ${inst.op}`);
    }
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
