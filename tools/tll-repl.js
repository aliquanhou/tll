#!/usr/bin/env node
// TLL REPL - Read Eval Print Loop
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BOOTSTRAP_CLI = path.join(REPO_ROOT, 'tll-compiler', 'dist', 'src', 'cli.js');
const BOOTSTRAP_DIR = path.join(REPO_ROOT, 'tll-bootstrap');
const { Runtime } = require(path.join(REPO_ROOT, 'tll-compiler', 'dist', 'src', 'runtime.js'));

const VERSION = '1.0.0-dev';
let stmtCounter = 0;
let accumulatedCode = '';

function compileAndRun(code) {
  const driverCode = 'from "./lib/linker" import linkAndCompile\n'
    + 'fn main() -> void {\n'
    + code + '\n'
    + '}\nmain()\n';
  const driverFile = path.join(BOOTSTRAP_DIR, '__repl_input.tll');
  fs.writeFileSync(driverFile, driverCode);
  try {
    // Compile with TLL compiler
    const compileDriver = 'from "./lib/linker" import linkAndCompile\n'
      + 'fn main() -> void {\n'
      + '    let bc = linkAndCompile("__repl_input.tll")\n'
      + '    if bc.hasError == true { io.println("ERR: " + bc.error); return }\n'
      + '    fs.writeFile("__repl_bc.tllbc", json.stringify(bc))\n'
      + '    io.println("OK")\n'
      + '}\nmain()\n';
    const cdFile = path.join(BOOTSTRAP_DIR, '__repl_compile.tll');
    fs.writeFileSync(cdFile, compileDriver);
    execSync(`node --max-old-space-size=4096 "${BOOTSTRAP_CLI}" run "${cdFile}"`, {
      cwd: BOOTSTRAP_DIR, encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe']
    });
    const bcFile = path.join(BOOTSTRAP_DIR, '__repl_bc.tllbc');
    if (fs.existsSync(bcFile)) {
      const bc = JSON.parse(fs.readFileSync(bcFile, 'utf8'));
      const runtime = new Runtime(bc);
      runtime.run();
      fs.unlinkSync(bcFile);
    }
    try { fs.unlinkSync(cdFile); } catch (_) {}
  } catch (e) {
    const msg = e.message || String(e);
    if (msg.includes('COMPILE_ERROR') || msg.includes('Parse error') || msg.includes('type')) {
      console.log('Error: ' + msg.split('\n').find(l => l.includes('error') || l.includes('Error')) || msg);
    } else {
      console.log('Runtime error: ' + msg);
    }
  } finally {
    try { fs.unlinkSync(driverFile); } catch (_) {}
  }
}

console.log('TLL REPL v' + VERSION);
console.log('Type TLL expressions or statements. Type :quit to exit.');
console.log('');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function prompt() {
  rl.question('tll> ', (input) => {
    const trimmed = input.trim();
    if (trimmed === ':quit' || trimmed === ':q' || trimmed === 'exit') {
      console.log('Bye!');
      rl.close();
      return;
    }
    if (trimmed === ':clear' || trimmed === ':c') {
      accumulatedCode = '';
      console.log('Cleared.');
      prompt();
      return;
    }
    if (trimmed.length > 0) {
      compileAndRun(trimmed);
    }
    prompt();
  });
}

prompt();
