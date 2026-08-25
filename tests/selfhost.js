// TLL Self-Hosting Verification (L4 + L5 + Full Determinism)
// A5.2: Three-way comparison A vs B, B vs C, A vs C
// Portable: resolves paths relative to repo root.
const fs = require('fs');
const path = require('path');

const BOOTSTRAP_DIR = process.env.TLL_BOOTSTRAP_DIR || path.resolve(__dirname, '..');
const REPO_ROOT = BOOTSTRAP_DIR;
const TLL_COMPILER_DIST = process.env.TLL_COMPILER_DIST || path.join(REPO_ROOT, 'bootstrap', 'dist');
const BOOTSTRAP_CLI = path.join(TLL_COMPILER_DIST, 'cli.js');
const RUNTIME_PATH = path.join(TLL_COMPILER_DIST, 'runtime.js');
const { Runtime } = require(RUNTIME_PATH);

const TMP_DIR = path.join(__dirname, '.tmp');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const BYTECODE_A = path.join(TMP_DIR, 'selfhost_a.tllbc');
const BYTECODE_B = path.join(TMP_DIR, 'selfhost_b.tllbc');
const BYTECODE_C = path.join(TMP_DIR, 'selfhost_c.tllbc');

function log(msg) { console.log(msg); }

function runBootstrapCompiler(outputPath) {
  const genFile = path.join(BOOTSTRAP_DIR, 'tools', 'gen_compiler_bc.tll');
  const defaultOutput = path.join(BOOTSTRAP_DIR, 'compiler_generated.tllbc');
  if (fs.existsSync(defaultOutput)) fs.unlinkSync(defaultOutput);
  const { execSync } = require('child_process');
  try {
    execSync(`node --max-old-space-size=4096 "${BOOTSTRAP_CLI}" run "${genFile}"`, {
      cwd: BOOTSTRAP_DIR, encoding: 'utf8', timeout: 120000, stdio: ['pipe', 'pipe', 'pipe']
    });
    if (!fs.existsSync(defaultOutput)) throw new Error('Bootstrap compiler did not produce output bytecode');
    fs.copyFileSync(defaultOutput, outputPath);
    fs.unlinkSync(defaultOutput);
    return JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  } catch (e) {
    try { if (fs.existsSync(defaultOutput)) fs.unlinkSync(defaultOutput); } catch (_) {}
    throw e;
  }
}

function runBytecodeCompiler(bytecodePath, outputPath) {
  const bc = JSON.parse(fs.readFileSync(bytecodePath, 'utf8'));
  const workDir = path.join(TMP_DIR, 'selfhost_work');
  if (!fs.existsSync(workDir)) fs.mkdirSync(workDir, { recursive: true });
  const compilerSrc = path.join(BOOTSTRAP_DIR, 'compiler', 'compiler.tll');
  const libSrc = path.join(BOOTSTRAP_DIR, 'compiler');
  const compilerDst = path.join(workDir, 'compiler.tll');
  fs.copyFileSync(compilerSrc, compilerDst);
  // Copy all compiler/*.tll files to workDir root (compiler.tll uses sibling imports)
  fs.readdirSync(libSrc).forEach(f => {
    if (f.endsWith('.tll') && f !== 'compiler.tll') {
      fs.copyFileSync(path.join(libSrc, f), path.join(workDir, f));
    }
  });

  const defaultOutput = path.join(workDir, 'compiler_self_compiled.tllbc');
  if (fs.existsSync(defaultOutput)) fs.unlinkSync(defaultOutput);

  const runtime = new Runtime(bc);
  const origCwd = process.cwd();
  process.chdir(workDir);
  try {
    runtime.run();
  } finally {
    process.chdir(origCwd);
  }

  if (!fs.existsSync(defaultOutput)) throw new Error('TLL compiler did not produce output bytecode');
  fs.copyFileSync(defaultOutput, outputPath);
  return JSON.parse(fs.readFileSync(outputPath, 'utf8'));
}

