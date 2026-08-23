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
  init [name]      Initialize a new TLL project (creates tll.toml)
  run [file]       Compile and run a TLL program (uses tll.toml entry if no file)
  build <file>     Compile to bytecode (.tllbc)
  check <file>     Type-check only (no codegen)
  install [pkg]    Install dependencies (registry coming in v0.4)
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

// ============ Simple TOML Parser ============
interface TomlData {
  [section: string]: { [key: string]: string | number | boolean };
}

function parseToml(content: string): TomlData {
  const result: TomlData = {};
  let currentSection = '';
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    // Section header
    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      if (!result[currentSection]) result[currentSection] = {};
      continue;
    }
    // Key = value
    const kvMatch = trimmed.match(/^([^=]+)=(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim();
      let value: string | number | boolean = kvMatch[2].trim();
      // String
      if ((value as string).startsWith('"') && (value as string).endsWith('"')) {
        value = (value as string).slice(1, -1);
      } else if (value === 'true') {
        value = true;
      } else if (value === 'false') {
        value = false;
      } else if (!isNaN(Number(value))) {
        value = Number(value);
      }
      if (currentSection) {
        result[currentSection][key] = value;
      }
    }
  }
  return result;
}

function readTomlConfig(dir: string): TomlData | null {
  const tomlPath = path.join(dir, 'tll.toml');
  if (!fs.existsSync(tomlPath)) return null;
  return parseToml(fs.readFileSync(tomlPath, 'utf-8'));
}

// ============ Package Commands ============
function cmdInit(name?: string): void {
  const cwd = process.cwd();
  const projectName = name || path.basename(cwd);
  const tomlPath = path.join(cwd, 'tll.toml');

  if (fs.existsSync(tomlPath)) {
    console.error(`Error: tll.toml already exists in ${cwd}`);
    process.exit(1);
  }

  const tomlContent = `[package]
name = "${projectName}"
version = "0.1.0"
entry = "main.tll"

[dependencies]
`;

  fs.writeFileSync(tomlPath, tomlContent);
  console.log(`Created tll.toml for project "${projectName}"`);

  // Create default main.tll if it doesn't exist
  const mainPath = path.join(cwd, 'main.tll');
  if (!fs.existsSync(mainPath)) {
    fs.writeFileSync(mainPath, `// ${projectName} - entry point
io.println("Hello, ${projectName}!")
`);
    console.log(`Created main.tll`);
  }

  console.log(`\nNext steps:`);
  console.log(`  tll run          # Run the project`);
  console.log(`  tll check        # Type-check only`);
}

function cmdInstall(packageName?: string): void {
  const cwd = process.cwd();
  const config = readTomlConfig(cwd);

  if (!config) {
    console.error('Error: no tll.toml found. Run "tll init" first.');
    process.exit(1);
  }

  if (!packageName) {
    // Install all dependencies from tll.toml
    const deps = config['dependencies'] || {};
    const depNames = Object.keys(deps);
    if (depNames.length === 0) {
      console.log('No dependencies to install.');
      return;
    }
    console.log(`Installing ${depNames.length} dependency(ies)...`);
    for (const dep of depNames) {
      console.log(`  ${dep}@${deps[dep]} (registry not available yet - placeholder)`);
    }
    console.log('\nNote: Package registry is not yet implemented in bootstrap.');
    console.log('Dependencies will be available in TLL v0.4+.');
    return;
  }

  // Install a specific package
  console.log(`Installing ${packageName}...`);
  console.log('Note: Package registry is not yet implemented in bootstrap.');
  console.log('Add the dependency manually to tll.toml [dependencies] section.');
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

  if (filePaths.length === 0) {
    // No file specified: read entry from tll.toml
    const config = readTomlConfig(process.cwd());
    if (!config) {
      console.error('Error: no input file specified and no tll.toml found');
      console.error('Usage: tll run <file>  or  run "tll init" to create a project');
      process.exit(1);
    }
    const entry = config['package']?.['entry'] as string | undefined;
    if (!entry) {
      console.error('Error: tll.toml has no [package].entry field');
      process.exit(1);
    }
    const entryPath = path.resolve(process.cwd(), entry);
    console.error(`Using entry from tll.toml: ${entry}`);
    filesToCompile = resolveDependencies(entryPath);
  } else if (filePaths.length === 1) {
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
    console.error(`${filePaths[0] || 'tll.toml'}: ${e.message}`);
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
      cmdRun(args.slice(1));
      break;

    case 'init':
      cmdInit(args[1]);
      break;

    case 'install':
    case 'i':
      cmdInstall(args[1]);
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
