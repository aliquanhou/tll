/**
 * TLL Lexer - Bootstrap Compiler (TypeScript)
 * Implements lexical structure per TLL Language Specification 0.1 §2
 */

export enum TokenType {
  // Keywords
  Let = 'LET',
  Mut = 'MUT',
  Const = 'CONST',
  Fn = 'FN',
  Return = 'RETURN',
  If = 'IF',
  Else = 'ELSE',
  While = 'WHILE',
  For = 'FOR',
  In = 'IN',
  Break = 'BREAK',
  Continue = 'CONTINUE',
  Match = 'MATCH',
  Case = 'CASE',
  Default = 'DEFAULT',
  True = 'TRUE',
  False = 'FALSE',
  Null = 'NULL',
  Undefined = 'UNDEFINED',
  Import = 'IMPORT',
  From = 'FROM',
  Export = 'EXPORT',
  As = 'AS',
  Module = 'MODULE',
  Pub = 'PUB',
  Priv = 'PRIV',
  Type = 'TYPE',
  Struct = 'STRUCT',
  Enum = 'ENUM',
  Interface = 'INTERFACE',
  Impl = 'IMPL',
  Entity = 'ENTITY',
  Api = 'API',
  Application = 'APPLICATION',
  Async = 'ASYNC',
  Await = 'AWAIT',
  Defer = 'DEFER',
  Try = 'TRY',
  Catch = 'CATCH',
  Finally = 'FINALLY',
  Throw = 'THROW',
  Result = 'RESULT',
  Option = 'OPTION',
  Some = 'SOME',
  None = 'NONE',
  Ok = 'OK',
  Err = 'ERR',
  Agent = 'AGENT',
  Intent = 'INTENT',
  Tool = 'TOOL',
  Workflow = 'WORKFLOW',
  Spawn = 'SPAWN',
  Send = 'SEND',
  Self_ = 'SELF',
  Super = 'SUPER',
  Package = 'PACKAGE',
  Move = 'MOVE',

  // Literals
  Ident = 'IDENT',
  Int = 'INT',
  Float = 'FLOAT',
  String = 'STRING',
  RawString = 'RAW_STRING',
  MultiString = 'MULTI_STRING',

  // Operators
  Plus = 'PLUS',
  Minus = 'MINUS',
  Star = 'STAR',
  Slash = 'SLASH',
  Percent = 'PERCENT',
  Power = 'POWER',
  Eq = 'EQ',
  EqEq = 'EQEQ',
  Neq = 'NEQ',
  Lt = 'LT',
  Gt = 'GT',
  Le = 'LE',
  Ge = 'GE',
  And = 'AND',
  Or = 'OR',
  Bang = 'BANG',
  Dot = 'DOT',
  Comma = 'COMMA',
  Colon = 'COLON',
  Semicolon = 'SEMICOLON',
  LParen = 'LPAREN',
  RParen = 'RPAREN',
  LBrace = 'LBRACE',
  RBrace = 'RBRACE',
  LBracket = 'LBRACKET',
  RBracket = 'RBRACKET',
  Arrow = 'ARROW',
  FatArrow = 'FAT_ARROW',
  Pipe = 'PIPE',
  At = 'AT',
  Question = 'QUESTION',
  Range = 'RANGE',
  RangeInclusive = 'RANGE_INCLUSIVE',

  // Assignment operators
  PlusEq = 'PLUSEQ',
  MinusEq = 'MINUSEQ',
  StarEq = 'STAREQ',
  SlashEq = 'SLASHEQ',
  PercentEq = 'PERCENTEQ',