// Full bytecode comparison: 9 dimensions
function compareBytecodes(b1, b2, label) {
  const r = {};
  const diffs = {};

  // 1. Function count
  r.functionCount = b1.functions.length === b2.functions.length;
  diffs.functionCount = b1.functions.length + ' vs ' + b2.functions.length;

  // 2. Main function index
  r.mainIndex = b1.mainFunctionIndex === b2.mainFunctionIndex;
  diffs.mainIndex = b1.mainFunctionIndex + ' vs ' + b2.mainFunctionIndex;

  // 3. Constant count
  r.constantCount = b1.constants.length === b2.constants.length;
  diffs.constantCount = b1.constants.length + ' vs ' + b2.constants.length;

  // 4. Function metadata: name + paramCount + localCount
  let metaDiff = 0;
  const metaDiffs = [];
  for (let i = 0; i < Math.min(b1.functions.length, b2.functions.length); i++) {
    const f1 = b1.functions[i];
    const f2 = b2.functions[i];
    const n1 = f1.name || '';
    const n2 = f2.name || '';
    const p1 = f1.paramCount !== undefined ? f1.paramCount : (f1.params ? f1.params.length : -1);
    const p2 = f2.paramCount !== undefined ? f2.paramCount : (f2.params ? f2.params.length : -1);
    const l1 = f1.localCount !== undefined ? f1.localCount : -1;
    const l2 = f2.localCount !== undefined ? f2.localCount : -1;
    if (n1 !== n2 || p1 !== p2 || l1 !== l2) {
      metaDiff++;
      if (metaDiffs.length < 10) metaDiffs.push({ idx: i, a: `${n1}(p=${p1},l=${l1})`, b: `${n2}(p=${p2},l=${l2})` });
    }
  }
  r.functionMeta = metaDiff === 0;
  r.functionMetaDiffs = metaDiff;
  r.functionMetaDetails = metaDiffs;

  // 5. Constant content
  let constDiff = 0;
  const constDiffs = [];
  for (let i = 0; i < Math.min(b1.constants.length, b2.constants.length); i++) {
    if (JSON.stringify(b1.constants[i]) !== JSON.stringify(b2.constants[i])) {
      constDiff++;
      if (constDiffs.length < 10) constDiffs.push({ idx: i, a: JSON.stringify(b1.constants[i]), b: JSON.stringify(b2.constants[i]) });
    }
  }
  r.constantContent = constDiff === 0;
  r.constantDiffs = constDiff;
  r.constantDetails = constDiffs;

  // 6. Instruction count + 7. Instruction sequence
  let totalInstr1 = 0, totalInstr2 = 0, instrDiff = 0;
  const instrDiffs = [];
  for (let i = 0; i < Math.min(b1.functions.length, b2.functions.length); i++) {
    const f1 = b1.functions[i].instructions || [];
    const f2 = b2.functions[i].instructions || [];
    totalInstr1 += f1.length;
    totalInstr2 += f2.length;
    for (let j = 0; j < Math.min(f1.length, f2.length); j++) {
      const s1 = f1[j].op + ':' + (f1[j].operands ? f1[j].operands.join(',') : '');
      const s2 = f2[j].op + ':' + (f2[j].operands ? f2[j].operands.join(',') : '');
      if (s1 !== s2) {
        instrDiff++;
        if (instrDiffs.length < 10) instrDiffs.push({ fn: i, idx: j, a: s1, b: s2 });
      }
    }
  }
  r.instructionCount = totalInstr1 === totalInstr2;
  r.instructionSequence = instrDiff === 0;
  r.instructionDiffs = instrDiff;
  r.instructionDetails = instrDiffs;
  r.totalInstructions = totalInstr1;

  // 8. Global count (if present)
  if (b1.globalCount !== undefined || b2.globalCount !== undefined) {
    r.globalCount = (b1.globalCount || 0) === (b2.globalCount || 0);
  } else {
    r.globalCount = true; // not present in schema, skip
  }

  // 9. Top-level keys consistency
  const keys1 = Object.keys(b1).sort().join(',');
  const keys2 = Object.keys(b2).sort().join(',');
  r.schemaKeys = keys1 === keys2;

  r.allPass = r.functionCount && r.mainIndex && r.constantCount &&
    r.functionMeta && r.constantContent && r.instructionCount && r.instructionSequence &&
    r.globalCount && r.schemaKeys;

  return r;
}

