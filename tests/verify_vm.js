// Acceptance Matrix - Item 6: TLL VM Verification
// Uses vm.tll (via TS Runtime host) to execute bytecode and verify output.
// This proves TLL VM can execute bytecode without TS Runtime semantic support.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BOOTSTRAP_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(BOOTSTRAP_DIR, '..');
const TLL_COMPILER_DIST = path.join(REPO_ROOT, 'bootstrap', 'dist', 'src');
const BOOTSTRAP_CLI = path.join(TLL_COMPILER_DIST, 'cli.js');

const TESTS = [
  { name: '01_hello', expected: 'Hello, TLL!' },
  { name: '02_variables', expected: 'x=10\ny=20\nz=30\nx*2=20' },
  { name: '03_functions', expected: '3+4=7\n5*6=30\nadd(10,20)+multiply(2,3)=36' },
  { name: '04_control_flow', expected: 'n>10\nsum(0..4)=10\n10<n<=20' },
  { name: '05_arrays', expected: 'length=5\narr[0]=1\narr[2]=3\nafter push length=6\narr[5]=6\nsum=21' },
  { name: '06_maps', expected: 'name=TLL\nversion=1\nyear=2026\nversion now=2' },
  { name: '07_recursion', expected: 'factorial(5)=120\nfactorial(10)=3628800\nfib(10)=55' },
  { name: '08_strings', expected: 'length=17\nupper=HELLO, TLL WORLD!\nlower=hello, tll world!\nsubstring(0,5)=Hello\ncharAt(7)=T\ncontains(TLL)=true\nstartsWith(Hello)=true\nendsWith(!)=true' },
  { name: '09_exceptions', expected: 'caught: intentional error\nno error: 42' },
];

function runVMTest(testName) {
  const bcFile = path.join(BOOTSTRAP_DIR, `vm_test_${testName}.tllbc`);
  if (!fs.existsSync(bcFile)) return { status: 'SKIP', reason: 'bytecode not found' };

  // Create a TLL driver that loads bytecode and runs via vm.tll
  const driverCode = `from "./compiler/vm" import run
fn main() -> void {
    let source = fs.readFile("vm_test_${testName}.tllbc")
    let program = json.parse(source)
    run(program)
}
main()`;
  const driverFile = path.join(BOOTSTRAP_DIR, `_vm_driver_${testName}.tll`);
  fs.writeFileSync(driverFile, driverCode);

  try {
    const output = execSync(`node --max-old-space-size=4096 "${BOOTSTRAP_CLI}" run "${driverFile}"`, {
      cwd: BOOTSTRAP_DIR, encoding: 'utf8', timeout: 120000, stdio: ['pipe', 'pipe', 'pipe']
    });
    // Extract VM output (between markers if any, otherwise all stdout after type errors)
    const lines = output.split('\n').filter(l => !l.startsWith('Line ') && !l.startsWith('Found ') && l.trim() !== '');
    const result = lines.join('\n').trim();
    fs.unlinkSync(driverFile);
    return { status: 'OK', output: result };
  } catch (e) {
    try { fs.unlinkSync(driverFile); } catch (_) {}
    return { status: 'ERROR', error: e.message.substring(0, 200) };
  }
}

console.log('========================================');
console.log('ACCEPTANCE MATRIX - Item 6: TLL VM');
console.log('========================================\n');

let passed = 0, failed = 0;
for (const test of TESTS) {
  process.stdout.write(`  [${test.name}] `);
  const result = runVMTest(test.name);
  if (result.status === 'SKIP') {
    console.log('SKIP (' + result.reason + ')');
    continue;
  }
  if (result.status === 'ERROR') {
    console.log('ERROR');
    console.log('    ' + result.error);
    failed++;
    continue;
  }
  if (result.output === test.expected) {
    console.log('PASS');
    passed++;
  } else {
    console.log('FAIL (output mismatch)');
    console.log('    expected: ' + JSON.stringify(test.expected));
    console.log('    got:      ' + JSON.stringify(result.output));
    failed++;
  }
}

console.log(`\n========================================`);
console.log(`TLL VM Result: ${passed} passed, ${failed} failed, ${TESTS.length} total`);
console.log(`========================================`);
process.exit(failed > 0 ? 1 : 0);
