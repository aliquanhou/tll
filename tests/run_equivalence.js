// Runtime Equivalence Test Runner
// Compiles test with TLL compiler, runs on both TS Runtime and TLL VM, compares output
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BOOTSTRAP_DIR = path.join(REPO_ROOT, '');
const BOOTSTRAP_CLI = path.join(REPO_ROOT, 'bootstrap', 'dist', 'src', 'cli.js');
const { Runtime } = require(path.join(REPO_ROOT, 'bootstrap', 'dist', 'src', 'runtime.js'));

function compileTest(testFile) {
  const absPath = path.resolve(testFile);
  const driverCode = 'from "./compiler/linker" import linkAndCompile\n'
    + 'fn main() -> void {\n'
    + '    let bc = linkAndCompile("' + absPath.replace(/\\/g, '/') + '")\n'
    + '    if bc.hasError == true { io.println("COMPILE_ERROR: " + bc.error); return }\n'
    + '    fs.writeFile("__equiv_output.tllbc", json.stringify(bc))\n'
    + '    io.println("COMPILE_OK")\n'
    + '}\nmain()\n';
  const driverFile = path.join(BOOTSTRAP_DIR, '__equiv_driver.tll');
  fs.writeFileSync(driverFile, driverCode);
  try {
    execSync('node --max-old-space-size=4096 "' + BOOTSTRAP_CLI + '" run "' + driverFile + '"', {
      cwd: BOOTSTRAP_DIR, encoding: 'utf8', timeout: 120000, stdio: ['pipe', 'pipe', 'pipe']
    });
    const bcFile = path.join(BOOTSTRAP_DIR, '__equiv_output.tllbc');
    if (fs.existsSync(bcFile)) {
      const bc = JSON.parse(fs.readFileSync(bcFile, 'utf8'));
      fs.unlinkSync(bcFile);
      return bc;
    }
    return null;
  } catch (e) {
    console.error('Compile error:', e.message);
    return null;
  } finally {
    try { fs.unlinkSync(driverFile); } catch (_) {}
  }
}

function runTSRuntime(bytecode) {
  const origLog = console.log;
  let output = '';
  console.log = (...args) => { output += args.join(' ') + '\n'; };
  try {
    const r = new Runtime(bytecode);
    r.run();
  } catch (e) {
    output += 'RUNTIME_ERROR: ' + e.message + '\n';
  }
  console.log = origLog;
  return output.trim();
}

function normalizeOutput(out) {
  // Normalize JSON object lines (key order independent)
  return out.split('\n').map(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const obj = JSON.parse(trimmed);
        return JSON.stringify(obj, Object.keys(obj).sort());
      } catch (e) { return line; }
    }
    return line;
  }).join('\n');
}

function runTLLVM(bytecode) {
  // Write bytecode, run via TLL VM (vm.tll) through bootstrap
  const bcFile = path.join(BOOTSTRAP_DIR, '__equiv_vm_input.tllbc');
  fs.writeFileSync(bcFile, JSON.stringify(bytecode));
  const driverCode = 'from "./compiler/vm" import run\n'
    + 'fn main() -> void {\n'
    + '    let bc = json.parse(fs.readFile("__equiv_vm_input.tllbc"))\n'
    + '    run(bc)\n'
    + '}\nmain()\n';
  const driverFile = path.join(BOOTSTRAP_DIR, '__equiv_vm_driver.tll');
  fs.writeFileSync(driverFile, driverCode);
  try {
    const out = execSync('node --max-old-space-size=4096 "' + BOOTSTRAP_CLI + '" run "' + driverFile + '"', {
      cwd: BOOTSTRAP_DIR, encoding: 'utf8', timeout: 300000, stdio: ['pipe', 'pipe', 'pipe']
    });
    // Filter out compiler warnings
    const lines = out.split('\n').filter(l => !l.includes('Line ') && !l.includes('Found ') && !l.includes('Resolved') && !l.includes('.tll') && l.trim() !== '');
    return lines.join('\n').trim();
  } catch (e) {
    return 'VM_ERROR: ' + e.message;
  } finally {
    try { fs.unlinkSync(bcFile); } catch (_) {}
    try { fs.unlinkSync(driverFile); } catch (_) {}
  }
}

// Run tests
const testDir = path.join(BOOTSTRAP_DIR, 'tests', 'runtime-equivalence');
const tests = fs.readdirSync(testDir).filter(f => f.endsWith('.tll')).sort();
let passed = 0, failed = 0;

for (const test of tests) {
  const testPath = path.join(testDir, test);
  process.stdout.write('[' + test + '] compiling... ');
  const bc = compileTest(testPath);
  if (!bc) { console.log('COMPILE FAIL'); failed++; continue; }
  process.stdout.write('TS Runtime... ');
  const tsOut = runTSRuntime(bc);
  process.stdout.write('TLL VM... ');
  const vmOut = runTLLVM(bc);
  const tsNorm = normalizeOutput(tsOut);
  const vmNorm = normalizeOutput(vmOut);
  if (tsNorm === vmNorm) {
    console.log('PASS');
    passed++;
  } else {
    console.log('FAIL');
    console.log('  TS Runtime:');
    tsOut.split('\n').forEach(l => console.log('    ' + l));
    console.log('  TLL VM:');
    vmOut.split('\n').forEach(l => console.log('    ' + l));
    failed++;
  }
}

console.log('\n========================================');
console.log('Runtime Equivalence: ' + passed + ' passed, ' + failed + ' failed, ' + tests.length + ' total');
console.log('========================================');
process.exit(failed > 0 ? 1 : 0);