function printComparison(label, cmp) {
  log(`${label}`);
  log(`  Function count:     ${cmp.functionCount ? 'PASS' : 'FAIL'} (${cmp.functionCount ? '' : cmp.diffs ? cmp.diffs.functionCount : ''})`);
  log(`  Main index:         ${cmp.mainIndex ? 'PASS' : 'FAIL'}`);
  log(`  Constant count:     ${cmp.constantCount ? 'PASS' : 'FAIL'}`);
  log(`  Function meta:      ${cmp.functionMeta ? 'PASS' : 'FAIL'} (${cmp.functionMetaDiffs} diffs)`);
  if (!cmp.functionMeta && cmp.functionMetaDetails) {
    cmp.functionMetaDetails.forEach(d => log(`    [${d.idx}] A=${d.a} B=${d.b}`));
  }
  log(`  Constant content:   ${cmp.constantContent ? 'PASS' : 'FAIL'} (${cmp.constantDiffs} diffs)`);
  if (!cmp.constantContent && cmp.constantDetails) {
    cmp.constantDetails.forEach(d => log(`    [${d.idx}] A=${d.a} B=${d.b}`));
  }
  log(`  Instruction count:  ${cmp.instructionCount ? 'PASS' : 'FAIL'} (${cmp.totalInstructions})`);
  log(`  Instruction seq:    ${cmp.instructionSequence ? 'PASS' : 'FAIL'} (${cmp.instructionDiffs} diffs)`);
  if (!cmp.instructionSequence && cmp.instructionDetails) {
    cmp.instructionDetails.forEach(d => log(`    fn[${d.fn}][${d.idx}] A=${d.a} B=${d.b}`));
  }
  log(`  Global count:       ${cmp.globalCount ? 'PASS' : 'FAIL'}`);
  log(`  Schema keys:        ${cmp.schemaKeys ? 'PASS' : 'FAIL'}`);
  log(`  => ${cmp.allPass ? 'ALL PASS' : 'FAILED'}`);
  log('');
}

function printRound(label, bc) {
  let totalInstr = 0;
  for (let i = 0; i < bc.functions.length; i++) {
    totalInstr += (bc.functions[i].instructions || []).length;
  }
  log(`${label}:`);
  log(`  Functions: ${bc.functions.length}`);
  log(`  Constants: ${bc.constants.length}`);
  log(`  Instructions: ${totalInstr}`);
  log(`  Main: ${bc.mainFunctionIndex}`);
  log('');
}

// Main
log('========================================');
log('TLL SELF-HOSTING VERIFICATION (L4 + L5)');
log('A5.2: Three-way full determinism (A vs B, B vs C, A vs C)');
log('========================================');
log('');

try {
  log('[L4] Bootstrap compiler -> compiler.tll -> bytecode A ...');
  const bcA = runBootstrapCompiler(BYTECODE_A);
  log(`      OK: ${bcA.functions.length} functions, ${bcA.constants.length} constants`);
  log('');

  log('[L4] TLL VM executes bytecode A -> compiler.tll -> bytecode B ...');
  const bcB = runBytecodeCompiler(BYTECODE_A, BYTECODE_B);
  log(`      OK: ${bcB.functions.length} functions, ${bcB.constants.length} constants`);
  log('');

  log('[L5] TLL VM executes bytecode B -> compiler.tll -> bytecode C ...');
  const bcC = runBytecodeCompiler(BYTECODE_B, BYTECODE_C);
  log(`      OK: ${bcC.functions.length} functions, ${bcC.constants.length} constants`);
  log('');

  log('--- Round summaries ---');
  printRound('Round A (Bootstrap -> TLL)', bcA);
  printRound('Round B (VM runs A)', bcB);
  printRound('Round C (VM runs B)', bcC);

  log('--- Three-way comparisons ---');
  const cmpAB = compareBytecodes(bcA, bcB, 'A vs B');
  printComparison('A vs B', cmpAB);

  const cmpBC = compareBytecodes(bcB, bcC, 'B vs C');
  printComparison('B vs C', cmpBC);

  const cmpAC = compareBytecodes(bcA, bcC, 'A vs C');
  printComparison('A vs C', cmpAC);

  const fullDeterminism = cmpAB.allPass && cmpBC.allPass && cmpAC.allPass;

  log('========================================');
  if (fullDeterminism) {
    log('FULL DETERMINISM: PASS');
    log('A == B == C');
    log(`Functions: ${bcB.functions.length} | Constants: ${bcB.constants.length} | Instructions: ${cmpBC.totalInstructions}`);
    log('9 dimensions: functionCount, mainIndex, constantCount, functionMeta,');
    log('              constantContent, instructionCount, instructionSequence,');
    log('              globalCount, schemaKeys — all 0 diffs');
    log('========================================');
    process.exit(0);
  } else {
    log('FULL DETERMINISM: FAIL');
    if (!cmpAB.allPass) log('  A vs B: FAILED');
    if (!cmpBC.allPass) log('  B vs C: FAILED');
    if (!cmpAC.allPass) log('  A vs C: FAILED');
    log('========================================');
    process.exit(1);
  }
} catch (e) {
  log('');
  log('========================================');
  log('TLL SELF-HOSTING: ERROR');
  log(e.message);
  if (e.stack) log(e.stack.split('\n').slice(0, 5).join('\n'));
  log('========================================');
  process.exit(1);
}
