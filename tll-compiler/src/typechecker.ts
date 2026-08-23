/**
 * TLL Type Checker - Bootstrap Compiler (TypeScript)
 * Performs name resolution and type checking per TLL Spec 0.1 §3
 */

import * as AST from './ast';
import { stdlibModules } from './stdlib';

export interface TypeInfo {
  name: string;
  kind: 'primitive' | 'struct' | 'enum' | 'interface' | 'function' | 'alias' | 'generic';
  generics?: string[];
  fields?: Map<string, TypeInfo>;
  variants?: Map<string, TypeInfo[]>;
  params?: TypeInfo[];
  returnType?: TypeInfo;
}

export interface Symbol {
  name: string;
  type: TypeInfo;
  mutable: boolean;
  kind: 'variable' | 'function' | 'type' | 'param';
}

export class Scope {
  private symbols = new Map<string, Symbol>();
  private types = new Map<string, TypeInfo>();
  public parent: Scope | null;

  constructor(parent: Scope | null = null) {
    this.parent = parent;
  }

  public define(name: string, symbol: Symbol): void {
    this.symbols.set(name, symbol);
  }

  public lookup(name: string): Symbol | undefined {
    return this.symbols.get(name) || this.parent?.lookup(name);
  }

  public defineType(name: string, type: TypeInfo): void {
    this.types.set(name, type);
  }

  public lookupType(name: string): TypeInfo | undefined {
    return this.types.get(name) || this.parent?.lookupType(name);
  }
}

export class TypeChecker {
  private globalScope = new Scope();
  private currentScope: Scope = this.globalScope;
  public errors: string[] = [];

  constructor() {
    this.registerBuiltins();
  }

  private registerBuiltins(): void {
    const primitives = ['int', 'i8', 'i16', 'i32', 'i64', 'u8', 'u16', 'u32', 'u64', 'float', 'f32', 'str', 'char', 'bool', 'Null', 'Never', 'void'];
    for (const name of primitives) {
      this.globalScope.defineType(name, { name, kind: 'primitive' });
    }

    // Option and Result as generic types
    this.globalScope.defineType('Option', { name: 'Option', kind: 'generic', generics: ['T'] });
    this.globalScope.defineType('Result', { name: 'Result', kind: 'generic', generics: ['T', 'E'] });
    this.globalScope.defineType('List', { name: 'List', kind: 'generic', generics: ['T'] });
    this.globalScope.defineType('Map', { name: 'Map', kind: 'generic', generics: ['K', 'V'] });

    // Standard library modules (io, json, math, strings, arrays, convert)
    for (const [modName, mod] of Object.entries(stdlibModules)) {
      const fields = new Map<string, TypeInfo>();
      for (const fnName of Object.keys(mod)) {
        const returnType = this.inferStdlibReturnType(modName, fnName);
        fields.set(fnName, {
          name: fnName,
          kind: 'function',
          params: [],
          returnType,
        });
      }
      const modType: TypeInfo = { name: modName, kind: 'struct', fields };
      this.globalScope.define(modName, {
        name: modName,
        type: modType,
        mutable: false,
        kind: 'variable',
      });
    }

    // Global println for convenience
    this.globalScope.define('println', {
      name: 'println',
      type: { name: 'fn', kind: 'function', params: [{ name: 'str', kind: 'primitive' }], returnType: { name: 'void', kind: 'primitive' } },
      mutable: false,
      kind: 'function',
    });
  }

