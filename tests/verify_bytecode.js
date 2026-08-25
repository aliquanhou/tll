// Acceptance Matrix - Item 5: Bytecode Format Verification
const fs = require('fs');
const path = require('path');

const BOOTSTRAP_DIR = path.resolve(__dirname, '..');
const bcPath = path.join(BOOTSTRAP_DIR, 'compiler_generated.tllbc');

if (!fs.existsSync(bcPath)) {
  console.log('FAIL: compiler_generated.tllbc not found. Run gen_compiler_bc.tll first.');
  process.exit(1);
}

const bc = JSON.parse(fs.readFileSync(bcPath, 'utf8'));
let errors = [];
let warnings = [];

// Valid opcode range (0-41 based on OpCode enum)
const VALID_OPS = new Set([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41]);

// 1. Top-level fields
console.log('=== Bytecode Format Verification ===\n');
console.log('Top-level fields:');
console.log('  functions: ' + (Array.isArray(bc.functions) ? bc.functions.length + ' (OK)' : 'MISSING'));
console.log('  constants: ' + (Array.isArray(bc.constants) ? bc.constants.length + ' (OK)' : 'MISSING'));
console.log('  mainFunctionIndex: ' + (typeof bc.mainFunctionIndex === 'number' ? bc.mainFunctionIndex + ' (OK)' : 'MISSING'));
console.log('  globalCount: ' + (typeof bc.globalCount === 'number' ? bc.globalCount + ' (OK)' : 'MISSING'));

if (!Array.isArray(bc.functions)) errors.push('functions not array');
if (!Array.isArray(bc.constants)) errors.push('constants not array');
if (typeof bc.mainFunctionIndex !== 'number') errors.push('mainFunctionIndex not number');

// 2. mainFunctionIndex valid
if (bc.mainFunctionIndex < 0 || bc.mainFunctionIndex >= bc.functions.length) {
  errors.push('mainFunctionIndex out of range: ' + bc.mainFunctionIndex);
}

// 3. Each function
let totalInstructions = 0;
let invalidOps = 0;
let funcIssues = 0;
bc.functions.forEach((fn, i) => {
  if (typeof fn.name !== 'string') { errors.push('fn[' + i + '].name not string'); funcIssues++; }
  if (typeof fn.paramCount !== 'number') { errors.push('fn[' + i + '].paramCount not number'); funcIssues++; }
  if (typeof fn.localCount !== 'number') { errors.push('fn[' + i + '].localCount not number'); funcIssues++; }
  if (!Array.isArray(fn.instructions)) { errors.push('fn[' + i + '].instructions not array'); funcIssues++; return; }

  totalInstructions += fn.instructions.length;
  fn.instructions.forEach((inst, j) => {
    if (typeof inst.op !== 'number') { errors.push('fn[' + i + '].inst[' + j + '].op not number'); invalidOps++; return; }
    if (!VALID_OPS.has(inst.op)) { errors.push('fn[' + i + '].inst[' + j + '].op invalid: ' + inst.op); invalidOps++; }
    if (!Array.isArray(inst.operands)) { errors.push('fn[' + i + '].inst[' + j + '].operands not array'); invalidOps++; }
  });
});

console.log('\nFunction summary:');
console.log('  total functions: ' + bc.functions.length);
console.log('  total instructions: ' + totalInstructions);
console.log('  function issues: ' + funcIssues);
console.log('  invalid instructions: ' + invalidOps);

// 4. Constants pool
console.log('\nConstants pool:');
console.log('  total constants: ' + bc.constants.length);
let constTypes = {};
bc.constants.forEach(c => {
  let t = c === null ? 'null' : typeof c;
  constTypes[t] = (constTypes[t] || 0) + 1;
});
Object.keys(constTypes).sort().forEach(t => {
  console.log('  ' + t + ': ' + constTypes[t]);
});

// 5. Opcode distribution
console.log('\nOpcode distribution:');
let opDist = {};
bc.functions.forEach(fn => {
  if (!fn.instructions) return;
  fn.instructions.forEach(inst => {
    opDist[inst.op] = (opDist[inst.op] || 0) + 1;
  });
});
const OP_NAMES = {0:'LOAD_CONST',1:'LOAD_VAR',2:'STORE_VAR',3:'ADD',4:'SUB',5:'MUL',6:'DIV',7:'MOD',8:'POW',9:'EQ',10:'NEQ',11:'LT',12:'GT',13:'LE',14:'GE',15:'AND',16:'OR',17:'NOT',18:'NEG',19:'JMP',20:'JMP_IF_FALSE',21:'CALL',22:'RET',23:'PRINT',24:'PRINTLN',25:'MAKE_ARRAY',26:'MAKE_MAP',27:'MAKE_STRUCT',28:'INDEX_GET',29:'INDEX_SET',30:'MEMBER_GET',31:'MEMBER_SET',32:'HALT',33:'NOP',34:'PUSH',35:'CONCAT',36:'LOAD_BUILTIN',37:'THROW',38:'TRY_START',39:'TRY_END',40:'LOAD_GLOBAL',41:'STORE_GLOBAL'};
Object.keys(opDist).sort((a,b)=>a-b).forEach(op => {
  console.log('  ' + op + ' (' + (OP_NAMES[op]||'?') + '): ' + opDist[op]);
});

// 6. Key opcodes present
const requiredOps = [0, 21, 22, 32]; // LOAD_CONST, CALL, RET, HALT
requiredOps.forEach(op => {
  if (!opDist[op]) warnings.push('Opcode ' + op + ' (' + OP_NAMES[op] + ') not present');
});

// Result
console.log('\n========================================');
if (errors.length === 0) {
  console.log('RESULT: PASS (0 errors, ' + warnings.length + ' warnings)');
} else {
  console.log('RESULT: FAIL (' + errors.length + ' errors)');
  errors.forEach(e => console.log('  ERROR: ' + e));
}
warnings.forEach(w => console.log('  WARN: ' + w));
console.log('========================================');
process.exit(errors.length > 0 ? 1 : 0);
