// Execute a .tllbc bytecode file
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
console.error(`Loading bytecode from: ${bcPath}`);

const bytecode = JSON.parse(fs.readFileSync(bcPath, 'utf8'));
console.error(`Functions: ${bytecode.functions.length}`);
console.error(`Constants: ${bytecode.constants.length}`);
console.error(`mainFunctionIndex: ${bytecode.mainFunctionIndex}`);
console.error('--- Executing ---');

try {
    const runtime = new Runtime(bytecode);
    const result = runtime.run();
    console.error('--- Execution complete ---');
    if (result !== undefined) {
        console.error(`Result: ${result}`);
    }
} catch (e) {
    console.error(`Runtime error: ${e.message}`);
    process.exit(1);
}
