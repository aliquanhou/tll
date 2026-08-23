/**
 * TLL Parser - Bootstrap Compiler (TypeScript)
 * Recursive descent parser with Pratt operator precedence
 */

import { Token, TokenType, LexerError } from './lexer';
import * as AST from './ast';

export class Parser {
  private tokens: Token[] = [];
  private pos: number = 0;

  constructor() {}

  public parse(source: string): AST.Program {
    const { Lexer } = require('./lexer');
    const lexer = new Lexer(source);
    this.tokens = lexer.tokenize();
    this.pos = 0;

    const statements: AST.Statement[] = [];
    while (!this.isAtEnd()) {
      const stmt = this.parseStatement();
      if (stmt) statements.push(stmt);
    }

    return { statements };
  }

  // ============ Token helpers ============

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private previous(): Token {
    return this.tokens[this.pos - 1];
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.pos++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private check(type: TokenType): boolean {
    return this.peek().type === type;
  }

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private expect(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();
    throw new ParserError(
      `Expected ${message}, got '${this.peek().value}' (${this.peek().type})`,
      this.peek().line,
      this.peek().column
    );
  }

  // ============ Statement parsing ============

  private parseStatement(): AST.Statement | null {
    const token = this.peek();

    switch (token.type) {
      case TokenType.Let:
      case TokenType.Mut:
        return this.parseLetStatement();
      case TokenType.Const:
        return this.parseConstStatement();
      case TokenType.Fn:
        return this.parseFnDeclaration(false);
      case TokenType.Pub:
        return this.parsePubDeclaration();
      case TokenType.Return:
        return this.parseReturnStatement();
      case TokenType.If:
        return this.parseIfStatement();
      case TokenType.While:
        return this.parseWhileStatement();
      case TokenType.For:
        return this.parseForStatement();
      case TokenType.Break:
        return this.parseBreakStatement();
      case TokenType.Continue:
        return this.parseContinueStatement();
      case TokenType.Defer:
        return this.parseDeferStatement();
      case TokenType.Try:
        return this.parseTryStatement();
      case TokenType.Throw:
        return this.parseThrowStatement();
      case TokenType.Import:
        return this.parseImportStatement();
      case TokenType.From:
        return this.parseFromImportStatement();
      case TokenType.Export:
        return this.parseExportStatement();
      case TokenType.Struct:
        return this.parseStructDeclaration(false);
      case TokenType.Enum:
        return this.parseEnumDeclaration(false);
      case TokenType.Interface:
        return this.parseInterfaceDeclaration(false);
      case TokenType.Impl:
        return this.parseImplDeclaration();
      case TokenType.Type:
        return this.parseTypeAlias(false);
      case TokenType.Agent:
        return this.parseAgentDeclaration();
      case TokenType.Tool:
        return this.parseToolDeclaration();
      case TokenType.Workflow:
        return this.parseWorkflowDeclaration();
      case TokenType.Intent:
        return this.parseIntentDeclaration();
      case TokenType.Entity:
        return this.parseEntityDeclaration();
      case TokenType.Api:
        return this.parseApiDeclaration();
      case TokenType.Application:
        return this.parseApplicationDeclaration();
      case TokenType.Package:
        return this.parsePackageDeclaration();
      case TokenType.LBrace:
        return this.parseBlockStatement();
      case TokenType.Semicolon:
        this.advance();
        return null;
      default:
        return this.parseExpressionStatement();
    }
  }

  private parsePubDeclaration(): AST.Statement {
    this.advance(); // consume pub
    const token = this.peek();

    switch (token.type) {
      case TokenType.Fn:
        return this.parseFnDeclaration(true);
      case TokenType.Struct:
        return this.parseStructDeclaration(true);
      case TokenType.Enum:
        return this.parseEnumDeclaration(true);
      case TokenType.Interface:
        return this.parseInterfaceDeclaration(true);
      case TokenType.Type:
        return this.parseTypeAlias(true);
      default:
        throw new ParserError(`Unexpected 'pub' before ${token.type}`, token.line, token.column);
    }
  }

  private parseLetStatement(): AST.LetStatement {
    const start = this.peek();
    const isMut = this.match(TokenType.Mut);
    if (!isMut) this.expect(TokenType.Let, "'let'");

    const name = this.expect(TokenType.Ident, "identifier").value;
    let typeAnnotation: AST.TypeNode | undefined;

    if (this.match(TokenType.Colon)) {
      typeAnnotation = this.parseType();
    }

    this.expect(TokenType.Eq, "'='");
    const value = this.parseExpression();
    this.match(TokenType.Semicolon);

    return {
      kind: 'Let',
      mutable: isMut,
      name,
      typeAnnotation,
      value,
      line: start.line,
      column: start.column,
    };
  }

  private parseConstStatement(): AST.ConstStatement {
    const start = this.advance(); // const
    const name = this.expect(TokenType.Ident, "identifier").value;
    let typeAnnotation: AST.TypeNode | undefined;

    if (this.match(TokenType.Colon)) {
      typeAnnotation = this.parseType();
    }

    this.expect(TokenType.Eq, "'='");
    const value = this.parseExpression();
    this.match(TokenType.Semicolon);

    return {
      kind: 'Const',
      name,
      typeAnnotation,
      value,
      line: start.line,
      column: start.column,
    };
  }

  private parseFnDeclaration(isPub: boolean): AST.FnDeclaration {
    const start = this.peek();
    const isAsync = this.match(TokenType.Async);
    this.expect(TokenType.Fn, "'fn'");
    const name = this.expect(TokenType.Ident, "function name").value;

    this.expect(TokenType.LParen, "'('");
    const params = this.parseParams();
    this.expect(TokenType.RParen, "')'");

    let returnType: AST.TypeNode | undefined;
    if (this.match(TokenType.Arrow)) {
      returnType = this.parseType();
    }

    const body = this.parseBlockStatement();

    return {
      kind: 'Fn',
      isPub,
      isAsync,
      name,
      params,
      returnType,
      body,
      line: start.line,
      column: start.column,
    };
  }

  private parseParams(): AST.Param[] {
    const params: AST.Param[] = [];
    if (this.check(TokenType.RParen)) return params;

    do {
      const name = this.expect(TokenType.Ident, "parameter name").value;
      this.expect(TokenType.Colon, "':'");
      const type = this.parseType();
      params.push({ name, type });
    } while (this.match(TokenType.Comma));

    return params;
  }

  private parseReturnStatement(): AST.ReturnStatement {
    const start = this.advance(); // return
    let value: AST.Expression | undefined;
    if (!this.check(TokenType.Semicolon) && !this.check(TokenType.RBrace)) {
      value = this.parseExpression();
    }
    this.match(TokenType.Semicolon);
    return { kind: 'Return', value, line: start.line, column: start.column };
  }

  private parseIfStatement(): AST.IfStatement {
    const start = this.advance(); // if
    const condition = this.parseExpression();
    const consequent = this.parseBlockStatement();
    let alternate: AST.BlockStatement | AST.IfStatement | undefined;

    if (this.match(TokenType.Else)) {
      if (this.check(TokenType.If)) {
        alternate = this.parseIfStatement();
      } else {
        alternate = this.parseBlockStatement();
      }
    }

    return { kind: 'If', condition, consequent, alternate, line: start.line, column: start.column };
  }

  private parseWhileStatement(): AST.WhileStatement {
    const start = this.advance(); // while
    const condition = this.parseExpression();
    const body = this.parseBlockStatement();
    return { kind: 'While', condition, body, line: start.line, column: start.column };
  }

  private parseForStatement(): AST.ForStatement {
    const start = this.advance(); // for
    const variable = this.expect(TokenType.Ident, "loop variable").value;
    this.expect(TokenType.In, "'in'");
    const iterable = this.parseExpression();
    const body = this.parseBlockStatement();
    return { kind: 'For', variable, iterable, body, line: start.line, column: start.column };
  }

  private parseBreakStatement(): AST.BreakStatement {
    const start = this.advance();
    this.match(TokenType.Semicolon);
    return { kind: 'Break', line: start.line, column: start.column };
  }

  private parseContinueStatement(): AST.ContinueStatement {
    const start = this.advance();
    this.match(TokenType.Semicolon);
    return { kind: 'Continue', line: start.line, column: start.column };
  }

  private parseDeferStatement(): AST.DeferStatement {
    const start = this.advance(); // defer
    const expression = this.parseExpression();
    this.match(TokenType.Semicolon);
    return { kind: 'Defer', expression, line: start.line, column: start.column };
  }

  private parseTryStatement(): AST.TryStatement {
    const start = this.advance(); // try
    const body = this.parseBlockStatement();

    let catchParam: string | undefined;
    let catchBody: AST.BlockStatement | undefined;

    if (this.match(TokenType.Catch)) {
      // catch err { ... } or catch { ... }
      if (this.check(TokenType.Ident)) {
        catchParam = this.advance().value;
      }
      catchBody = this.parseBlockStatement();
    }

    let finallyBody: AST.BlockStatement | undefined;
    if (this.match(TokenType.Finally)) {
      finallyBody = this.parseBlockStatement();
    }

    if (!catchBody && !finallyBody) {
      throw new ParserError('try must have catch or finally', start.line, start.column);
    }

    return {
      kind: 'Try',
      body,
      catchParam,
      catchBody,
      finallyBody,
      line: start.line,
      column: start.column,
    };
  }

  private parseThrowStatement(): AST.ThrowStatement {
    const start = this.advance(); // throw
    const value = this.parseExpression();
    this.match(TokenType.Semicolon);
    return { kind: 'Throw', value, line: start.line, column: start.column };
  }

  private parseImportStatement(): AST.ImportStatement {
    const start = this.advance(); // import

    // from X import Y, Z
    if (this.check(TokenType.Ident) && this.peekAtNext()?.type === TokenType.Ident) {
      // Could be "import module" or "from module import ..."
      // TLL uses: import module, from module import items
    }

    if (this.match(TokenType.Ident)) {
      // import module [as alias]
      const modulePath = this.previous().value;
      let alias: string | undefined;
      if (this.match(TokenType.As)) {
        alias = this.expect(TokenType.Ident, "alias name").value;
      }
      this.match(TokenType.Semicolon);
      return { kind: 'Import', modulePath, alias, isWildcard: false, line: start.line, column: start.column };
    }

    // from "module" import a, b, c
    // from "module" import *
    this.expect(TokenType.From, "'from' or module name");
    const modulePath = this.expect(TokenType.String, "module path string").value;
    this.expect(TokenType.Import, "'import'");

    if (this.match(TokenType.Star)) {
      this.match(TokenType.Semicolon);
      return { kind: 'Import', modulePath, isWildcard: true, line: start.line, column: start.column };
    }

    const namedImports: string[] = [];
    do {
      namedImports.push(this.expect(TokenType.Ident, "import name").value);
    } while (this.match(TokenType.Comma));

    this.match(TokenType.Semicolon);
    return { kind: 'Import', modulePath, namedImports, isWildcard: false, line: start.line, column: start.column };
  }

  private parseFromImportStatement(): AST.ImportStatement {
    const start = this.advance(); // from
    const modulePath = this.expect(TokenType.String, "module path string").value;
    this.expect(TokenType.Import, "'import'");

    if (this.match(TokenType.Star)) {
      this.match(TokenType.Semicolon);
      return { kind: 'Import', modulePath, isWildcard: true, line: start.line, column: start.column };
    }

    const namedImports: string[] = [];
    do {
      namedImports.push(this.expect(TokenType.Ident, "import name").value);
    } while (this.match(TokenType.Comma));

    this.match(TokenType.Semicolon);
    return { kind: 'Import', modulePath, namedImports, isWildcard: false, line: start.line, column: start.column };
  }

  private parseExportStatement(): AST.ExportStatement {
    const start = this.advance(); // export
    const next = this.peek();
    let declaration: AST.Statement;

    switch (next.type) {
      case TokenType.Fn:
        declaration = this.parseFnDeclaration(false);
        break;
      case TokenType.Const:
        declaration = this.parseConstStatement();
        break;
      case TokenType.Let:
      case TokenType.Mut:
        declaration = this.parseLetStatement();
        break;
      case TokenType.Struct:
        declaration = this.parseStructDeclaration(false);
        break;
      default:
        throw new ParserError(`Cannot export ${next.type}`, next.line, next.column);
    }

    return { kind: 'Export', declaration, line: start.line, column: start.column };
  }

  private peekAtNext(): Token | undefined {
    return this.tokens[this.pos + 1];
  }

  private parseStructDeclaration(isPub: boolean): AST.StructDeclaration {
    const start = this.advance(); // struct
    const name = this.expect(TokenType.Ident, "struct name").value;
    this.expect(TokenType.LBrace, "'{'");
    const fields = this.parseFieldDefs();
    this.expect(TokenType.RBrace, "'}'");
    return { kind: 'Struct', isPub, name, fields, line: start.line, column: start.column };
  }

  private parseFieldDefs(): AST.FieldDef[] {
    const fields: AST.FieldDef[] = [];
    while (!this.check(TokenType.RBrace) && !this.isAtEnd()) {
      const name = this.expect(TokenType.Ident, "field name").value;
      this.expect(TokenType.Colon, "':'");
      const type = this.parseType();
      let defaultValue: AST.Expression | undefined;
      if (this.match(TokenType.Eq)) {
        defaultValue = this.parseExpression();
      }
      fields.push({ name, type, defaultValue });
      this.match(TokenType.Comma);
    }
    return fields;
  }

  private parseEnumDeclaration(isPub: boolean): AST.EnumDeclaration {
    const start = this.advance(); // enum
    const name = this.expect(TokenType.Ident, "enum name").value;
    this.expect(TokenType.LBrace, "'{'");
    const variants: AST.EnumVariant[] = [];

    while (!this.check(TokenType.RBrace) && !this.isAtEnd()) {
      const variantName = this.expect(TokenType.Ident, "variant name").value;
      let variant: AST.EnumVariant;

      if (this.match(TokenType.LParen)) {
        const tupleTypes: AST.TypeNode[] = [];
        while (!this.check(TokenType.RParen)) {
          tupleTypes.push(this.parseType());
          if (!this.match(TokenType.Comma)) break;
        }
        this.expect(TokenType.RParen, "')'");
        variant = { name: variantName, kind: 'tuple', tupleTypes };
      } else if (this.match(TokenType.LBrace)) {
        const fields = this.parseFieldDefs();
        this.expect(TokenType.RBrace, "'}'");
        variant = { name: variantName, kind: 'struct', fields };
      } else {
        variant = { name: variantName, kind: 'unit' };
      }

      variants.push(variant);
      this.match(TokenType.Comma);
    }

    this.expect(TokenType.RBrace, "'}'");
    return { kind: 'Enum', isPub, name, variants, line: start.line, column: start.column };
  }

  private parseInterfaceDeclaration(isPub: boolean): AST.InterfaceDeclaration {
    const start = this.advance(); // interface
    const name = this.expect(TokenType.Ident, "interface name").value;
    this.expect(TokenType.LBrace, "'{'");
    const methods: AST.MethodSignature[] = [];

    while (!this.check(TokenType.RBrace) && !this.isAtEnd()) {
      const isAsync = this.match(TokenType.Async);
      this.expect(TokenType.Fn, "'fn'");
      const methodName = this.expect(TokenType.Ident, "method name").value;
      this.expect(TokenType.LParen, "'('");
      const params = this.parseParams();
      this.expect(TokenType.RParen, "')'");
      let returnType: AST.TypeNode | undefined;
      if (this.match(TokenType.Arrow)) {
        returnType = this.parseType();
      }
      let body: AST.BlockStatement | undefined;
      if (this.check(TokenType.LBrace)) {
        body = this.parseBlockStatement();
      } else {
        this.match(TokenType.Semicolon);
      }
      methods.push({ name: methodName, params, returnType, isAsync, body });
    }

    this.expect(TokenType.RBrace, "'}'");
    return { kind: 'Interface', isPub, name, methods, line: start.line, column: start.column };
  }

  private parseImplDeclaration(): AST.ImplDeclaration {
    const start = this.advance(); // impl
    let interfaceName: string | undefined;
    let targetType: string;

    const first = this.expect(TokenType.Ident, "type or interface name").value;
    if (this.match(TokenType.For)) {
      interfaceName = first;
      targetType = this.expect(TokenType.Ident, "target type name").value;
    } else {
      targetType = first;
    }

    this.expect(TokenType.LBrace, "'{'");
    const methods: AST.FnDeclaration[] = [];
    while (!this.check(TokenType.RBrace) && !this.isAtEnd()) {
      methods.push(this.parseFnDeclaration(false));
    }
    this.expect(TokenType.RBrace, "'}'");

    return { kind: 'Impl', interfaceName, targetType, methods, line: start.line, column: start.column };
  }

  private parseTypeAlias(isPub: boolean): AST.TypeAliasStatement {
    const start = this.advance(); // type
    const name = this.expect(TokenType.Ident, "type name").value;
    this.expect(TokenType.Eq, "'='");
    const type = this.parseType();
    this.match(TokenType.Semicolon);
    return { kind: 'TypeAlias', isPub, name, type, line: start.line, column: start.column };
  }

  private parseAgentDeclaration(): AST.AgentDeclaration {
    const start = this.advance(); // agent
    const name = this.expect(TokenType.Ident, "agent name").value;
    this.expect(TokenType.LBrace, "'{'");
    const properties = this.parsePropertyBlock();
    this.expect(TokenType.RBrace, "'}'");
    return { kind: 'Agent', name, properties, line: start.line, column: start.column };
  }

  private parseToolDeclaration(): AST.ToolDeclaration {
    const start = this.advance(); // tool
    this.match(TokenType.Fn); // optional 'fn' keyword: tool fn name()
    const name = this.expect(TokenType.Ident, "tool name").value;
    this.expect(TokenType.LParen, "'('");
    const params = this.parseParams();
    this.expect(TokenType.RParen, "')'");
    let returnType: AST.TypeNode | undefined;
    if (this.match(TokenType.Arrow)) {
      returnType = this.parseType();
    }
    const body = this.parseBlockStatement();
    return { kind: 'Tool', name, params, returnType, body, line: start.line, column: start.column };
  }

  private parseWorkflowDeclaration(): AST.WorkflowDeclaration {
    const start = this.advance(); // workflow
    const name = this.expect(TokenType.Ident, "workflow name").value;
    this.expect(TokenType.LBrace, "'{'");
    const properties = this.parsePropertyBlock();
    this.expect(TokenType.RBrace, "'}'");
    return { kind: 'Workflow', name, properties, line: start.line, column: start.column };
  }

  private parseIntentDeclaration(): AST.IntentDeclaration {
    const start = this.advance(); // intent
    const name = this.expect(TokenType.Ident, "intent name").value;
    this.expect(TokenType.LParen, "'('");
    const params = this.parseParams();
    this.expect(TokenType.RParen, "')'");
    let returnType: AST.TypeNode | undefined;
    if (this.match(TokenType.Arrow)) {
      returnType = this.parseType();
    }
    this.expect(TokenType.LBrace, "'{'");
    const properties = this.parsePropertyBlock();
    this.expect(TokenType.RBrace, "'}'");
    return { kind: 'Intent', name, params, returnType, properties, line: start.line, column: start.column };
  }

  private parseEntityDeclaration(): AST.EntityDeclaration {
    const start = this.advance(); // entity
    const name = this.expect(TokenType.Ident, "entity name").value;
    this.expect(TokenType.LBrace, "'{'");
    const fields: AST.EntityField[] = [];

    while (!this.check(TokenType.RBrace) && !this.isAtEnd()) {
      const fieldName = this.expect(TokenType.Ident, "field name").value;
      this.expect(TokenType.Colon, "':'");
      const type = this.parseType();
      const attributes: Record<string, AST.Expression> = {};
      if (this.match(TokenType.Eq)) {
        // parse attributes like primary_key(auto_increment)
        const attrExpr = this.parseExpression();
        attributes['default'] = attrExpr;
      }
      fields.push({ name: fieldName, type, attributes });
      this.match(TokenType.Comma);
    }

    this.expect(TokenType.RBrace, "'}'");
    return { kind: 'Entity', name, fields, line: start.line, column: start.column };
  }

  private parseApiDeclaration(): AST.ApiDeclaration {
    const start = this.advance(); // api
    const name = this.expect(TokenType.Ident, "api name").value;
    this.expect(TokenType.LBrace, "'{'");
    const properties = this.parsePropertyBlock();
    const endpoints: AST.ApiEndpoint[] = [];

    while (!this.check(TokenType.RBrace) && !this.isAtEnd()) {
      const method = this.expect(TokenType.Ident, "HTTP method").value;
      const path = this.expect(TokenType.String, "path").value;
      let returnType: AST.TypeNode | undefined;
      if (this.match(TokenType.Arrow)) {
        returnType = this.parseType();
      }
      this.expect(TokenType.LBrace, "'{'");
      const epProps = this.parsePropertyBlock();
      this.expect(TokenType.RBrace, "'}'");
      endpoints.push({ method, path, returnType, handler: epProps['handler'] ? String(epProps['handler']) : '', properties: epProps });
    }

    this.expect(TokenType.RBrace, "'}'");
    return { kind: 'Api', name, properties, endpoints, line: start.line, column: start.column };
  }

  private parseApplicationDeclaration(): AST.ApplicationDeclaration {
    const start = this.advance(); // application
    const name = this.expect(TokenType.Ident, "application name").value;
    this.expect(TokenType.LBrace, "'{'");
    const properties = this.parsePropertyBlock();
    this.expect(TokenType.RBrace, "'}'");
    return { kind: 'Application', name, properties, line: start.line, column: start.column };
  }

  private parsePackageDeclaration(): AST.PackageDeclaration {
    const start = this.advance(); // package
    const name = this.expect(TokenType.Ident, "package name").value;
    this.expect(TokenType.LBrace, "'{'");
    const properties = this.parsePropertyBlock();
    this.expect(TokenType.RBrace, "'}'");
    return { kind: 'Package', name, properties, line: start.line, column: start.column };
  }

  private parsePropertyBlock(): Record<string, AST.Expression> {
    const props: Record<string, AST.Expression> = {};
    while (!this.check(TokenType.RBrace) && !this.isAtEnd()) {
      const key = this.expect(TokenType.Ident, "property name").value;
      // Support both ':' (modern) and '=' (legacy) as separator
      if (!this.match(TokenType.Colon) && !this.match(TokenType.Eq)) {
        this.expect(TokenType.Colon, "':' or '='");
      }
      const value = this.parseExpression();
      props[key] = value;
      this.match(TokenType.Comma);
    }
    return props;
  }

  private parseBlockStatement(): AST.BlockStatement {
    const start = this.expect(TokenType.LBrace, "'{'");
    const statements: AST.Statement[] = [];
    while (!this.check(TokenType.RBrace) && !this.isAtEnd()) {
      const stmt = this.parseStatement();
      if (stmt) statements.push(stmt);
    }
    this.expect(TokenType.RBrace, "'}'");
    return { kind: 'Block', statements, line: start.line, column: start.column };
  }

  private parseExpressionStatement(): AST.ExpressionStatement {
    const start = this.peek();
    const expression = this.parseExpression();
    this.match(TokenType.Semicolon);
    return { kind: 'ExpressionStatement', expression, line: start.line, column: start.column };
  }

  // ============ Type parsing ============

  private parseType(): AST.TypeNode {
    let type = this.parsePrimaryType();

    // Optional: T?
    while (this.match(TokenType.Question)) {
      type = { kind: 'Optional', inner: type };
    }

    // Function type: fn(A, B) -> C
    // (handled in primary via Fn token)

    return type;
  }

  private parsePrimaryType(): AST.TypeNode {
    const token = this.peek();

    if (token.type === TokenType.LParen) {
      // Tuple type: (A, B, C)
      this.advance();
      const elements: AST.TypeNode[] = [];
      if (!this.check(TokenType.RParen)) {
        do {
          elements.push(this.parseType());
        } while (this.match(TokenType.Comma));
      }
      this.expect(TokenType.RParen, "')'");
      if (elements.length === 1) {
        return elements[0];
      }
      return { kind: 'Tuple', elements };
    }

    if (token.type === TokenType.Fn) {
      this.advance();
      this.expect(TokenType.LParen, "'('");
      const params: AST.TypeNode[] = [];
      if (!this.check(TokenType.RParen)) {
        do {
          params.push(this.parseType());
        } while (this.match(TokenType.Comma));
      }
      this.expect(TokenType.RParen, "')'");
      this.expect(TokenType.Arrow, "'->'");
      const returnType = this.parseType();
      return { kind: 'Function', params, returnType };
    }

    if (token.value === '&') {
      this.advance();
      const mutable = this.match(TokenType.Mut);
      const inner = this.parseType();
      return { kind: 'Reference', inner, mutable };
    }

    // Named type with generics: List[int], Map[str, int], Option[T]
    const name = this.expect(TokenType.Ident, "type name").value;

    if (this.match(TokenType.LBracket)) {
      const generics: AST.TypeNode[] = [];
      if (!this.check(TokenType.RBracket)) {
        do {
          generics.push(this.parseType());
        } while (this.match(TokenType.Comma));
      }
      this.expect(TokenType.RBracket, "']'");

      // Special: [T; N] array
      if (name === '' && this.match(TokenType.Semicolon)) {
        // Actually array syntax is [int; 5], not named
      }

      return { kind: 'Named', name, generics };
    }

    // Array type: [int; 5]
    if (name === '' || token.type === TokenType.LBracket) {
      // handled above
    }

    return { kind: 'Named', name };
  }

  // ============ Expression parsing (Pratt) ============

  private parseExpression(): AST.Expression {
    return this.parsePipe();
  }

  private parsePipe(): AST.Expression {
    let left = this.parseAssignment();
    while (this.match(TokenType.Pipe)) {
      const right = this.parseAssignment();
      left = { kind: 'Pipe', left, right, line: left.line, column: left.column };
    }
    return left;
  }

  private parseAssignment(): AST.Expression {
    const left = this.parseOr();
    if (this.match(TokenType.Eq, TokenType.PlusEq, TokenType.MinusEq, TokenType.StarEq, TokenType.SlashEq, TokenType.PercentEq)) {
      const op = this.previous().value;
      const right = this.parseAssignment();
      return { kind: 'Binary', operator: op, left, right, line: left.line, column: left.column };
    }
    return left;
  }

  private parseOr(): AST.Expression {
    let left = this.parseAnd();
    while (this.match(TokenType.Or)) {
      const right = this.parseAnd();
      left = { kind: 'Binary', operator: '||', left, right, line: left.line, column: left.column };
    }
    return left;
  }

  private parseAnd(): AST.Expression {
    let left = this.parseEquality();
    while (this.match(TokenType.And)) {
      const right = this.parseEquality();
      left = { kind: 'Binary', operator: '&&', left, right, line: left.line, column: left.column };
    }
    return left;
  }

  private parseEquality(): AST.Expression {
    let left = this.parseComparison();
    while (this.match(TokenType.EqEq, TokenType.Neq)) {
      const op = this.previous().value;
      const right = this.parseComparison();
      left = { kind: 'Binary', operator: op, left, right, line: left.line, column: left.column };
    }
    return left;
  }

  private parseComparison(): AST.Expression {
    let left = this.parseRange();
    while (this.match(TokenType.Lt, TokenType.Gt, TokenType.Le, TokenType.Ge)) {
      const op = this.previous().value;
      const right = this.parseRange();
      left = { kind: 'Binary', operator: op, left, right, line: left.line, column: left.column };
    }
    return left;
  }

  private parseRange(): AST.Expression {
    let left = this.parseAddition();
    if (this.match(TokenType.Range, TokenType.RangeInclusive)) {
      const inclusive = this.previous().type === TokenType.RangeInclusive;
      const right = this.parseAddition();
      left = { kind: 'Range', start: left, end: right, inclusive, line: left.line, column: left.column };
    }
    return left;
  }

  private parseAddition(): AST.Expression {
    let left = this.parseMultiplication();
    while (this.match(TokenType.Plus, TokenType.Minus)) {
      const op = this.previous().value;
      const right = this.parseMultiplication();
      left = { kind: 'Binary', operator: op, left, right, line: left.line, column: left.column };
    }
    return left;
  }

  private parseMultiplication(): AST.Expression {
    let left = this.parsePower();
    while (this.match(TokenType.Star, TokenType.Slash, TokenType.Percent)) {
      const op = this.previous().value;
      const right = this.parsePower();
      left = { kind: 'Binary', operator: op, left, right, line: left.line, column: left.column };
    }
    return left;
  }

  private parsePower(): AST.Expression {
    let left = this.parseUnary();
    if (this.match(TokenType.Power)) {
      const right = this.parsePower(); // right-associative
      left = { kind: 'Binary', operator: '**', left, right, line: left.line, column: left.column };
    }
    return left;
  }

  private parseUnary(): AST.Expression {
    if (this.match(TokenType.Minus, TokenType.Bang)) {
      const op = this.previous().value;
      const operand = this.parseUnary();
      return { kind: 'Unary', operator: op, operand, line: operand.line, column: operand.column };
    }
    if (this.match(TokenType.Await)) {
      const expression = this.parseUnary();
      return { kind: 'Await', expression, line: expression.line, column: expression.column };
    }
    if (this.match(TokenType.Spawn)) {
      const expression = this.parseUnary();
      return { kind: 'Spawn', expression, line: expression.line, column: expression.column };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): AST.Expression {
    let expr = this.parsePrimary();

    while (true) {
      if (this.match(TokenType.LParen)) {
        const args = this.parseArgs();
        this.expect(TokenType.RParen, "')'");
        expr = { kind: 'Call', callee: expr, args, line: expr.line, column: expr.column };
      } else if (this.match(TokenType.Dot)) {
        const property = this.expect(TokenType.Ident, "property name").value;
        expr = { kind: 'Member', object: expr, property, line: expr.line, column: expr.column };
      } else if (this.match(TokenType.LBracket)) {
        const index = this.parseExpression();
        this.expect(TokenType.RBracket, "']'");
        expr = { kind: 'Index', object: expr, index, line: expr.line, column: expr.column };
      } else if (this.match(TokenType.Question)) {
        // Optional chaining: expr?.prop
        if (this.match(TokenType.Dot)) {
          const property = this.expect(TokenType.Ident, "property name").value;
          expr = { kind: 'Member', object: expr, property, line: expr.line, column: expr.column };
        }
      } else {
        break;
      }
    }

    return expr;
  }

  private parseArgs(): AST.Expression[] {
    const args: AST.Expression[] = [];
    if (this.check(TokenType.RParen)) return args;
    do {
      args.push(this.parseExpression());
    } while (this.match(TokenType.Comma));
    return args;
  }

  private parsePrimary(): AST.Expression {
    const token = this.peek();

    switch (token.type) {
      case TokenType.Int:
        this.advance();
        return { kind: 'Int', value: token.value, line: token.line, column: token.column };

      case TokenType.Float:
        this.advance();
        return { kind: 'Float', value: token.value, line: token.line, column: token.column };

      case TokenType.String:
      case TokenType.RawString:
        this.advance();
        return { kind: 'String', value: token.value, raw: token.type === TokenType.RawString, line: token.line, column: token.column };

      case TokenType.True:
        this.advance();
        return { kind: 'Bool', value: true, line: token.line, column: token.column };

      case TokenType.False:
        this.advance();
        return { kind: 'Bool', value: false, line: token.line, column: token.column };

      case TokenType.Null:
        this.advance();
        return { kind: 'Null', line: token.line, column: token.column };

      case TokenType.Some:
        this.advance();
        this.expect(TokenType.LParen, "'('");
        const someVal = this.parseExpression();
        this.expect(TokenType.RParen, "')'");
        return { kind: 'Some', value: someVal, line: token.line, column: token.column };

      case TokenType.None:
        this.advance();
        return { kind: 'None', line: token.line, column: token.column };

      case TokenType.Ok:
        this.advance();
        this.expect(TokenType.LParen, "'('");
        const okVal = this.parseExpression();
        this.expect(TokenType.RParen, "')'");
        return { kind: 'Ok', value: okVal, line: token.line, column: token.column };

      case TokenType.Err:
        this.advance();
        this.expect(TokenType.LParen, "'('");
        const errVal = this.parseExpression();
        this.expect(TokenType.RParen, "')'");
        return { kind: 'Err', value: errVal, line: token.line, column: token.column };

      case TokenType.Self_:
        this.advance();
        return { kind: 'Self', line: token.line, column: token.column };

      case TokenType.LParen:
        return this.parseTupleOrGroup();

      case TokenType.LBracket:
        return this.parseArrayLiteral();

      case TokenType.LBrace:
        return this.parseBlockOrMap();

      case TokenType.If:
        return this.parseIfExpression();

      case TokenType.Match:
        return this.parseMatchExpression();

      case TokenType.Fn:
        return this.parseLambda();

      case TokenType.Async:
        if (this.peekAtNext()?.type === TokenType.Fn) {
          return this.parseLambda();
        }
        // async alone is not valid in expression context
        throw new ParserError(`Unexpected 'async'`, token.line, token.column);

      case TokenType.Ident:
        this.advance();
        // Check for struct literal: TypeName { field: value }
        if (this.check(TokenType.LBrace)) {
          return this.parseStructLiteral(token.value, token.line, token.column);
        }
        return { kind: 'Ident', name: token.value, line: token.line, column: token.column };

      default:
        throw new ParserError(`Unexpected token '${token.value}' (${token.type})`, token.line, token.column);
    }
  }

  private parseTupleOrGroup(): AST.Expression {
    const start = this.advance(); // (
    if (this.match(TokenType.RParen)) {
      return { kind: 'Tuple', elements: [], line: start.line, column: start.column };
    }
    const first = this.parseExpression();
    if (this.match(TokenType.Comma)) {
      const elements = [first];
      while (!this.check(TokenType.RParen)) {
        elements.push(this.parseExpression());
        if (!this.match(TokenType.Comma)) break;
      }
      this.expect(TokenType.RParen, "')'");
      return { kind: 'Tuple', elements, line: start.line, column: start.column };
    }
    this.expect(TokenType.RParen, "')'");
    return first; // grouped expression
  }

  private parseArrayLiteral(): AST.Expression {
    const start = this.advance(); // [
    const elements: AST.Expression[] = [];
    while (!this.check(TokenType.RBracket) && !this.isAtEnd()) {
      elements.push(this.parseExpression());
      if (!this.match(TokenType.Comma)) break;
    }
    this.expect(TokenType.RBracket, "']'");
    return { kind: 'Array', elements, line: start.line, column: start.column };
  }

  private parseBlockOrMap(): AST.Expression {
    const start = this.peek();
    // Look ahead: if first token is Ident followed by Colon, it's a map literal
    // Otherwise it's a block expression
    const savePos = this.pos;
    this.advance(); // {

    if (this.check(TokenType.RBrace)) {
      this.advance();
      return { kind: 'BlockExpr', statements: [], line: start.line, column: start.column };
    }

    // Check if this looks like a map: ident : expr
    const firstToken = this.peek();
    if (firstToken.type === TokenType.Ident && this.peekAtNext()?.type === TokenType.Colon) {
      // Map literal
      this.pos = savePos;
      return this.parseMapLiteral();
    }

    // Block expression
    const statements: AST.Statement[] = [];
    let result: AST.Expression | undefined;

    while (!this.check(TokenType.RBrace) && !this.isAtEnd()) {
      // Check if this is the final expression (no semicolon)
      const stmtStart = this.pos;
      const stmt = this.parseStatement();
      if (stmt && stmt.kind === 'ExpressionStatement' && !this.check(TokenType.Semicolon)) {
        // This might be the result expression
        if (this.check(TokenType.RBrace)) {
          result = (stmt as AST.ExpressionStatement).expression;
          break;
        }
      }
      if (stmt) statements.push(stmt);
    }

    this.expect(TokenType.RBrace, "'}'");
    return { kind: 'BlockExpr', statements, result, line: start.line, column: start.column };
  }

  private parseMapLiteral(): AST.Expression {
    const start = this.advance(); // {
    const entries: { key: AST.Expression; value: AST.Expression }[] = [];

    while (!this.check(TokenType.RBrace) && !this.isAtEnd()) {
      let key: AST.Expression;
      if (this.check(TokenType.Ident)) {
        const keyToken = this.advance();
        key = { kind: 'String', value: keyToken.value, raw: false, line: keyToken.line, column: keyToken.column };
      } else {
        key = this.parseExpression();
      }
      this.expect(TokenType.Colon, "':'");
      const value = this.parseExpression();
      entries.push({ key, value });
      if (!this.match(TokenType.Comma)) break;
    }

    this.expect(TokenType.RBrace, "'}'");
    return { kind: 'Map', entries, line: start.line, column: start.column };
  }

  private parseStructLiteral(typeName: string, line: number, column: number): AST.Expression {
    this.advance(); // {
    const fields: { name: string; value: AST.Expression }[] = [];

    while (!this.check(TokenType.RBrace) && !this.isAtEnd()) {
      const name = this.expect(TokenType.Ident, "field name").value;
      this.expect(TokenType.Colon, "':'");
      const value = this.parseExpression();
      fields.push({ name, value });
      if (!this.match(TokenType.Comma)) break;
    }

    this.expect(TokenType.RBrace, "'}'");
    return { kind: 'StructLiteral', typeName, fields, line, column };
  }

  private parseIfExpression(): AST.Expression {
    const start = this.advance(); // if
    const condition = this.parseExpression();
    const consequent = this.parseBlockStatement();
    let alternate: AST.BlockStatement | AST.IfExpression | undefined;

    if (this.match(TokenType.Else)) {
      if (this.check(TokenType.If)) {
        alternate = this.parseIfExpression() as AST.IfExpression;
      } else {
        alternate = this.parseBlockStatement();
      }
    }

    return { kind: 'IfExpr', condition, consequent, alternate, line: start.line, column: start.column };
  }

  private parseMatchExpression(): AST.Expression {
    const start = this.advance(); // match
    const scrutinee = this.parseExpression();
    this.expect(TokenType.LBrace, "'{'");
    const arms: AST.MatchArm[] = [];

    while (!this.check(TokenType.RBrace) && !this.isAtEnd()) {
      const pattern = this.parsePattern();
      this.expect(TokenType.FatArrow, "'=>'");
      const body = this.parseExpression();
      arms.push({ pattern, body });
      this.match(TokenType.Comma);
    }

    this.expect(TokenType.RBrace, "'}'");
    return { kind: 'Match', scrutinee, arms, line: start.line, column: start.column };
  }

  private parsePattern(): AST.Pattern {
    const token = this.peek();

    if (token.type === TokenType.Ident) {
      // Could be enum variant or identifier binding
      this.advance();
      if (this.match(TokenType.LParen)) {
        // Enum variant with tuple fields
        const fields: string[] = [];
        while (!this.check(TokenType.RParen)) {
          fields.push(this.expect(TokenType.Ident, "field name").value);
          if (!this.match(TokenType.Comma)) break;
        }
        this.expect(TokenType.RParen, "')'");
        return { kind: 'EnumVariant', variant: token.value, fields };
      }
      if (this.match(TokenType.LBrace)) {
        // Enum variant with struct fields
        const fields: string[] = [];
        while (!this.check(TokenType.RBrace)) {
          fields.push(this.expect(TokenType.Ident, "field name").value);
          if (!this.match(TokenType.Comma)) break;
        }
        this.expect(TokenType.RBrace, "'}'");
        return { kind: 'EnumVariant', variant: token.value, fields };
      }
      // Simple identifier binding
      if (token.value === '_') return { kind: 'Wildcard' };
      return { kind: 'Ident', name: token.value };
    }

    if (token.type === TokenType.Int || token.type === TokenType.Float || token.type === TokenType.String ||
        token.type === TokenType.True || token.type === TokenType.False || token.type === TokenType.Null) {
      this.advance();
      let value: AST.Expression;
      if (token.type === TokenType.Int) value = { kind: 'Int', value: token.value, line: token.line, column: token.column };
      else if (token.type === TokenType.Float) value = { kind: 'Float', value: token.value, line: token.line, column: token.column };
      else if (token.type === TokenType.String) value = { kind: 'String', value: token.value, raw: false, line: token.line, column: token.column };
      else if (token.type === TokenType.True) value = { kind: 'Bool', value: true, line: token.line, column: token.column };
      else if (token.type === TokenType.False) value = { kind: 'Bool', value: false, line: token.line, column: token.column };
      else value = { kind: 'Null', line: token.line, column: token.column };
      return { kind: 'Literal', value };
    }

    if (token.type === TokenType.LParen) {
      this.advance();
      const patterns: AST.Pattern[] = [];
      while (!this.check(TokenType.RParen)) {
        patterns.push(this.parsePattern());
        if (!this.match(TokenType.Comma)) break;
      }
      this.expect(TokenType.RParen, "')'");
      return { kind: 'Tuple', patterns };
    }

    throw new ParserError(`Invalid pattern '${token.value}'`, token.line, token.column);
  }

  private parseLambda(): AST.Expression {
    const start = this.peek();
    const isAsync = this.match(TokenType.Async);
    this.expect(TokenType.Fn, "'fn'");
    this.expect(TokenType.LParen, "'('");
    const params = this.parseParams();
    this.expect(TokenType.RParen, "')'");
    let returnType: AST.TypeNode | undefined;
    if (this.match(TokenType.Arrow)) {
      returnType = this.parseType();
    }
    const body = this.parseBlockStatement();
    return { kind: 'Lambda', params, returnType, body, isAsync, line: start.line, column: start.column };
  }
}

export class ParserError extends Error {
  constructor(message: string, public line: number, public column: number) {
    super(`Parser error at line ${line}, column ${column}: ${message}`);
    this.name = 'ParserError';
  }
}
