const a = JSON.parse(require('fs').readFileSync('compiler_generated.tllbc','utf8'));
const b = JSON.parse(require('fs').readFileSync('compiler_self_compiled.tllbc','utf8'));
console.log('A: functions=' + a.functions.length + ' constants=' + a.constants.length + ' mainIdx=' + a.mainFunctionIndex);
console.log('B: functions=' + b.functions.length + ' constants=' + b.constants.length + ' mainIdx=' + b.mainFunctionIndex);
let fnMatch = 0, fnDiff = 0;
for (let i = 0; i < a.functions.length; i++) {
  if (a.functions[i].name === b.functions[i].name &&
      a.functions[i].paramCount === b.functions[i].paramCount &&
      a.functions[i].instructions.length === b.functions[i].instructions.length) {
    fnMatch++;
  } else {
    fnDiff++;
    if (fnDiff <= 5) console.log('Diff fn[' + i + ']: A=' + a.functions[i].name + '/' + a.functions[i].instructions.length + ' B=' + b.functions[i].name + '/' + b.functions[i].instructions.length);
  }
}
console.log('Functions: match=' + fnMatch + ' diff=' + fnDiff);
