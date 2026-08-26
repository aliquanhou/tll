# TLL OS Opcode Specification

**Version**: 1.1
**Status**: FROZEN
**Total Opcodes**: 46 (0-45)

> All opcode numbers, operand formats, and semantics are frozen. Changes require a new language version.

---

## Opcode Table

| # | Name | Value | Operands | Description |
|---|------|-------|----------|-------------|
| 0 | LOAD_CONST | 0 | `r, const_index` | Load constant from constant pool into register r |
| 1 | LOAD_VAR | 1 | `r, var_index` | Load local variable into register r |
| 2 | STORE_VAR | 2 | `var_index, r` | Store register r into local variable |
| 3 | ADD | 3 | `r1, r2, r3` | r1 = r2 + r3 |
| 4 | SUB | 4 | `r1, r2, r3` | r1 = r2 - r3 |
| 5 | MUL | 5 | `r1, r2, r3` | r1 = r2 * r3 |
| 6 | DIV | 6 | `r1, r2, r3` | r1 = r2 / r3 (float division) |
| 7 | MOD | 7 | `r1, r2, r3` | r1 = r2 % r3 |
| 8 | POW | 8 | `r1, r2, r3` | r1 = r2 ^ r3 |
| 9 | EQ | 9 | `r1, r2, r3` | r1 = (r2 == r3) |
| 10 | NEQ | 10 | `r1, r2, r3` | r1 = (r2 != r3) |
| 11 | LT | 11 | `r1, r2, r3` | r1 = (r2 < r3) |
| 12 | GT | 12 | `r1, r2, r3` | r1 = (r2 > r3) |
| 13 | LE | 13 | `r1, r2, r3` | r1 = (r2 <= r3) |
| 14 | GE | 14 | `r1, r2, r3` | r1 = (r2 >= r3) |
| 15 | AND | 15 | `r1, r2, r3` | r1 = (r2 && r3) short-circuit |
| 16 | OR | 16 | `r1, r2, r3` | r1 = (r2 || r3) short-circuit |
| 17 | NOT | 17 | `r1, r2` | r1 = !r2 |
| 18 | NEG | 18 | `r1, r2` | r1 = -r2 |
| 19 | JMP | 19 | `label` | Unconditional jump to instruction offset |
| 20 | JMP_IF_FALSE | 20 | `r, label` | Jump if register r is falsy |
| 21 | CALL | 21 | `r, func, arg_count` | Call function, result in r |
| 22 | RET | 22 | `r` | Return value in register r |
| 23 | PRINT | 23 | `r` | Print value without newline |
| 24 | PRINTLN | 24 | `r` | Print value with newline |
| 25 | MAKE_ARRAY | 25 | `r, count` | Create array from arg stack, store in r |
| 26 | MAKE_MAP | 26 | `r, count` | Create map from arg stack (key-value pairs), store in r |
| 27 | MAKE_STRUCT | 27 | `r, type_index, field_count` | Create struct (reserved, not fully in v1.1) |
| 28 | INDEX_GET | 28 | `r1, r2, r3` | r1 = r2[r3] (array/map index) |
| 29 | INDEX_SET | 29 | `r1, r2, r3` | r1[r2] = r3 |
| 30 | MEMBER_GET | 30 | `r1, r2, name_index` | r1 = r2.name (constant name from pool) |
| 31 | MEMBER_SET | 31 | `r1, r2, name_index` | r1.name = r2 |
| 32 | HALT | 32 | (none) | Halt execution |
| 33 | NOP | 33 | (none) | No operation |
| 34 | PUSH | 34 | `r` | Push register value onto arg stack |
| 35 | CONCAT | 35 | `r1, r2, r3` | r1 = string(r2) + string(r3) |
| 36 | LOAD_BUILTIN | 36 | `r, builtin_index` | Load builtin function into register r |
| 37 | THROW | 37 | `r` | Throw exception value in register r |
| 38 | TRY_START | 38 | `catch_offset` | Begin try block, record catch handler offset |
| 39 | TRY_END | 39 | (none) | End try block, pop handler |
| 40 | LOAD_GLOBAL | 40 | `r, global_index` | Load global variable into register r |
| 41 | STORE_GLOBAL | 41 | `global_index, r` | Store register r into global variable |
| 42 | CLOSURE | 42 | `r, fnIdx, captureCount, [upvalueSlots...]` | Create closure with environment, store in r |
| 43 | GET_UPVALUE | 43 | `r, slot` | r = closureEnv.upvalues[slot].value |
| 44 | SET_UPVALUE | 44 | `slot, r` | closureEnv.upvalues[slot].value = r |
| 45 | BOX_LOCAL | 45 | `localSlot, upvalueSlot` | Create UpvalueBox from local, store in closureEnv.upvalues[upvalueSlot] |

---

## Detailed Semantics

### CALL (opcode 21)

**Operands**: `resultReg, func, argCount`

**func encoding**:
- `func < 100000`: Direct function index (fnIdx)
- `func >= 100000`: Indirect call — `func - 100000` is a register number containing a Function Value or Builtin Value

**Execution**:
1. Pop `argCount` values from arg stack (in reverse order)
2. If direct call: look up function by fnIdx
3. If indirect call: read function value from register, dispatch by type:
   - `TLL_FUNCTION` / `TLL_CLOSURE`: user function call
   - `TLL_BUILTIN`: builtin function call
4. Create new frame, push onto call stack
5. Store arguments in new frame's locals
6. Set PC to 0 in new frame

### CLOSURE (opcode 42)

**Operands**: `resultReg, fnIdx, captureCount, [upvalueSlot_0, ..., upvalueSlot_N]`

**Execution**:
1. Create ClosureEnv with `captureCount` upvalue slots
2. For each upvalueSlot operand: copy reference from current frame's closureEnv.upvalues[upvalueSlot] into new closure
3. Create Function Value `{fnIdx, env: newClosureEnv}`
4. Store in resultReg

### BOX_LOCAL (opcode 45)

**Operands**: `localSlot, upvalueSlot`

**Execution**:
1. Create UpvalueBox `{value: frame.locals[localSlot], refCount: 1}`
2. Move value out of local (set local to null to avoid double-free)
3. Store box reference in frame.closureEnv.upvalues[upvalueSlot]

### GET_UPVALUE / SET_UPVALUE (opcodes 43, 44)

**GET_UPVALUE**: `resultReg = currentFrame.closureEnv.upvalues[slot].value`
**SET_UPVALUE**: `currentFrame.closureEnv.upvalues[slot].value = sourceReg`

Both operate on the **current frame's** closure environment, which is set when a closure is called.

### TRY_START / TRY_END / THROW (opcodes 38, 39, 37)

**TRY_START**: Push try frame with catch_offset onto try stack
**TRY_END**: Pop try frame from try stack
**THROW**: Unwind call stack, searching for try frame; jump to catch_offset; execute finally blocks during unwinding

---

## Register Model

- Each frame has a register file (dynamically sized, minimum 256)
- Registers are virtual, not physical CPU registers
- Register 0 is reserved for exception/error values
- All operations use register operands

## Arg Stack

- Each frame has an argument stack for CALL and MAKE_ARRAY/MAKE_MAP
- PUSH (34) pushes a register value onto the arg stack
- CALL pops argCount values
- MAKE_ARRAY/MAKE_MAP pop count*2 values (key-value pairs for maps)