  private inferStdlibReturnType(modName: string, fnName: string): TypeInfo {
    const voidFns = ['println', 'print', 'forEach', 'fill', 'writeFile', 'appendFile', 'mkdir', 'remove', 'copyFile', 'rename'];
    const strFns = ['toUpper', 'toLower', 'trim', 'trimStart', 'trimEnd', 'substring', 'replace', 'replaceAll', 'repeat', 'padStart', 'padEnd', 'charAt', 'stringify', 'join', 'toString', 'toChar', 'readLine', 'readFile'];
    const intFns = ['length', 'indexOf', 'lastIndexOf', 'toInt', 'charCode', 'randomInt', 'fileSize'];
    const floatFns = ['sqrt', 'abs', 'floor', 'ceil', 'round', 'min', 'max', 'pow', 'sin', 'cos', 'tan', 'log', 'log2', 'log10', 'exp', 'pi', 'e', 'random', 'toFloat'];
    const boolFns = ['contains', 'startsWith', 'endsWith', 'isEmpty', 'some', 'every', 'includes', 'toBool', 'exists', 'isFile', 'isDir'];
    const listFns = ['split', 'lines', 'words', 'map', 'filter', 'sort', 'reverse', 'slice', 'concat', 'flat', 'range', 'push', 'pop', 'shift', 'unshift', 'listDir'];

    if (voidFns.includes(fnName)) return { name: 'void', kind: 'primitive' };
    if (strFns.includes(fnName)) return { name: 'str', kind: 'primitive' };
    if (intFns.includes(fnName)) return { name: 'int', kind: 'primitive' };
    if (floatFns.includes(fnName)) return { name: 'float', kind: 'primitive' };
    if (boolFns.includes(fnName)) return { name: 'bool', kind: 'primitive' };
    if (listFns.includes(fnName)) return { name: 'List', kind: 'generic', generics: ['T'] };
    return { name: 'auto', kind: 'primitive' };
  }

  public check(program: AST.Program): void {
    this.errors = [];
    for (const stmt of program.statements) {
      this.checkStatement(stmt);
    }
  }

  private pushScope(): Scope {
    const scope = new Scope(this.currentScope);
    this.currentScope = scope;
    return scope;
  }

  private popScope(): void {
    if (this.currentScope.parent) {
      this.currentScope = this.currentScope.parent;
    }
  }

  private checkStatement(stmt: AST.Statement): void {
    switch (stmt.kind) {
      case 'Let':
        this.checkLet(stmt);
        break;
      case 'Const':
        this.checkConst(stmt);
        break;
      case 'Fn':
        this.checkFn(stmt);
        break;
      case 'Return':
        this.checkReturn(stmt);
        break;
      case 'If':
        this.checkIf(stmt);
        break;
      case 'While':
        this.checkWhile(stmt);
        break;
      case 'For':
        this.checkFor(stmt);
        break;
      case 'ExpressionStatement':
        this.checkExpression(stmt.expression);
        break;
      case 'Block':
        this.checkBlock(stmt);
        break;
      case 'Struct':
        this.checkStruct(stmt);
        break;
      case 'Enum':
        this.checkEnum(stmt);
        break;
      case 'Import':
      case 'Break':
      case 'Continue':
      case 'Defer':
      case 'Interface':
      case 'Impl':
      case 'TypeAlias':
      case 'Agent':
      case 'Tool':
      case 'Intent':
      case 'Entity':
      case 'Api':
      case 'Application':
      case 'Package':
        // Placeholder: full checking in later versions
        break;
    }
  }

  private checkLet(stmt: AST.LetStatement): void {
    const valueType = this.checkExpression(stmt.value);
    if (stmt.typeAnnotation) {
      const declaredType = this.resolveType(stmt.typeAnnotation);
      if (!this.typesCompatible(declaredType, valueType)) {
        this.errors.push(`Line ${stmt.line}: type mismatch in let '${stmt.name}': expected ${declaredType.name}, got ${valueType.name}`);
      }
    }
    this.currentScope.define(stmt.name, {
      name: stmt.name,
      type: valueType,
      mutable: stmt.mutable,
      kind: 'variable',
    });
  }

  private checkConst(stmt: AST.ConstStatement): void {
    const valueType = this.checkExpression(stmt.value);
    this.currentScope.define(stmt.name, {
      name: stmt.name,
      type: valueType,
      mutable: false,
      kind: 'variable',
    });
  }

