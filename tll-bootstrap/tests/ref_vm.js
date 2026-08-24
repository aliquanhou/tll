// Reference VM: directly run compiler.tllbc using TS Runtime
// This validates that the compiler bytecode can self-bootstrap
const { Runtime } = require('../../tll-compiler/dist/src/runtime.js');
const fs = require('fs');
const path = require('path');

const workDir = path.join(__dirname, '.tmp', 'ref-vm');
if (!fs.existsSync(workDir)) fs.mkdirSync(workDir, { recursive: true });

// Copy lib and compiler.tll
const libSrc = path.join(__dirname, '..', 'lib');
const libDst = path.join(workDir, 'lib');
if (fs.existsSync(libDst)) fs.rmSync(libDst, { recursive: true });
fs.cpSync(libSrc, libDst, { recursive: true });
fs.copyFileSync(path.join(__dirname, '..', 'compiler.tll'), path.join(workDir, 'compiler.tll'));

// Load compiler bytecode
const bcPath = path.join(__dirname, '..', 'compiler_generated.tllbc');
const bc = JSON.parse(fs.readFileSync(bcPath, 'utf8'));

console.log('Compiler bytecode:', bc.functions.length, 'functions,', bc.constants.length, 'constants');

// Run compiler in workDir
const origCwd = process.cwd();
process.chdir(workDir);

const start = Date.now();
const runtime = new Runtime(bc);
const result = runtime.run();
const elapsed = Date.now() - start;

process.chdir(origCwd);

console.log('Execution time:', elapsed, 'ms');
console.log('Result:', result ? 'success' : 'null/undefined');

// Check if output was generated
const outPath = path.join(workDir, 'compiler_self_compiled.tllbc');
if (fs.existsSync(outPath)) {
    const outBc = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    console.log('Output bytecode:', outBc.functions.length, 'functions,', outBc.constants.length, 'constants');
    // Compare with original
    const origFuncs = bc.functions.length;
    const outFuncs = outBc.functions.length;
    console.log('Function count match:', origFuncs === outFuncs, '(', origFuncs, 'vs', outFuncs, ')');
} else {
    console.log('No output file generated');
}
