// TLL Self-Hosting Verification (L4 + L5 + Determinism)
// Portable: resolves paths relative to repo root.
// Environment overrides: TLL_COMPILER_DIST, TLL_BOOTSTRAP_DIR
const fs = require('fs');
const path = require('path');

const BOOTSTRAP_DIR = process.env.TLL_BOOTSTRAP_DIR || path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(BOOTSTRAP_DIR, '..');
const TLL_COMPILER_DIST = process.env.TLL_COMPILER_DIST || path.join(REPO_ROOT, 'tll-compiler', 'dist', 'src');
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
  // Use the existing gen_compiler_bc.tll (matches A4 server validation exactly).
  // It writes to compiler_generated.tllbc in cwd; we copy from there.
  const genFile = path.join(BOOTSTRAP_DIR, 'gen_compiler_bc.tll');
  const defaultOutput = path.join(BOOTSTRAP_DIR, 'compiler_generated.tllbc');
  if (fs.existsSync(defaultOutput)) fs.unlinkSync(defaultOutput);
  const { execSync } = require('child_process');
  try {
    const out = execSync(`node --max-old-space-size=4096 "${BOOTSTRAP_CLI}" run "${genFile}"`, {
      cwd: BOOTSTRAP_DIR, encoding: 'utf8', timeout: 120000, stdio: ['pipe', 'pipe', 'pipe']
    });
    if (!fs.existsSync(defaultOutput)) throw new Error('Bootstrap compiler did not produce output: ' + out.slice(-300));
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
  // The TLL compiler's main() writes to compiler_generated.tllbc by default.
  // We intercept by running in a temp dir and copying output.
  const workDir = path.join(TMP_DIR, 'selfhost_work');
  if (!fs.existsSync(workDir)) fs.mkdirSync(workDir, { recursive: true });
  // Copy compiler.tll and lib/ to work dir so the compiler can find them
  const compilerSrc = path.join(BOOTSTRAP_DIR, 'compiler.tll');
  const libSrc = path.join(BOOTSTRAP_DIR, 'lib');
  const compilerDst = path.join(workDir, 'compiler.tll');
  const libDst = path.join(workDir, 'lib');
  fs.copyFileSync(compilerSrc, compilerDst);
  if (fs.existsSync(libDst)) fs.rmSync(libDst, { recursive: true });
  fs.cpSync(libSrc, libDst, { recursive: true });

  // The compiler writes to compiler_self_compiled.tllbc in cwd
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

function compareBytecodes(b1, b2, label) {
  const results = {};
  results.functionCount = b1.functions.length === b2.functions.length;
  results.mainIndex = b1.mainFunctionIndex === b2.mainFunctionIndex;
  results.constantCount = b1.constants.length === b2.constants.length;

  // Function names
  let nameDiff = 0;
  const nameDiffs = [];
  for (let i = 0; i < Math.min(b1.functions.length, b2.functions.length); i++) {
    if (b1.functions[i].name !== b2.functions[i].name) {
      nameDiff++;
      if (nameDiffs.length < 10) nameDiffs.push({ idx: i, a: b1.functions[i].name, b: b2.functions[i].name });
    }
  }
  results.functionNames = nameDiff === 0;
  results.functionNameDiffs = nameDiff;
  results.functionNameDetails = nameDiffs;

  // Constants content
  let constDiff = 0;
  const constDiffs = [];
  for (let i = 0; i < Math.min(b1.constants.length, b2.constants.length); i++) {
    if (JSON.stringify(b1.constants[i]) !== JSON.stringify(b2.constants[i])) {
      constDiff++;
      if (constDiffs.length < 10) constDiffs.push({ idx: i, a: JSON.stringify(b1.constants[i]), b: JSON.stringify(b2.constants[i]) });
    }
  }
  results.constantContent = constDiff === 0;
  results.constantDiffs = constDiff;
  results.constantDetails = constDiffs;

  // Instruction count + sequence
  let totalInstr1 = 0, totalInstr2 = 0, instrDiff = 0;
  for (let i = 0; i < Math.min(b1.functions.length, b2.functions.length); i++) {
    const f1 = b1.functions[i].instructions;
    const f2 = b2.functions[i].instructions;
    totalInstr1 += f1.length;
    totalInstr2 += f2.length;
    for (let j = 0; j < Math.min(f1.length, f2.length); j++) {
      const s1 = f1[j].op + ':' + (f1[j].operands ? f1[j].operands.join(',') : '');
      const s2 = f2[j].op + ':' + (f2[j].operands ? f2[j].operands.join(',') : '');
      if (s1 !== s2) instrDiff++;
    }
  }
  results.instructionCount = totalInstr1 === totalInstr2;
  results.instructionSequence = instrDiff === 0;
  results.instructionDiffs = instrDiff;
  results.totalInstructions = totalInstr1;

  results.allPass = results.functionCount && results.mainIndex && results.constantCount &&
    results.functionNames && results.constantContent && results.instructionCount && results.instructionSequence;

  return results;
}

// Main
log('========================================');
log('TLL SELF-HOSTING VERIFICATION (L4 + L5)');
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

  log('[Determinism] Comparing bytecode B vs bytecode C ...');
  const cmp = compareBytecodes(bcB, bcC, 'B vs C');
  log(`      Function count:     ${cmp.functionCount ? 'PASS' : 'FAIL'} (${bcB.functions.length})`);
  log(`      Main index:         ${cmp.mainIndex ? 'PASS' : 'FAIL'} (${bcB.mainFunctionIndex})`);
  log(`      Constant count:     ${cmp.constantCount ? 'PASS' : 'FAIL'} (${bcB.constants.length})`);
  log(`      Constant content:   ${cmp.constantContent ? 'PASS' : 'FAIL'} (${cmp.constantDiffs} diffs)`);
  if (!cmp.constantContent && cmp.constantDetails) {
    cmp.constantDetails.forEach(d => log(`        [${d.idx}] A=${d.a} B=${d.b}`));
  }
  log(`      Function names:     ${cmp.functionNames ? 'PASS' : 'FAIL'} (${cmp.functionNameDiffs} diffs)`);
  if (!cmp.functionNames && cmp.functionNameDetails) {
    cmp.functionNameDetails.forEach(d => log(`        [${d.idx}] A="${d.a}" B="${d.b}"`));
  }
  log(`      Instruction count:  ${cmp.instructionCount ? 'PASS' : 'FAIL'} (${cmp.totalInstructions})`);
  log(`      Instruction seq:    ${cmp.instructionSequence ? 'PASS' : 'FAIL'} (${cmp.instructionDiffs} diffs)`);
  log('');

  log('========================================');
  if (cmp.allPass) {
    log('TLL SELF-HOSTING: PASS');
    log(`Functions: ${bcB.functions.length} | Constants: ${bcB.constants.length} | Instructions: ${cmp.totalInstructions}`);
    log('B == C (0 instruction diff, 0 constant diff)');
    log('========================================');
    process.exit(0);
  } else {
    log('TLL SELF-HOSTING: FAIL');
    log('========================================');
    process.exit(1);
  }
} catch (e) {
  log('');
  log('========================================');
  log('TLL SELF-HOSTING: ERROR');
  log(e.message);
  log('========================================');
  process.exit(1);
}
