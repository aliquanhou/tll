// TLL Runtime Independence Verification
// Proves: TS Runtime -> vm.tll (TLL VM) -> TLL Compiler -> bytecode
// Instead of: TS Runtime -> TLL Compiler -> bytecode (current selfhost)

const fs = require('fs');
const path = require('path');

const BOOTSTRAP_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(BOOTSTRAP_DIR, '..');
const TLL_COMPILER_DIST = path.join(REPO_ROOT, 'tll-compiler', 'dist', 'src');
const BOOTSTRAP_CLI = path.join(TLL_COMPILER_DIST, 'cli.js');
const { Runtime } = require(path.join(TLL_COMPILER_DIST, 'runtime.js'));

const TMP_DIR = path.join(__dirname, '.tmp', 'runtime-indep');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

function log(msg) { console.log(msg); }

function execTLL(scriptName, cwd) {
  const { execSync } = require('child_process');
  const scriptPath = path.join(cwd || BOOTSTRAP_DIR, scriptName);
  return execSync(
    `node --max-old-space-size=4096 "${BOOTSTRAP_CLI}" run "${scriptPath}"`,
    { cwd: cwd || BOOTSTRAP_DIR, encoding: 'utf8', timeout: 180000, stdio: ['pipe', 'pipe', 'pipe'] }
  );
}

function copyLibAndCompiler(workDir) {
  if (fs.existsSync(workDir)) fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });
  fs.copyFileSync(path.join(BOOTSTRAP_DIR, 'compiler.tll'), path.join(workDir, 'compiler.tll'));
  fs.cpSync(path.join(BOOTSTRAP_DIR, 'lib'), path.join(workDir, 'lib'), { recursive: true });
}

log('========================================');
log('TLL RUNTIME INDEPENDENCE VERIFICATION');
log('TS Runtime -> vm.tll -> TLL Compiler -> bytecode');
log('========================================');
log('');

// Step 1: Generate compiler bytecode (the program that vm.tll will execute)
log('[Step 1] Generating compiler bytecode (A) via bootstrap compiler...');
const genCompilerScript = 'gen_compiler_bc.tll';
execTLL(genCompilerScript, BOOTSTRAP_DIR);
const compilerBcPath = path.join(BOOTSTRAP_DIR, 'compiler_generated.tllbc');
if (!fs.existsSync(compilerBcPath)) throw new Error('compiler_generated.tllbc not found');
const bcA = JSON.parse(fs.readFileSync(compilerBcPath, 'utf8'));
log(`  OK: ${bcA.functions.length} functions, ${bcA.constants.length} constants`);
log('');

// Step 2: Generate vm_launcher bytecode (contains vm.tll + launcher)
log('[Step 2] Compiling vm_launcher.tll (contains TLL VM)...');
const genLauncherScript = path.join(BOOTSTRAP_DIR, 'gen_vm_launcher_bc.tll');
if (!fs.existsSync(genLauncherScript)) {
  fs.writeFileSync(genLauncherScript, `
from "./lib/linker" import linkAndCompile
fn main() -> void {
    let result = linkAndCompile("vm_launcher.tll")
    if result.hasError == true {
        io.println("COMPILE ERROR: " + result.error)
        return
    }
    let jsonStr = json.stringify(result)
    fs.writeFile("vm_launcher.tllbc", jsonStr)
    io.println("vm_launcher bytecode: " + convert.toString(arrays.length(result.functions)) + " functions")
}
main()
`);
}
execTLL('gen_vm_launcher_bc.tll', BOOTSTRAP_DIR);
const launcherBcPath = path.join(BOOTSTRAP_DIR, 'vm_launcher.tllbc');
if (!fs.existsSync(launcherBcPath)) throw new Error('vm_launcher.tllbc not found');
const launcherBc = JSON.parse(fs.readFileSync(launcherBcPath, 'utf8'));
log(`  OK: ${launcherBc.functions.length} functions, ${launcherBc.constants.length} constants`);
log('');

// Step 3: Prepare work directory for vm.tll execution
log('[Step 3] Preparing VM execution environment...');
const workDir = path.join(TMP_DIR, 'vm_work');
copyLibAndCompiler(workDir);
// Copy compiler bytecode as "compiler_for_vm.tllbc" (what vm_launcher reads)
fs.copyFileSync(compilerBcPath, path.join(workDir, 'compiler_for_vm.tllbc'));
log(`  Work dir: ${workDir}`);
log('');

// Step 4: Execute vm_launcher via TS Runtime -> vm.tll interprets compiler bytecode
log('[Step 4] TS Runtime loads vm_launcher -> vm.tll executes compiler bytecode...');
const launcherRuntime = new Runtime(launcherBc);
const origCwd = process.cwd();
process.chdir(workDir);
let vmOutput = '';
const origLog = console.log;
try {
  console.log = (...args) => { vmOutput += args.join(' ') + '\n'; };
  launcherRuntime.run();
  console.log = origLog;
} catch (e) {
  console.log = origLog;
  process.chdir(origCwd);
  log('VM EXECUTION ERROR:');
  log(e.message);
  log(e.stack ? e.stack.split('\n').slice(0, 10).join('\n') : '');
  process.exit(1);
}
process.chdir(origCwd);
log('  VM output (first 20 lines):');
vmOutput.split('\n').slice(0, 20).forEach(l => log('    ' + l));
log('');

// Step 5: Read the bytecode produced by vm.tll-executed compiler
const vmProducedPath = path.join(workDir, 'compiler_self_compiled.tllbc');
if (!fs.existsSync(vmProducedPath)) {
  log('FAIL: vm.tll did not produce compiler_self_compiled.tllbc');
  log('Full VM output:');
  log(vmOutput);
  process.exit(1);
}
const bcB = JSON.parse(fs.readFileSync(vmProducedPath, 'utf8'));
log(`[Step 5] vm.tll produced bytecode: ${bcB.functions.length} functions, ${bcB.constants.length} constants`);
log('');

