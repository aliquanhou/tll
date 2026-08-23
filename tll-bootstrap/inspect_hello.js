const bc = require('./test_hello.tllbc');
console.log('mainFunctionIndex:', bc.mainFunctionIndex);
console.log('Total functions:', bc.functions.length);
console.log('globalCount:', bc.globalCount);
console.log('');
bc.functions.forEach((f,i) => {
    console.log(`  [${i}] ${f.name} instrs=${f.instructions.length} params=${f.paramCount} locals=${f.localCount}`);
});
console.log('');
console.log('Main function instructions:');
const main = bc.functions[bc.mainFunctionIndex];
main.instructions.forEach((inst, i) => {
    console.log(`  [${i}] op=${inst.op} operands=${JSON.stringify(inst.operands)}`);
});
console.log('');
console.log('Constants (first 10):');
bc.constants.slice(0, 10).forEach((c, i) => {
    console.log(`  [${i}] ${JSON.stringify(c)}`);
});
