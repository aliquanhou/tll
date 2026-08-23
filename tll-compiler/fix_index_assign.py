with open('src/compiler.ts', 'r') as f:
    compiler = f.read()

old_assign = """    } else if (expr.operator === '=') {
      // Assignment
      if (expr.left.kind === 'Ident') {
        const { index, isGlobal } = this.resolveVar(expr.left.name);
        if (isGlobal) {
          this.emit(OpCode.STORE_GLOBAL, [index, rightReg]);
        } else {
          this.emit(OpCode.STORE_VAR, [index, rightReg]);
        }
        return rightReg;
      }
    } else {"""

new_assign = """    } else if (expr.operator === '=') {
      // Assignment
      if (expr.left.kind === 'Ident') {
        const { index, isGlobal } = this.resolveVar(expr.left.name);
        if (isGlobal) {
          this.emit(OpCode.STORE_GLOBAL, [index, rightReg]);
        } else {
          this.emit(OpCode.STORE_VAR, [index, rightReg]);
        }
        return rightReg;
      } else if (expr.left.kind === 'Index') {
        // Index assignment: obj[idx] = value
        const objReg = this.compileExpression(expr.left.object);
        const idxReg = this.compileExpression(expr.left.index);
        this.emit(OpCode.INDEX_SET, [objReg, idxReg, rightReg]);
        return rightReg;
      } else if (expr.left.kind === 'Member') {
        // Member assignment: obj.prop = value
        const objReg = this.compileExpression(expr.left.object);
        const nameIdx = this.addConstant(expr.left.property);
        this.emit(OpCode.MEMBER_SET, [objReg, nameIdx, rightReg]);
        return rightReg;
      }
    } else {"""

compiler = compiler.replace(old_assign, new_assign)

with open('src/compiler.ts', 'w') as f:
    f.write(compiler)

print("Done - added Index and Member assignment support")
