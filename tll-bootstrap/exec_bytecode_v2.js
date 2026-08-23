// Execute a .tllbc bytecode file with progress tracking
const fs = require('fs');
const path = require('path');

// Add the compiler dist to require path
const distPath = '/opt/tll/tll-compiler/dist/src';
const { Runtime } = require(path.join(distPath, 'runtime.js'));

if (process.argv.length < 3) {
    console.error('Usage: node exec_bytecode.js <file.tllbc>');
    process.exit(1);
}

const bcPath = process.argv[2];
console.error('[VM] START');
console.error(`[VM] Loading bytecode from: ${bcPath}`);

const bytecode = JSON.parse(fs.readFileSync(bcPath, 'utf8'));
console.error(`[VM] Functions: ${bytecode.functions.length}`);
console.error(`[VM] Constants: ${bytecode.constants.length}`);
console.error(`[VM] mainFunctionIndex: ${bytecode.mainFunctionIndex}`);
console.error(`[VM] globalCount: ${bytecode.globalCount}`);

// List main function info
const mainFn = bytecode.functions[bytecode.mainFunctionIndex];
console.error(`[VM] main function: ${mainFn.name} params=${mainFn.paramCount} locals=${mainFn.localCount} instrs=${mainFn.instructions.length}`);

console.error('[VM] CALL main');
console.error('--- Executing ---');

const startTime = Date.now();
let instructionCount = 0;

try {
    const runtime = new Runtime(bytecode);

    // Patch the runtime to track instruction execution
    const originalRun = runtime.run.bind(runtime);
    const result = originalRun();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error('--- Execution complete ---');
    console.error(`[VM] RET main, result: ${result !== undefined ? result : 'undefined'}`);
    console.error('[VM] HALT');
    console.error(`[VM] Elapsed: ${elapsed} seconds`);
} catch (e) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`[VM] ERROR after ${elapsed} seconds: ${e.message}`);
    console.error(e.stack);
    process.exit(1);
}