  // Special
  EOF = 'EOF',
  Newline = 'NEWLINE',
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

const KEYWORDS: Map<string, TokenType> = new Map([
  ['let', TokenType.Let],
  ['mut', TokenType.Mut],
  ['const', TokenType.Const],
  ['fn', TokenType.Fn],
  ['return', TokenType.Return],
  ['if', TokenType.If],
  ['else', TokenType.Else],
  ['while', TokenType.While],
  ['for', TokenType.For],
  ['in', TokenType.In],
  ['break', TokenType.Break],
  ['continue', TokenType.Continue],
  ['match', TokenType.Match],
  ['case', TokenType.Case],
  ['default', TokenType.Default],
  ['true', TokenType.True],
  ['false', TokenType.False],
  ['null', TokenType.Null],
  ['undefined', TokenType.Undefined],
  ['import', TokenType.Import],
  ['from', TokenType.From],
  ['export', TokenType.Export],
  ['as', TokenType.As],
  ['module', TokenType.Module],
  ['pub', TokenType.Pub],
  ['priv', TokenType.Priv],
  ['type', TokenType.Type],
  ['struct', TokenType.Struct],
  ['enum', TokenType.Enum],
  ['interface', TokenType.Interface],
  ['impl', TokenType.Impl],
  ['entity', TokenType.Entity],
  ['api', TokenType.Api],
  ['application', TokenType.Application],
  ['async', TokenType.Async],
  ['await', TokenType.Await],
  ['defer', TokenType.Defer],
  ['try', TokenType.Try],
  ['catch', TokenType.Catch],
  ['finally', TokenType.Finally],
  ['throw', TokenType.Throw],
  ['Result', TokenType.Result],
  ['Option', TokenType.Option],
  ['Some', TokenType.Some],
  ['None', TokenType.None],
  ['Ok', TokenType.Ok],
  ['Err', TokenType.Err],
  ['agent', TokenType.Agent],
  ['intent', TokenType.Intent],
  ['tool', TokenType.Tool],
  ['workflow', TokenType.Workflow],
  ['spawn', TokenType.Spawn],
  ['send', TokenType.Send],
  ['self', TokenType.Self_],
  ['Self', TokenType.Self_],
  ['super', TokenType.Super],
  ['package', TokenType.Package],
  ['move', TokenType.Move],
]);

export class Lexer {
  private input: string;
  private pos: number = 0;
  private line: number = 1;
  private column: number = 1;
  private tokens: Token[] = [];

  constructor(input: string) {
    this.input = input;
  }

  public tokenize(): Token[] {
    while (this.pos < this.input.length) {
      this.skipWhitespaceAndComments();
      if (this.pos >= this.input.length) break;

      const ch = this.peek();
      const startLine = this.line;
      const startCol = this.column;

      if (ch === '"') {
        this.tokens.push(this.readString(startLine, startCol));
      } else if (ch === 'r' && this.peekAt(1) === '"') {
        this.tokens.push(this.readRawString(startLine, startCol));
      } else if (this.isDigit(ch)) {
        this.tokens.push(this.readNumber(startLine, startCol));
      } else if (this.isAlpha(ch) || ch === '_') {
        this.tokens.push(this.readIdent(startLine, startCol));
      } else {
        this.tokens.push(this.readOperator(startLine, startCol));
      }
    }

    this.tokens.push({
      type: TokenType.EOF,
      value: '',
      line: this.line,
      column: this.column,
    });

    return this.tokens;
  }

  private peek(): string {
    return this.input[this.pos] || '';
  }

  private peekAt(offset: number): string {
    return this.input[this.pos + offset] || '';
  }

  private advance(): string {
    const ch = this.input[this.pos];
    this.pos++;
    if (ch === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return ch;
  }

  private skipWhitespaceAndComments(): void {
    while (this.pos < this.input.length) {
      const ch = this.peek();
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
        this.advance();
      } else if (ch === '/' && this.peekAt(1) === '/') {
        this.skipLineComment();
      } else {
        break;
      }
    }
  }

  private skipLineComment(): void {
    while (this.pos < this.input.length && this.peek() !== '\n') {
      this.advance();
    }
  }

  private isDigit(ch: string): boolean {
    return ch >= '0' && ch <= '9';
  }

  private isAlpha(ch: string): boolean {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
  }

  private isAlphanumeric(ch: string): boolean {
    return this.isAlpha(ch) || this.isDigit(ch) || ch === '_';
  }

  private readString(startLine: number, startCol: number): Token {
    this.advance(); // skip opening "
    let value = '';

    while (this.pos < this.input.length) {
      const ch = this.advance();
      if (ch === '"') {
        return { type: TokenType.String, value, line: startLine, column: startCol };
      } else if (ch === '\\') {
        const next = this.advance();
        switch (next) {
          case 'n': value += '\n'; break;
          case 't': value += '\t'; break;
          case 'r': value += '\r'; break;
          case '\\': value += '\\'; break;
          case '"': value += '"'; break;
          case '0': value += '\0'; break;
          default: value += next;
        }
      } else {
        value += ch;
      }
    }

    throw new LexerError(`Unterminated string literal`, startLine, startCol);
  }

  private readRawString(startLine: number, startCol: number): Token {
    this.advance(); // skip 'r'
    this.advance(); // skip opening "
    let value = '';

    while (this.pos < this.input.length) {
      const ch = this.advance();
      if (ch === '"') {
        return { type: TokenType.RawString, value, line: startLine, column: startCol };
      }
      value += ch;
    }

    throw new LexerError(`Unterminated raw string literal`, startLine, startCol);
  }

