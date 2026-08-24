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

function runTest(testName) {
  const testDir = path.join(TESTS_DIR, testName);
  if (!fs.existsSync(testDir)) {
    return { name: testName, status: 'SKIP', reason: 'Test directory not found' };
  }

  const mainFile = path.join(testDir, 'main.tll');
  const expectedFile = path.join(testDir, 'expected.txt');
  const configFile = path.join(testDir, 'test.json');

  if (!fs.existsSync(mainFile)) {
    return { name: testName, status: 'SKIP', reason: 'main.tll not found' };
  }

  const config = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, 'utf8')) : {};
  const expected = fs.existsSync(expectedFile) ? fs.readFileSync(expectedFile, 'utf8').replace(/\r\n/g, '\n').trim() : '';
  const expectError = config.expectError || false;

  ensureDir(TMP_DIR);
  const safeName = testName.replace(/\//g, '_');
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

    // Stage 2: Execute bytecode
    const bytecode = JSON.parse(fs.readFileSync(bytecodeFile, 'utf8'));
    const runtime = new Runtime(bytecode);
    const output = [];
    const origLog = console.log;
    console.log = (...args) => output.push(args.join(' '));
    try {
      runtime.run();
    } catch (e) {
      console.log = origLog;
      return { name: testName, status: 'FAIL', reason: `Runtime error: ${e.message}` };
    }
    console.log = origLog;

    const actual = output.join('\n').trim();
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

// Main
function findTestDirs(dir, filter) {
  const results = [];
  for (const f of fs.readdirSync(dir)) {
    if (f === '.tmp' || f === 'node_modules') continue;
    const full = path.join(dir, f);
    if (!fs.statSync(full).isDirectory()) continue;
    if (fs.existsSync(path.join(full, 'main.tll'))) {
      const relName = path.relative(TESTS_DIR, full).replace(/\\/g, '/');
      if (!filter || relName.includes(filter)) results.push(relName);
    }
    results.push(...findTestDirs(full, filter));
  }
  return results;
}

const filter = process.argv[2];
const testDirs = findTestDirs(TESTS_DIR, filter);

console.log(`=== TLL Module System Tests (${testDirs.length} tests) ===\n`);

let passed = 0, failed = 0, skipped = 0, errors = 0;
for (const testName of testDirs) {
  const result = runTest(testName);
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
