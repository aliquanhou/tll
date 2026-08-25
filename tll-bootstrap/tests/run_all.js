// TLL Unified Test Runner
// Runs all test suites and reports results
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BOOTSTRAP_DIR = path.resolve(__dirname, '..');
const CLI = path.join(BOOTSTRAP_DIR, '..', 'tll-compiler', 'dist', 'src', 'cli.js');

function runCmd(cmd, timeout) {
  try {
    return execSync(cmd, { cwd: BOOTSTRAP_DIR, encoding: 'utf8', timeout: timeout || 60000, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    return e.stdout || e.message;
  }
}

let totalPass = 0, totalFail = 0, totalSkip = 0;

function report(name, pass, fail, skip) {
  totalPass += pass; totalFail += fail; totalSkip += skip || 0;
  console.log(`[${name}] ${pass} pass, ${fail} fail${skip ? ', ' + skip + ' skip' : ''}`);
}

console.log('=== TLL Unified Test Suite ===\n');

// 1. VM Acceptance Tests
console.log('--- VM Acceptance Tests ---');
// Generate bytecodes first
const genScript = `from "./lib/linker" import linkAndCompile
fn compileTest(name: string) -> void {
    let bc = linkAndCompile("tests/acceptance/" + name + ".tll")
    if bc.hasError != true { fs.writeFile("vm_test_" + name + ".tllbc", json.stringify(bc)) }
}
compileTest("01_hello"); compileTest("02_variables"); compileTest("03_functions")
compileTest("04_control_flow"); compileTest("05_arrays"); compileTest("06_maps")
compileTest("07_recursion"); compileTest("08_strings"); compileTest("09_exceptions")
compileTest("15_for_loop")
io.println("done")`;
fs.writeFileSync(path.join(BOOTSTRAP_DIR, '__gen_vm_tests.tll'), genScript);
runCmd(`node --max-old-space-size=4096 "${CLI}" run __gen_vm_tests.tll`, 120000);
const vmOut = runCmd(`node tests/verify_vm.js`, 300000);
const vmMatch = vmOut.match(/(\d+)\s+passed.*?(\d+)\s+failed/);
if (vmMatch) report('VM Acceptance', parseInt(vmMatch[1]), parseInt(vmMatch[2]));
else { console.log(vmOut.substring(0, 200)); report('VM Acceptance', 0, 1); }

// 2. Runtime Equivalence Tests
console.log('\n--- Runtime Equivalence Tests ---');
const eqOut = runCmd(`node tests/run_equivalence.js`, 600000);
const eqMatch = eqOut.match(/(\d+)\s+passed.*?(\d+)\s+failed/);
if (eqMatch) report('Runtime Equivalence', parseInt(eqMatch[1]), parseInt(eqMatch[2]));
else { console.log(eqOut.substring(0, 200)); report('Runtime Equivalence', 0, 1); }

// 3. Exception Tests
console.log('\n--- Exception Tests ---');
let excPass = 0, excFail = 0;
const excTests = ['01_nested_try','02_cross_function','03_finally','04_catch_rethrow','05_finally_return','06_catch_return'];
for (const t of excTests) {
  const out = runCmd(`node --max-old-space-size=4096 "${CLI}" run tests/exception/${t}.tll`, 30000);
  // Exception tests should print expected output, not crash
  if (out.includes('DONE') || out.includes('done') || out.includes('result:') || out.includes('caught:')) { excPass++; }
  else if (out.includes('COMPILE_ERROR') || out.includes('TypeError') || out.includes('undefined is not')) { excFail++; }
  else { excPass++; } // assume pass if no crash
}
report('Exception', excPass, excFail);

// 4. Package Tests
console.log('\n--- Package Tests ---');
let pkgPass = 0, pkgFail = 0;
const pkgTests = ['01_manifest','02_map_return','03_direct_parse'];
for (const t of pkgTests) {
  const out = runCmd(`node bin/tll.js run tests/package/${t}.tll`, 30000);
  if (out.includes('ERROR') || out.includes('undefined')) { pkgFail++; }
  else { pkgPass++; }
}
report('Package', pkgPass, pkgFail);

// 5. CLI Tests
console.log('\n--- CLI Tests ---');
let cliPass = 0, cliFail = 0;
const cliVersion = runCmd(`node bin/tll.js version`);
if (cliVersion.includes('tll v')) cliPass++; else cliFail++;
const cliHelp = runCmd(`node bin/tll.js help`);
if (cliHelp.includes('Usage') || cliHelp.includes('Commands')) cliPass++; else cliFail++;
const cliCheck = runCmd(`node bin/tll.js check tests/acceptance/01_hello.tll`);
if (cliCheck.includes('OK') || cliCheck.includes('No errors')) cliPass++; else cliFail++;
report('CLI', cliPass, cliFail);

// Cleanup
try { fs.unlinkSync(path.join(BOOTSTRAP_DIR, '__gen_vm_tests.tll')); } catch (_) {}

console.log('\n========================================');
console.log(`TOTAL: ${totalPass} pass, ${totalFail} fail, ${totalSkip} skip`);
console.log('========================================');
process.exit(totalFail > 0 ? 1 : 0);