  private readNumber(startLine: number, startCol: number): Token {
    let value = '';
    let isFloat = false;

    // Handle hex/octal/binary
    if (this.peek() === '0') {
      const next = this.peekAt(1);
      if (next === 'x' || next === 'X') {
        value += this.advance(); // 0
        value += this.advance(); // x
        while (this.pos < this.input.length && this.isHexDigit(this.peek())) {
          value += this.advance();
        }
        return { type: TokenType.Int, value, line: startLine, column: startCol };
      }
      if (next === 'o' || next === 'O') {
        value += this.advance();
        value += this.advance();
        while (this.pos < this.input.length && this.peek() >= '0' && this.peek() <= '7') {
          value += this.advance();
        }
        return { type: TokenType.Int, value, line: startLine, column: startCol };
      }
      if (next === 'b' || next === 'B') {
        value += this.advance();
        value += this.advance();
        while (this.pos < this.input.length && (this.peek() === '0' || this.peek() === '1')) {
          value += this.advance();
        }
        return { type: TokenType.Int, value, line: startLine, column: startCol };
      }
    }

    while (this.pos < this.input.length) {
      const ch = this.peek();
      if (this.isDigit(ch)) {
        value += this.advance();
      } else if (ch === '_' && this.isDigit(this.peekAt(1))) {
        this.advance(); // skip underscore separator
      } else if (ch === '.' && !isFloat && this.isDigit(this.peekAt(1))) {
        isFloat = true;
        value += this.advance();
      } else if (ch === 'e' || ch === 'E') {
        isFloat = true;
        value += this.advance();
        if (this.peek() === '+' || this.peek() === '-') {
          value += this.advance();
        }
      } else {
        break;
      }
    }

    return {
      type: isFloat ? TokenType.Float : TokenType.Int,
      value,
      line: startLine,
      column: startCol,
    };
  }

  private isHexDigit(ch: string): boolean {
    return this.isDigit(ch) || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F');
  }

  private readIdent(startLine: number, startCol: number): Token {
    let value = '';
    while (this.pos < this.input.length && this.isAlphanumeric(this.peek())) {
      value += this.advance();
    }

    const keywordType = KEYWORDS.get(value);
    return {
      type: keywordType || TokenType.Ident,
      value,
      line: startLine,
      column: startCol,
    };
  }

  private readOperator(startLine: number, startCol: number): Token {
    const ch = this.advance();

    // Two-character operators
    const twoChar = ch + (this.peek() || '');
    const threeChar = twoChar + (this.peekAt(1) || '');

    // Three-character first
    if (threeChar === '..=') {
      this.advance(); this.advance();
      return { type: TokenType.RangeInclusive, value: '..=', line: startLine, column: startCol };
    }

    // Two-character
    const twoCharMap: Record<string, TokenType> = {
      '->': TokenType.Arrow,
      '=>': TokenType.FatArrow,
      '|>': TokenType.Pipe,
      '==': TokenType.EqEq,
      '!=': TokenType.Neq,
      '<=': TokenType.Le,
      '>=': TokenType.Ge,
      '&&': TokenType.And,
      '||': TokenType.Or,
      '..': TokenType.Range,
      '+=': TokenType.PlusEq,
      '-=': TokenType.MinusEq,
      '*=': TokenType.StarEq,
      '/=': TokenType.SlashEq,
      '%=': TokenType.PercentEq,
      '**': TokenType.Power,
    };

    if (twoCharMap[twoChar]) {
      this.advance();
      return { type: twoCharMap[twoChar], value: twoChar, line: startLine, column: startCol };
    }

    // Single-character
    const singleCharMap: Record<string, TokenType> = {
      '+': TokenType.Plus,
      '-': TokenType.Minus,
      '*': TokenType.Star,
      '/': TokenType.Slash,
      '%': TokenType.Percent,
      '=': TokenType.Eq,
      '!': TokenType.Bang,
      '<': TokenType.Lt,
      '>': TokenType.Gt,
      '.': TokenType.Dot,
      ',': TokenType.Comma,
      ':': TokenType.Colon,
      ';': TokenType.Semicolon,
      '(': TokenType.LParen,
      ')': TokenType.RParen,
      '{': TokenType.LBrace,
      '}': TokenType.RBrace,
      '[': TokenType.LBracket,
      ']': TokenType.RBracket,
      '@': TokenType.At,
      '?': TokenType.Question,
    };

    if (singleCharMap[ch]) {
      return { type: singleCharMap[ch], value: ch, line: startLine, column: startCol };
    }

    throw new LexerError(`Unexpected character: '${ch}'`, startLine, startCol);
  }
}

export class LexerError extends Error {
  constructor(message: string, public line: number, public column: number) {
    super(`Lexer error at line ${line}, column ${column}: ${message}`);
    this.name = 'LexerError';
  }
}
