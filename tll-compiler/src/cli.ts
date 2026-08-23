#!/usr/bin/env node
/**
 * TLL CLI - Bootstrap Compiler (TypeScript)
 * Command-line interface for TLL Programming Language
 */

import * as fs from 'fs';
import * as path from 'path';
import { Lexer } from './lexer';
import { Parser } from './parser';
import { TypeChecker } from './typechecker';
import { Compiler } from './compiler';
import { Runtime } from './runtime';
import * as AST from './ast';

const VERSION = '0.1.0-bootstrap';

function printUsage(): void {
  console.log(`TLL Programming Language v${VERSION}
Usage: tll <command> [options] <file>

Commands:
  run <file>       Compile and run a TLL program
  build <file>     Compile to bytecode (.tllbc)
  check <file>     Type-check only (no codegen)
  lex <file>       Show token stream
  parse <file>     Show AST
  version          Show version
  help             Show this help
`);
}

function readFile(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    console.error(`Error: file not found: ${filePath}`);
    process.exit(1);
  }
  return fs.readFileSync(filePath, 'utf-8');
}

function compile(source: string, fileName: string) {
  // Lex
  const lexer = new Lexer(source);
  let tokens;
  try {
    tokens = lexer.tokenize();
  } catch (e: any) {
    console.error(`${fileName}: ${e.message}`);
    process.exit(1);
  }

  // Parse
  const parser = new Parser();
  let ast;
  try {
    ast = parser.parse(source);
  } catch (e: any) {
    console.error(`${fileName}: ${e.message}`);
    process.exit(1);
  }

  // Type check
  const typeChecker = new TypeChecker();
  typeChecker.check(ast);
  if (typeChecker.errors.length > 0) {
    for (const err of typeChecker.errors) {
      console.error(`${fileName}: ${err}`);
    }
    console.error(`Found ${typeChecker.errors.length} type error(s).`);
    // Don't exit for warnings in bootstrap; continue
  }

  // Compile to bytecode
  const compiler = new Compiler();
  const bytecode = compiler.compile(ast);

  return { tokens, ast, bytecode };
}

function compileMultiple(filePaths: string[]) {
  const allStatements: AST.Statement[] = [];
  let allConstants: any[] = [];

  for (const filePath of filePaths) {
    const source = readFile(filePath);
    // Lex
    const lexer = new Lexer(source);
    let tokens;
    try {
      tokens = lexer.tokenize();
    } catch (e: any) {
      console.error(`${filePath}: ${e.message}`);
      process.exit(1);
    }
    // Parse
    const parser = new Parser();
    let ast;
    try {
      ast = parser.parse(source);
    } catch (e: any) {
      console.error(`${filePath}: ${e.message}`);
      process.exit(1);
    }
    // Type check
    const typeChecker = new TypeChecker();
    typeChecker.check(ast);
    if (typeChecker.errors.length > 0) {
      for (const err of typeChecker.errors) {
        console.error(`${filePath}: ${err}`);
      }
    }
    // Collect statements
    for (const stmt of ast.statements) {
      allStatements.push(stmt);
    }
  }

  // Create merged program
  const mergedAst: AST.Program = {
    statements: allStatements,
  };

  // Compile merged program
  const compiler = new Compiler();
  const bytecode = compiler.compile(mergedAst);

  return { bytecode };
}

function cmdRun(filePaths: string[]): void {
  const { bytecode } = compileMultiple(filePaths);

  const runtime = new Runtime(bytecode);
  try {
    runtime.run();
  } catch (e: any) {
    console.error(`${filePaths[0]}: ${e.message}`);
    process.exit(1);
  }
}

function cmdBuild(filePath: string): void {
  const source = readFile(filePath);
  const { bytecode } = compile(source, filePath);

  const outPath = filePath.replace(/\.tll$/, '') + '.tllbc';
  fs.writeFileSync(outPath, JSON.stringify(bytecode, null, 2));
  console.log(`Compiled to ${outPath}`);
}

function cmdCheck(filePath: string): void {
  const source = readFile(filePath);
  const { ast } = compile(source, filePath);
  const typeChecker = new TypeChecker();
  typeChecker.check(ast);

  if (typeChecker.errors.length === 0) {
    console.log('No errors found.');
  } else {
    for (const err of typeChecker.errors) {
      console.error(err);
    }
    console.error(`Found ${typeChecker.errors.length} error(s).`);
    process.exit(1);
  }
}

function cmdLex(filePath: string): void {
  const source = readFile(filePath);
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();

  for (const token of tokens) {
    const value = token.value ? ` "${token.value}"` : '';
    console.log(`${token.line}:${token.column}  ${token.type}${value}`);
  }
}

function cmdParse(filePath: string): void {
  const source = readFile(filePath);
  const parser = new Parser();
  const ast = parser.parse(source);
  console.log(JSON.stringify(ast, null, 2));
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case 'run':
      if (args.length < 2) {
        console.error('Error: no input file specified');
        process.exit(1);
      }
      cmdRun(args.slice(1));
      break;

    case 'build':
      if (args.length < 2) {
        console.error('Error: no input file specified');
        process.exit(1);
      }
      cmdBuild(args[1]);
      break;

    case 'check':
      if (args.length < 2) {
        console.error('Error: no input file specified');
        process.exit(1);
      }
      cmdCheck(args[1]);
      break;

    case 'lex':
      if (args.length < 2) {
        console.error('Error: no input file specified');
        process.exit(1);
      }
      cmdLex(args[1]);
      break;

    case 'parse':
      if (args.length < 2) {
        console.error('Error: no input file specified');
        process.exit(1);
      }
      cmdParse(args[1]);
      break;

    case 'version':
    case '--version':
    case '-v':
      console.log(`tll version ${VERSION}`);
      break;

    case 'help':
    case '--help':
    case '-h':
      printUsage();
      break;

    default:
      // If argument looks like a .tll file, run it
      if (command.endsWith('.tll')) {
        cmdRun([command]);
      } else {
        console.error(`Unknown command: ${command}`);
        printUsage();
        process.exit(1);
      }
  }
}

main();