  private checkFn(stmt: AST.FnDeclaration): void {
    const paramTypes = stmt.params.map(p => this.resolveType(p.type));
    const returnType = stmt.returnType ? this.resolveType(stmt.returnType) : { name: 'void', kind: 'primitive' as const };

    const fnType: TypeInfo = {
      name: `fn(${paramTypes.map(p => p.name).join(', ')}) -> ${returnType.name}`,
      kind: 'function',
      params: paramTypes,
      returnType,
    };

    this.currentScope.define(stmt.name, {
      name: stmt.name,
      type: fnType,
      mutable: false,
      kind: 'function',
    });

    this.pushScope();
    for (let i = 0; i < stmt.params.length; i++) {
      this.currentScope.define(stmt.params[i].name, {
        name: stmt.params[i].name,
        type: paramTypes[i],
        mutable: true,
        kind: 'param',
      });
    }
    this.checkBlock(stmt.body);
    this.popScope();
  }

  private checkReturn(stmt: AST.ReturnStatement): void {
    if (stmt.value) {
      this.checkExpression(stmt.value);
    }
  }

  private checkIf(stmt: AST.IfStatement): void {
    this.checkExpression(stmt.condition);
    this.checkBlock(stmt.consequent);
    if (stmt.alternate) {
      if (stmt.alternate.kind === 'If') {
        this.checkIf(stmt.alternate);
      } else {
        this.checkBlock(stmt.alternate);
      }
    }
  }

  private checkWhile(stmt: AST.WhileStatement): void {
    this.checkExpression(stmt.condition);
    this.checkBlock(stmt.body);
  }

  private checkFor(stmt: AST.ForStatement): void {
    this.checkExpression(stmt.iterable);
    this.pushScope();
    this.currentScope.define(stmt.variable, {
      name: stmt.variable,
      type: { name: 'auto', kind: 'primitive' },
      mutable: true,
      kind: 'variable',
    });
    this.checkBlock(stmt.body);
    this.popScope();
  }

  private checkBlock(stmt: AST.BlockStatement): void {
    this.pushScope();
    for (const s of stmt.statements) {
      this.checkStatement(s);
    }
    this.popScope();
  }

  private checkStruct(stmt: AST.StructDeclaration): void {
    const fields = new Map<string, TypeInfo>();
    for (const field of stmt.fields) {
      fields.set(field.name, this.resolveType(field.type));
    }
    this.currentScope.defineType(stmt.name, { name: stmt.name, kind: 'struct', fields });
  }

  private checkEnum(stmt: AST.EnumDeclaration): void {
    const variants = new Map<string, TypeInfo[]>();
    for (const variant of stmt.variants) {
      variants.set(variant.name, variant.tupleTypes?.map(t => this.resolveType(t)) || []);
    }
    this.currentScope.defineType(stmt.name, { name: stmt.name, kind: 'enum', variants });
  }

