// TLL Module System Test Runner
// Usage: node tests/run-tests.js [test-name]
// Portable: resolves paths relative to repo root, no /opt/tll dependency.
// Environment overrides:
//   TLL_COMPILER_DIST  - path to tll-compiler dist/src directory
//   TLL_BOOTSTRAP_DIR  - path to tll-bootstrap directory
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Path resolution: this file lives at <repo>/tll-bootstrap/tests/run-tests.js
const TESTS_DIR = __dirname;
const BOOTSTRAP_DIR = process.env.TLL_BOOTSTRAP_DIR || path.resolve(TESTS_DIR, '..');
const REPO_ROOT = path.resolve(BOOTSTRAP_DIR, '..');
const TLL_COMPILER_DIST = process.env.TLL_COMPILER_DIST || path.join(REPO_ROOT, 'tll-compiler', 'dist', 'src');
const BOOTSTRAP_CLI = path.join(TLL_COMPILER_DIST, 'cli.js');
const RUNTIME_PATH = path.join(TLL_COMPILER_DIST, 'runtime.js');
const { Runtime } = require(RUNTIME_PATH);

const TMP_DIR = path.join(TESTS_DIR, '.tmp');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function runTest(testName, testFile) {
  // testFile is optional; if provided, it's a single-file test
  // if not provided, testName is a directory with main.tll
  const isDirTest = !testFile;
  const testDir = isDirTest ? path.join(TESTS_DIR, testName) : path.dirname(testFile);
  const mainFile = testFile || path.join(testDir, 'main.tll');

  if (!fs.existsSync(mainFile)) {
    return { name: testName, status: 'SKIP', reason: 'Test file not found' };
  }

  const baseName = isDirTest ? testName : path.relative(TESTS_DIR, testFile).replace(/\\/g, '/');
  // For file-based tests, use <filename>.expected.txt; for dir tests, use expected.txt
  const perFileExpected = isDirTest ? null : path.join(testDir, path.basename(testFile).replace(/\.tll$/, '.expected.txt'));
  const dirExpected = path.join(testDir, 'expected.txt');
  const expectedFile = (perFileExpected && fs.existsSync(perFileExpected)) ? perFileExpected : dirExpected;
  const configFile = path.join(testDir, 'test.json');

  const config = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, 'utf8')) : {};
  const expected = fs.existsSync(expectedFile) ? fs.readFileSync(expectedFile, 'utf8').replace(/\r\n/g, '\n').trim() : '';
  const expectError = config.expectError || false;

  ensureDir(TMP_DIR);
  const safeName = baseName.replace(/\//g, '_').replace(/\.tll$/, '');
  const driverFile = path.join(BOOTSTRAP_DIR, `.test_${safeName}_driver.tll`);
  const bytecodeFile = path.join(TMP_DIR, `${safeName}.tllbc`);

  // Generate driver script that calls linkAndCompile
  const driverCode = `from "./lib/linker" import linkAndCompile

fn main() -> void {
    let bc = linkAndCompile("${mainFile.replace(/\\/g, '/')}")
    if bc.hasError == true {
        io.println("COMPILE_ERROR: " + bc.error)
        return
    }
    fs.writeFile("${bytecodeFile.replace(/\\/g, '/')}", json.stringify(bc))
    io.println("COMPILE_OK")
}

main()
`;
  fs.writeFileSync(driverFile, driverCode);

  try {
    // Stage 1: Compile test file using TLL compiler (via bootstrap)
    const compileResult = execSync(
      `node --max-old-space-size=4096 ${BOOTSTRAP_CLI} run ${driverFile}`,
      { cwd: BOOTSTRAP_DIR, encoding: 'utf8', timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'] }
    );

    if (compileResult.includes('COMPILE_ERROR')) {
      if (expectError) {
        return { name: testName, status: 'PASS', reason: 'Expected compile error received' };
      }
      const errMatch = compileResult.match(/COMPILE_ERROR: (.+)/);
      return { name: testName, status: 'FAIL', reason: `Unexpected compile error: ${errMatch ? errMatch[1] : 'unknown'}` };
    }

    if (!compileResult.includes('COMPILE_OK')) {
      return { name: testName, status: 'FAIL', reason: `Compilation did not complete: ${compileResult.slice(-200)}` };
    }

    if (expectError) {
      return { name: testName, status: 'FAIL', reason: 'Expected compile error but compilation succeeded' };
    }

    // Stage 2: Execute bytecode (cwd matches test file dir, same as `tll run`)
    const bytecode = JSON.parse(fs.readFileSync(bytecodeFile, 'utf8'));
    const runtime = new Runtime(bytecode);
    const output = [];
    const origLog = console.log;
    const origCwd = process.cwd();
    process.chdir(testDir);
    console.log = (...args) => output.push(args.join(' '));
    try {
      runtime.run();
    } catch (e) {
      console.log = origLog;
      process.chdir(origCwd);
      return { name: testName, status: 'FAIL', reason: `Runtime error: ${e.message}` };
    }
    console.log = origLog;
    process.chdir(origCwd);

    const actual = output.join('\n').trim();
    // No expected.txt: require symbol identity check OR explicit assertion marker in output
    if (expected === '') {
      if (config.checkSymbolIdentity) {
        // Symbol identity check below
      } else if (actual.includes('ALL PASS') || actual.includes('PASS') || actual.includes('TEST DONE')) {
        return { name: testName, status: 'PASS', reason: 'Self-asserting test passed' };
      } else {
        return { name: testName, status: 'FAIL', reason: 'No expected.txt and no self-assertion marker (ALL PASS/PASS/TEST DONE)' };
      }
    }
    if (actual !== expected) {
      return {
        name: testName,
        status: 'FAIL',
        reason: `Output mismatch\nExpected:\n${expected}\nActual:\n${actual}`
      };
    }

    // Symbol Identity check (if configured)
    if (config.checkSymbolIdentity) {
      const pattern = new RegExp(config.expectedFunctionPattern || '__mod_.*__');
      const matchingFns = bytecode.functions.filter(f => pattern.test(f.name));
      const distinctNames = new Set(matchingFns.map(f => f.name));
      const expectedCount = config.expectedDistinctFunctions || 2;
      if (matchingFns.length < expectedCount) {
        return {
          name: testName,
          status: 'FAIL',
          reason: `Symbol identity: expected ${expectedCount} distinct functions matching ${pattern}, found ${matchingFns.length}: ${matchingFns.map(f => f.name).join(', ')}`
        };
      }
      if (distinctNames.size !== matchingFns.length) {
        return {
          name: testName,
          status: 'FAIL',
          reason: `Symbol identity: duplicate function names found: ${matchingFns.map(f => f.name).join(', ')}`
        };
      }
    }

    return { name: testName, status: 'PASS' };
  } catch (e) {
    return { name: testName, status: 'ERROR', reason: e.message };
  }
}

// Check if a .tll file contains a main() function
function hasMainFunction(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return /fn\s+main\s*\(/.test(content);
  } catch (e) {
    return false;
  }
}

// Main: discover tests in three modes:
// 1. Directory with main.tll
// 2. Files matching *_test.tll
// 3. .tll files with fn main() in dirs without main.tll
function findTests(dir, filter) {
  const results = [];
  for (const f of fs.readdirSync(dir)) {
    if (f === '.tmp' || f === 'node_modules' || f === 'acceptance' || f === 'exception' || f === 'runtime-equivalence') continue;
    const full = path.join(dir, f);
    if (!fs.statSync(full).isDirectory()) continue;
    // Mode 1: directory with main.tll
    if (fs.existsSync(path.join(full, 'main.tll'))) {
      const relName = path.relative(TESTS_DIR, full).replace(/\\/g, '/');
      if (!filter || relName.includes(filter)) results.push({ name: relName, file: null });
    }
    results.push(...findTests(full, filter));
  }
  // Also scan for file-based tests in this directory
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (!fs.statSync(full).isFile()) continue;
    if (!f.endsWith('.tll')) continue;
    // Mode 2: *_test.tll files
    if (f.endsWith('_test.tll')) {
      const relName = path.relative(TESTS_DIR, full).replace(/\\/g, '/');
      if (!filter || relName.includes(filter)) results.push({ name: relName, file: full });
      continue;
    }
    // Mode 3: .tll files with main() in dirs without main.tll
    if (f !== 'main.tll' && !fs.existsSync(path.join(dir, 'main.tll')) && hasMainFunction(full)) {
      const relName = path.relative(TESTS_DIR, full).replace(/\\/g, '/');
      if (!filter || relName.includes(filter)) results.push({ name: relName, file: full });
    }
  }
  return results;
}

const filter = process.argv[2];
const tests = findTests(TESTS_DIR, filter);

console.log(`=== TLL Module System Tests (${tests.length} tests) ===\n`);

let passed = 0, failed = 0, skipped = 0, errors = 0;
for (const test of tests) {
  const result = runTest(test.name, test.file);
  const icon = result.status === 'PASS' ? '[PASS]' : result.status === 'FAIL' ? '[FAIL]' : result.status === 'ERROR' ? '[ERROR]' : '[SKIP]';
  console.log(`${icon} ${result.name}: ${result.status}`);
  if (result.reason) console.log(`   ${result.reason}`);
  if (result.status === 'PASS') passed++;
  else if (result.status === 'FAIL') failed++;
  else if (result.status === 'ERROR') errors++;
  else skipped++;
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed, ${errors} errors, ${skipped} skipped ===`);
process.exit(failed > 0 || errors > 0 ? 1 : 0);
