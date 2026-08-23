// Generate correct builtin index mapping from TypeScript compiler
const path = require('path');
const distPath = '/opt/tll/tll-compiler/dist/src';
const { builtinIndex } = require(path.join(distPath, 'stdlib/index.js'));

console.log('// Auto-generated builtin index mapping');
console.log('// Total builtins:', builtinIndex.size);
console.log('');

// Group by module
const modules = {};
for (const [key, idx] of builtinIndex.entries()) {
    const [mod, fn] = key.split('.');
    if (!modules[mod]) modules[mod] = [];
    modules[mod].push({ fn, idx });
}

// Sort by index
for (const mod of Object.keys(modules)) {
    modules[mod].sort((a, b) => a.idx - b.idx);
}

// Print in order
let currentIdx = 0;
for (const mod of Object.keys(modules)) {
    console.log(`// ${mod} module (${modules[mod].length} functions)`);
    for (const { fn, idx } of modules[mod]) {
        console.log(`//   [${idx}] ${mod}.${fn}`);
        if (idx !== currentIdx) {
            console.log(`//   WARNING: expected ${currentIdx}, got ${idx}`);
        }
        currentIdx++;
    }
    console.log('');
}

// Generate TLL code
console.log('');
console.log('// TLL cg_getBuiltinIndex function:');
console.log('fn cg_getBuiltinIndex(modName: string, fnName: string) -> int {');
for (const mod of Object.keys(modules)) {
    console.log(`    if modName == "${mod}" {`);
    for (const { fn, idx } of modules[mod]) {
        console.log(`        if fnName == "${fn}" { return ${idx} }`);
    }
    console.log(`    }`);
}
console.log('    return -1');
console.log('}');