  private checkExpression(expr: AST.Expression): TypeInfo {
    switch (expr.kind) {
      case 'Int':
        return { name: 'int', kind: 'primitive' };
      case 'Float':
        return { name: 'float', kind: 'primitive' };
      case 'String':
        return { name: 'str', kind: 'primitive' };
      case 'Bool':
        return { name: 'bool', kind: 'primitive' };
      case 'Null':
        return { name: 'Null', kind: 'primitive' };
      case 'Ident': {
        const symbol = this.currentScope.lookup(expr.name);
        if (!symbol) {
          this.errors.push(`Line ${expr.line}: undefined identifier '${expr.name}'`);
          return { name: 'unknown', kind: 'primitive' };
        }
        return symbol.type;
      }
      case 'Binary': {
        const left = this.checkExpression(expr.left);
        const right = this.checkExpression(expr.right);
        if (expr.operator === '+') {
          // String concatenation if either operand is string
          if (left.name === 'str' || right.name === 'str') {
            return { name: 'str', kind: 'primitive' };
          }
          if (!this.isNumeric(left) || !this.isNumeric(right)) {
            this.errors.push(`Line ${expr.line}: arithmetic operator '+' requires numeric or string operands`);
          }
          return left;
        }
        if (['-', '*', '/', '%', '**'].includes(expr.operator)) {
          if (!this.isNumeric(left) || !this.isNumeric(right)) {
            this.errors.push(`Line ${expr.line}: arithmetic operator '${expr.operator}' requires numeric operands`);
          }
          return left;
        }
        if (['==', '!=', '<', '>', '<=', '>='].includes(expr.operator)) {
          return { name: 'bool', kind: 'primitive' };
        }
        if (['&&', '||'].includes(expr.operator)) {
          return { name: 'bool', kind: 'primitive' };
        }
        return left;
      }
      case 'Unary':
        return this.checkExpression(expr.operand);
      case 'Call': {
        const calleeType = this.checkExpression(expr.callee);
        for (const arg of expr.args) {
          this.checkExpression(arg);
        }
        return calleeType.returnType || { name: 'void', kind: 'primitive' };
      }
      case 'Member': {
        const objType = this.checkExpression(expr.object);
        if (objType.fields && objType.fields.has(expr.property)) {
          return objType.fields.get(expr.property)!;
        }
        return { name: 'auto', kind: 'primitive' };
      }
      case 'Index':
        this.checkExpression(expr.object);
        this.checkExpression(expr.index);
        return { name: 'auto', kind: 'primitive' };
      case 'Array':
        for (const el of expr.elements) this.checkExpression(el);
        return { name: 'List', kind: 'generic', generics: ['T'] };
      case 'Map':
        for (const entry of expr.entries) {
          this.checkExpression(entry.key);
          this.checkExpression(entry.value);
        }
        return { name: 'Map', kind: 'generic', generics: ['K', 'V'] };
      case 'Tuple':
        for (const el of expr.elements) this.checkExpression(el);
        return { name: 'tuple', kind: 'primitive' };
      case 'StructLiteral':
        for (const f of expr.fields) this.checkExpression(f.value);
        return { name: expr.typeName, kind: 'struct' };
      case 'IfExpr':
        this.checkExpression(expr.condition);
        this.checkBlock(expr.consequent);
        return { name: 'auto', kind: 'primitive' };
      case 'Match':
        this.checkExpression(expr.scrutinee);
        for (const arm of expr.arms) this.checkExpression(arm.body);
        return { name: 'auto', kind: 'primitive' };
      case 'Lambda':
        return { name: 'fn', kind: 'function' };
      case 'Await':
      case 'Spawn':
      case 'Pipe':
      case 'Range':
      case 'Some':
      case 'None':
      case 'Ok':
      case 'Err':
      case 'Self':
      case 'BlockExpr':
        return { name: 'auto', kind: 'primitive' };
      default:
        return { name: 'unknown', kind: 'primitive' };
    }
  }

  private resolveType(typeNode: AST.TypeNode): TypeInfo {
    switch (typeNode.kind) {
      case 'Named':
        return this.currentScope.lookupType(typeNode.name) || { name: typeNode.name, kind: 'primitive' };
      case 'List':
        return { name: 'List', kind: 'generic', generics: ['T'] };
      case 'Map':
        return { name: 'Map', kind: 'generic', generics: ['K', 'V'] };
      case 'Array':
        return { name: 'array', kind: 'primitive' };
      case 'Tuple':
        return { name: 'tuple', kind: 'primitive' };
      case 'Function':
        return { name: 'fn', kind: 'function', params: typeNode.params.map(p => this.resolveType(p)), returnType: this.resolveType(typeNode.returnType) };
      case 'Optional':
        return { name: 'Option', kind: 'generic', generics: ['T'] };
      case 'Reference':
        return this.resolveType(typeNode.inner);
      case 'Result':
        return { name: 'Result', kind: 'generic', generics: ['T', 'E'] };
      case 'Void':
        return { name: 'void', kind: 'primitive' };
      default:
        return { name: 'unknown', kind: 'primitive' };
    }
  }

  private isNumeric(type: TypeInfo): boolean {
    return ['int', 'i8', 'i16', 'i32', 'i64', 'u8', 'u16', 'u32', 'u64', 'float', 'f32'].includes(type.name);
  }

  private typesCompatible(a: TypeInfo, b: TypeInfo): boolean {
    if (a.name === b.name) return true;
    if (this.isNumeric(a) && this.isNumeric(b)) return true;
    if (a.name === 'auto' || b.name === 'auto') return true;
    return false;
  }
}
