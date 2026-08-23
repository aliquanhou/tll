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

  // First pass: parse all files and collect statements
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
    // Collect statements
    for (const stmt of ast.statements) {
      allStatements.push(stmt);
    }
  }

  // Create merged program
  const mergedAst: AST.Program = {
    statements: allStatements,
  };

  // Type check merged program (cross-module symbol resolution)
  const typeChecker = new TypeChecker();
  typeChecker.check(mergedAst);
  if (typeChecker.errors.length > 0) {
    for (const err of typeChecker.errors) {
      console.error(err);
    }
    console.error(`Found ${typeChecker.errors.length} type error(s).`);
  }

  // Compile merged program
  const compiler = new Compiler();
  const bytecode = compiler.compile(mergedAst);

  return { bytecode };
}

// Extract import module paths from AST
function extractImports(ast: AST.Program): string[] {
  const imports: string[] = [];
  for (const stmt of ast.statements) {
    if (stmt.kind === 'Import') {
      imports.push(stmt.modulePath);
    }
  }
  return imports;
}

// Check if a module path is a relative path (user module) vs stdlib
function isRelativeModule(modulePath: string): boolean {
  return modulePath.startsWith('./') || modulePath.startsWith('../');
}

// Resolve module path relative to current file's directory
function resolveModulePath(currentFile: string, modulePath: string): string {
  const dir = path.dirname(currentFile);
  let resolved = path.resolve(dir, modulePath);
  // Add .tll extension if missing
  if (!resolved.endsWith('.tll')) {
    resolved += '.tll';
  }
  return resolved;
}

// Recursively resolve all dependencies, return files in dependency order
function resolveDependencies(entryPath: string): string[] {
  const resolved = path.resolve(entryPath);
  const loaded = new Set<string>();
  const order: string[] = [];

  function load(filePath: string) {
    if (loaded.has(filePath)) return;
    loaded.add(filePath);

    if (!fs.existsSync(filePath)) {
      console.error(`Error: module not found: ${filePath}`);
      process.exit(1);
    }

    const source = readFile(filePath);
    const parser = new Parser();
    let ast;
    try {
      ast = parser.parse(source);
    } catch (e: any) {
      console.error(`${filePath}: ${e.message}`);
      process.exit(1);
    }

    // Load dependencies first
    const imports = extractImports(ast);
    for (const modPath of imports) {
      if (isRelativeModule(modPath)) {
        const depPath = resolveModulePath(filePath, modPath);
        load(depPath);
      }
      // Stdlib modules (io, math, etc.) are built-in, skip
    }

    // Add current file after dependencies
    order.push(filePath);
  }

  load(resolved);
  return order;
}

function cmdRun(filePaths: string[]): void {
  let filesToCompile: string[];

  if (filePaths.length === 1) {
    // Single entry file: auto-resolve dependencies
    filesToCompile = resolveDependencies(filePaths[0]);
    if (filesToCompile.length > 1) {
      console.error(`Resolved ${filesToCompile.length} module(s):`);
      for (const f of filesToCompile) {
        console.error(`  ${f}`);
      }
    }
  } else {
    // Multiple files explicitly specified
    filesToCompile = filePaths.map(f => path.resolve(f));
  }

  const { bytecode } = compileMultiple(filesToCompile);

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
