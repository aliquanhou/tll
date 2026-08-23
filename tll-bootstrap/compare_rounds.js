const a = JSON.parse(require('fs').readFileSync('compiler_round2.tllbc','utf8'));
const b = JSON.parse(require('fs').readFileSync('compiler_self_compiled.tllbc','utf8'));
console.log('Round1: fn=' + a.functions.length + ' const=' + a.constants.length);
console.log('Round2: fn=' + b.functions.length + ' const=' + b.constants.length);
let m = 0, d = 0;
for (let i = 0; i < a.functions.length; i++) {
  if (a.functions[i].instructions.length === b.functions[i].instructions.length) {
    m++;
  } else {
    d++;
    if (d <= 3) console.log('Diff fn[' + i + '] ' + a.functions[i].name + ': R1=' + a.functions[i].instructions.length + ' R2=' + b.functions[i].instructions.length);
  }
}
console.log('Instruction count: match=' + m + ' diff=' + d);
