#!/usr/bin/env node
// TLL Programming Language - Official CLI
// Usage: tll <command> [options] <file>
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const TLL_COMPILER_DIST = path.join(REPO_ROOT, 'tll-compiler', 'dist', 'src');
const BOOTSTRAP_CLI = path.join(TLL_COMPILER_DIST, 'cli.js');
const BOOTSTRAP_DIR = path.join(REPO_ROOT, 'tll-bootstrap');
const { Runtime } = require(path.join(TLL_COMPILER_DIST, 'runtime.js'));
const VERSION = '1.0.0-dev';

function printHelp() {
  console.log('TLL Programming Language v' + VERSION);
  console.log('');
  console.log('Usage: tll <command> [options] <file>');
  console.log('');
  console.log('Commands:');
  console.log('  run <file>       Compile and execute a TLL program');
  console.log('  build <file>     Compile to bytecode (.tllbc)');
  console.log('  check <file>     Parse and typecheck only');
  console.log('  repl             Start interactive REPL');
  console.log('  version          Print version');
  console.log('  help             Print this help');
}

function resolveFile(file) {
  if (!fs.existsSync(file)) {
    console.error('Error: file not found: ' + file);
    process.exit(1);
  }
  return path.resolve(file);
}

function compileWithTLLCompiler(filePath) {
  const driverCode = 'from "./lib/linker" import linkAndCompile\n'
    + 'fn main() -> void {\n'
    + '    let bc = linkAndCompile("' + filePath.replace(/\\/g, '/') + '")\n'
    + '    if bc.hasError == true { io.println("COMPILE_ERROR: " + bc.error); return }\n'
    + '    fs.writeFile("__tll_build_output.tllbc", json.stringify(bc))\n'
    + '    io.println("COMPILE_OK")\n'
    + '}\nmain()\n';
  const driverFile = path.join(BOOTSTRAP_DIR, '__tll_cli_driver.tll');
  fs.writeFileSync(driverFile, driverCode);
  try {
    execSync('node --max-old-space-size=4096 "' + BOOTSTRAP_CLI + '" run "' + driverFile + '"', {
      cwd: BOOTSTRAP_DIR, encoding: 'utf8', timeout: 120000, stdio: ['pipe', 'pipe', 'pipe']
    });
    const bcFile = path.join(BOOTSTRAP_DIR, '__tll_build_output.tllbc');
    if (fs.existsSync(bcFile)) {
      const bc = JSON.parse(fs.readFileSync(bcFile, 'utf8'));
      fs.unlinkSync(bcFile);
      return { success: true, bytecode: bc };
    }
    return { success: false, error: 'No bytecode output' };
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    try { fs.unlinkSync(driverFile); } catch (_) {}
  }
}

function cmdRun(file) {
  const filePath = resolveFile(file);
  process.stdout.write('Compiling ' + path.basename(filePath) + '... ');
  const result = compileWithTLLCompiler(filePath);
  if (!result.success) {
    console.log('FAILED');
    console.error(result.error);
    process.exit(1);
  }
  console.log('OK');
  console.log('--- output ---');

  // P0-1.6A.2: Execute via TLL VM (vm_run.tllbc), not TS Runtime directly.
  // TS Runtime now only acts as the initial bytecode loader for TLL VM itself.
  const vmRunnerPath = path.join(BOOTSTRAP_DIR, 'vm_run.tllbc');
  // Auto-bootstrap vm_run.tllbc if missing (fresh clone support)
  if (!fs.existsSync(vmRunnerPath)) {
    process.stderr.write('Bootstrapping vm_run.tllbc (first run)... ');
    try {
      execSync('node --max-old-space-size=4096 "' + BOOTSTRAP_CLI + '" build vm_run.tll', {
        cwd: BOOTSTRAP_DIR, stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000
      });
      process.stderr.write('done\n');
    } catch (e) {
      process.stderr.write('FAILED\n');
      console.error('Error: failed to build vm_run.tllbc:', e.message);
      process.exit(1);
    }
  }

  // Write user bytecode where vm_run.tll expects it (vm_run_target.tllbc in cwd)
  const targetDir = path.dirname(filePath);
  const targetPath = path.join(targetDir, 'vm_run_target.tllbc');
  fs.writeFileSync(targetPath, JSON.stringify(result.bytecode));

  const origCwd = process.cwd();
  process.chdir(targetDir);
  try {
    const vmBytecode = JSON.parse(fs.readFileSync(vmRunnerPath, 'utf8'));
    const runtime = new Runtime(vmBytecode);
    runtime.run();
  } catch (e) {
    console.error('Runtime error:', e.message);
    process.exit(1);
  } finally {
    process.chdir(origCwd);
    try { fs.unlinkSync(targetPath); } catch (_) {}
  }
}

function cmdBuild(file, output) {
  const filePath = resolveFile(file);
  const outFile = output || filePath.replace(/\.tll$/, '') + '.tllbc';
  process.stdout.write('Compiling ' + path.basename(filePath) + '... ');
  const result = compileWithTLLCompiler(filePath);
  if (!result.success) {
    console.log('FAILED');
    console.error(result.error);
    process.exit(1);
  }
  fs.writeFileSync(outFile, JSON.stringify(result.bytecode));
  console.log('OK');
  console.log('Output: ' + outFile);
  console.log('Functions: ' + result.bytecode.functions.length + ', Constants: ' + result.bytecode.constants.length);
}

function cmdCheck(file) {
  const filePath = resolveFile(file);
  process.stdout.write('Checking ' + path.basename(filePath) + '... ');
  const result = compileWithTLLCompiler(filePath);
  if (!result.success) {
    console.log('FAILED');
    console.error(result.error);
    process.exit(1);
  }
  console.log('OK - No errors found.');
}

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
  printHelp(); process.exit(0);
}
if (args[0] === 'version' || args[0] === '--version' || args[0] === '-v') {
  console.log('tll v' + VERSION); process.exit(0);
}
const command = args[0];
const file = args[1];
let output = null;
for (let i = 2; i < args.length; i++) {
  if (args[i] === '-o' && args[i+1]) { output = args[i+1]; i++; }
}
if (command !== 'repl' && !file) { console.error('Error: no input file'); printHelp(); process.exit(1); }
switch (command) {
  case 'run': cmdRun(file); break;
  case 'build': cmdBuild(file, output); break;
  case 'check': cmdCheck(file); break;
  case 'repl': require(path.join(__dirname, 'tll-repl.js')); break;
  default: console.error('Error: unknown command: ' + command); printHelp(); process.exit(1);
}
