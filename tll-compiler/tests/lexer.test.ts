/**
 * TLL Lexer Tests
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { Lexer, TokenType } from '../src/lexer';

test('lexes simple let statement', () => {
  const lexer = new Lexer('let x = 5');
  const tokens = lexer.tokenize();

  assert.equal(tokens[0].type, TokenType.Let);
  assert.equal(tokens[1].type, TokenType.Ident);
  assert.equal(tokens[1].value, 'x');
  assert.equal(tokens[2].type, TokenType.Eq);
  assert.equal(tokens[3].type, TokenType.Int);
  assert.equal(tokens[3].value, '5');
  assert.equal(tokens[4].type, TokenType.EOF);
});

test('lexes string literal', () => {
  const lexer = new Lexer('"hello world"');
  const tokens = lexer.tokenize();

  assert.equal(tokens[0].type, TokenType.String);
  assert.equal(tokens[0].value, 'hello world');
});

test('lexes string with escapes', () => {
  const lexer = new Lexer('"hello\\nworld"');
  const tokens = lexer.tokenize();

  assert.equal(tokens[0].type, TokenType.String);
  assert.equal(tokens[0].value, 'hello\nworld');
});

test('lexes arrow function signature', () => {
  const lexer = new Lexer('fn add(a: int) -> int');
  const tokens = lexer.tokenize();

  assert.equal(tokens[0].type, TokenType.Fn);
  assert.equal(tokens[1].type, TokenType.Ident);
  assert.equal(tokens[1].value, 'add');
  assert.equal(tokens[2].type, TokenType.LParen);
  assert.equal(tokens[3].type, TokenType.Ident);
  assert.equal(tokens[3].value, 'a');
  assert.equal(tokens[4].type, TokenType.Colon);
  assert.equal(tokens[5].type, TokenType.Ident);
  assert.equal(tokens[5].value, 'int');
  assert.equal(tokens[6].type, TokenType.RParen);
  assert.equal(tokens[7].type, TokenType.Arrow);
  assert.equal(tokens[8].type, TokenType.Ident);
  assert.equal(tokens[8].value, 'int');
});

test('lexes operators', () => {
  const lexer = new Lexer('+ - * / % == != <= >= && || -> => |> .. ..=');
  const tokens = lexer.tokenize().filter(t => t.type !== TokenType.EOF);

  const expected = [
    TokenType.Plus, TokenType.Minus, TokenType.Star, TokenType.Slash,
    TokenType.Percent, TokenType.EqEq, TokenType.Neq, TokenType.Le,
    TokenType.Ge, TokenType.And, TokenType.Or, TokenType.Arrow,
    TokenType.FatArrow, TokenType.Pipe, TokenType.Range, TokenType.RangeInclusive,
  ];

  assert.equal(tokens.length, expected.length);
  for (let i = 0; i < expected.length; i++) {
    assert.equal(tokens[i].type, expected[i], `token ${i}`);
  }
});

test('lexes hex/octal/binary integers', () => {
  const lexer = new Lexer('0xFF 0o77 0b1010');
  const tokens = lexer.tokenize().filter(t => t.type !== TokenType.EOF);

  assert.equal(tokens[0].value, '0xFF');
  assert.equal(tokens[1].value, '0o77');
  assert.equal(tokens[2].value, '0b1010');
});

test('lexes float with exponent', () => {
  const lexer = new Lexer('3.14 1.0e-5 6.022e23');
  const tokens = lexer.tokenize().filter(t => t.type !== TokenType.EOF);

  assert.equal(tokens[0].type, TokenType.Float);
  assert.equal(tokens[0].value, '3.14');
  assert.equal(tokens[1].type, TokenType.Float);
  assert.equal(tokens[1].value, '1.0e-5');
  assert.equal(tokens[2].type, TokenType.Float);
  assert.equal(tokens[2].value, '6.022e23');
});

test('lexes keywords', () => {
  const keywords = ['let', 'mut', 'const', 'fn', 'return', 'if', 'else', 'while', 'for', 'in', 'true', 'false', 'null', 'import', 'from', 'export', 'as', 'pub', 'struct', 'enum', 'interface', 'impl', 'async', 'await', 'defer', 'match', 'agent', 'tool', 'intent', 'entity', 'api', 'application'];
  const source = keywords.join(' ');
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize().filter(t => t.type !== TokenType.EOF);

  assert.equal(tokens.length, keywords.length);
  for (let i = 0; i < keywords.length; i++) {
    assert.notEqual(tokens[i].type, TokenType.Ident, `${keywords[i]} should be a keyword`);
  }
});

test('lexes comments', () => {
  const lexer = new Lexer('// this is a comment\nlet x = 5');
  const tokens = lexer.tokenize();

  assert.equal(tokens[0].type, TokenType.Let);
  assert.equal(tokens[1].value, 'x');
});

test('lexes raw string', () => {
  const lexer = new Lexer('r"C:\\Users\\name"');
  const tokens = lexer.tokenize();

  assert.equal(tokens[0].type, TokenType.RawString);
  assert.equal(tokens[0].value, 'C:\\Users\\name');
});