// Step 6: Compare bcA (bootstrap compiler output) vs bcB (vm.tll-executed compiler output)
log('[Step 6] Comparing bytecode A (bootstrap) vs B (vm.tll executed)...');
function compare(b1, b2) {
  const r = {};
  r.functionCount = b1.functions.length === b2.functions.length;
  r.mainIndex = b1.mainFunctionIndex === b2.mainFunctionIndex;
  r.constantCount = b1.constants.length === b2.constants.length;
  let metaDiff = 0;
  for (let i = 0; i < Math.min(b1.functions.length, b2.functions.length); i++) {
    const f1 = b1.functions[i], f2 = b2.functions[i];
    if ((f1.name||'') !== (f2.name||'') || f1.paramCount !== f2.paramCount || f1.localCount !== f2.localCount) metaDiff++;
  }
  r.functionMeta = metaDiff === 0;
  r.functionMetaDiffs = metaDiff;
  let constDiff = 0;
  for (let i = 0; i < Math.min(b1.constants.length, b2.constants.length); i++) {
    if (JSON.stringify(b1.constants[i]) !== JSON.stringify(b2.constants[i])) constDiff++;
  }
  r.constantContent = constDiff === 0;
  r.constantDiffs = constDiff;
  let instrDiff = 0, total1 = 0, total2 = 0;
  for (let i = 0; i < Math.min(b1.functions.length, b2.functions.length); i++) {
    const i1 = b1.functions[i].instructions || [];
    const i2 = b2.functions[i].instructions || [];
    total1 += i1.length; total2 += i2.length;
    for (let j = 0; j < Math.min(i1.length, i2.length); j++) {
      const s1 = i1[j].op + ':' + (i1[j].operands||[]).join(',');
      const s2 = i2[j].op + ':' + (i2[j].operands||[]).join(',');
      if (s1 !== s2) instrDiff++;
    }
  }
  r.instructionCount = total1 === total2;
  r.instructionSequence = instrDiff === 0;
  r.instructionDiffs = instrDiff;
  r.totalInstructions = total1;
  r.globalCount = (b1.globalCount||0) === (b2.globalCount||0);
  r.schemaKeys = Object.keys(b1).sort().join(',') === Object.keys(b2).sort().join(',');
  r.allPass = r.functionCount && r.mainIndex && r.constantCount && r.functionMeta &&
    r.constantContent && r.instructionCount && r.instructionSequence && r.globalCount && r.schemaKeys;
  return r;
}

const cmp = compare(bcA, bcB);
log(`  Function count:     ${cmp.functionCount ? 'PASS' : 'FAIL'} (${bcA.functions.length} vs ${bcB.functions.length})`);
log(`  Main index:         ${cmp.mainIndex ? 'PASS' : 'FAIL'}`);
log(`  Constant count:     ${cmp.constantCount ? 'PASS' : 'FAIL'} (${bcA.constants.length} vs ${bcB.constants.length})`);
log(`  Function meta:      ${cmp.functionMeta ? 'PASS' : 'FAIL'} (${cmp.functionMetaDiffs} diffs)`);
log(`  Constant content:   ${cmp.constantContent ? 'PASS' : 'FAIL'} (${cmp.constantDiffs} diffs)`);
log(`  Instruction count:  ${cmp.instructionCount ? 'PASS' : 'FAIL'} (${cmp.totalInstructions})`);
log(`  Instruction seq:    ${cmp.instructionSequence ? 'PASS' : 'FAIL'} (${cmp.instructionDiffs} diffs)`);
log(`  Global count:       ${cmp.globalCount ? 'PASS' : 'FAIL'}`);
log(`  Schema keys:        ${cmp.schemaKeys ? 'PASS' : 'FAIL'}`);
log(`  => ${cmp.allPass ? 'ALL PASS — RUNTIME INDEPENDENCE ACHIEVED' : 'FAILED'}`);
log('');

if (cmp.allPass) {
  log('========================================');
  log('RUNTIME INDEPENDENCE: PASS');
  log('TLL VM (vm.tll) successfully executed TLL Compiler');
  log('and produced byte-identical bytecode.');
  log('========================================');
  process.exit(0);
} else {
  log('========================================');
  log('RUNTIME INDEPENDENCE: FAIL');
  log('========================================');
  // Show first diffs
  if (!cmp.constantContent) {
    log('First constant diffs:');
    for (let i = 0; i < Math.min(bcA.constants.length, bcB.constants.length); i++) {
      if (JSON.stringify(bcA.constants[i]) !== JSON.stringify(bcB.constants[i])) {
        log(`  [${i}] A=${JSON.stringify(bcA.constants[i]).slice(0,100)}`);
        log(`       B=${JSON.stringify(bcB.constants[i]).slice(0,100)}`);
        if (i > 5) break;
      }
    }
  }
  if (!cmp.instructionSequence) {
    log('First instruction diffs:');
    let shown = 0;
    for (let i = 0; i < Math.min(bcA.functions.length, bcB.functions.length) && shown < 5; i++) {
      const i1 = bcA.functions[i].instructions || [];
      const i2 = bcB.functions[i].instructions || [];
      for (let j = 0; j < Math.min(i1.length, i2.length) && shown < 5; j++) {
        const s1 = i1[j].op + ':' + (i1[j].operands||[]).join(',');
        const s2 = i2[j].op + ':' + (i2[j].operands||[]).join(',');
        if (s1 !== s2) {
          log(`  fn[${i}][${j}] A=${s1} B=${s2}`);
          shown++;
        }
      }
    }
  }
  process.exit(1);
}
