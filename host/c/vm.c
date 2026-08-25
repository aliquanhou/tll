/* TLL Bootstrap VM - executes bytecode opcodes.
 * This is the Host/Bootstrap layer. Language semantics live in runtime/vm.tll.
 */
#include "tllvm.h"

static void push_arg(TLLFrame *frame, TLLValue v) {
    if (frame->argStackSize >= frame->argStackCapacity) {
        frame->argStackCapacity = frame->argStackCapacity ? frame->argStackCapacity * 2 : 16;
        frame->argStack = (TLLValue*)realloc(frame->argStack, frame->argStackCapacity * sizeof(TLLValue));
    }
    frame->argStack[frame->argStackSize++] = v;
}

static TLLValue pop_arg(TLLFrame *frame) {
    if (frame->argStackSize <= 0) return tll_null();
    return frame->argStack[--frame->argStackSize];
}

static void push_try(TLLFrame *frame, int pc) {
    if (frame->tryStackSize >= frame->tryStackCapacity) {
        frame->tryStackCapacity = frame->tryStackCapacity ? frame->tryStackCapacity * 2 : 8;
        frame->tryStack = (int*)realloc(frame->tryStack, frame->tryStackCapacity * sizeof(int));
    }
    frame->tryStack[frame->tryStackSize++] = pc;
}

static int pop_try(TLLFrame *frame) {
    if (frame->tryStackSize <= 0) return -1;
    return frame->tryStack[--frame->tryStackSize];
}

TLLVM *tll_vm_create(TLLProgram *prog) {
    TLLVM *vm = (TLLVM*)calloc(1, sizeof(TLLVM));
    vm->program = prog;
    vm->globalCount = prog->globalCount;
    vm->globals = (TLLValue*)calloc(prog->globalCount, sizeof(TLLValue));
    for (int i = 0; i < prog->globalCount; i++) vm->globals[i] = tll_null();
    vm->callStackCapacity = 64;
    vm->callStack = (TLLFrame**)calloc(64, sizeof(TLLFrame*));
    return vm;
}

static TLLFrame *create_frame(TLLFunction *fn, int returnReg, TLLClosureEnv *env) {
    TLLFrame *frame = (TLLFrame*)calloc(1, sizeof(TLLFrame));
    frame->function = fn;
    frame->pc = 0;
    frame->registerCount = 4096;
    frame->registers = (TLLValue*)calloc(4096, sizeof(TLLValue));
    for (int i = 0; i < 4096; i++) frame->registers[i] = tll_null();
    frame->localCount = fn->localCount;
    frame->locals = (TLLValue*)calloc(fn->localCount > 0 ? fn->localCount : 1, sizeof(TLLValue));
    for (int i = 0; i < fn->localCount; i++) frame->locals[i] = tll_null();
    frame->argStackCapacity = 64;
    frame->argStack = (TLLValue*)calloc(64, sizeof(TLLValue));
    frame->tryStackCapacity = 16;
    frame->tryStack = (int*)calloc(16, sizeof(int));
    frame->returnReg = returnReg;
    frame->closureEnv = env;
    return frame;
}

static void push_frame(TLLVM *vm, TLLFrame *frame) {
    if (vm->callStackSize >= vm->callStackCapacity) {
        vm->callStackCapacity *= 2;
        vm->callStack = (TLLFrame**)realloc(vm->callStack, vm->callStackCapacity * sizeof(TLLFrame*));
    }
    vm->callStack[vm->callStackSize++] = frame;
}

static TLLFrame *pop_frame(TLLVM *vm) {
    if (vm->callStackSize <= 0) return NULL;
    TLLFrame *f = vm->callStack[--vm->callStackSize];
    return f;
}

static void free_frame(TLLFrame *frame) {
    /* Note: locals and argStack values may be shared with closures/return values.
     * For bootstrap VM, we leak them to avoid use-after-free.
     * A production VM would use reference counting. */
    free(frame->registers);
    free(frame->locals);
    free(frame->argStack);
    free(frame->tryStack);
    free(frame);
}

static void throw_exception(TLLVM *vm, TLLFrame *frame, TLLValue error) {
    /* Search current frame's try stack first */
    while (frame->tryStackSize > 0) {
        int catchPc = pop_try(frame);
        frame->pc = catchPc;
        frame->registers[0] = error;
        return;
    }
    /* Search up the call stack */
    while (vm->callStackSize > 1) {
        TLLFrame *f = pop_frame(vm);
        free_frame(f);
        TLLFrame *parent = vm->callStack[vm->callStackSize - 1];
        if (parent->tryStackSize > 0) {
            int catchPc = pop_try(parent);
            parent->pc = catchPc;
            parent->registers[0] = error;
            return;
        }
        frame = parent;
    }
    /* No handler - fatal */
    char *msg = tll_to_string(error);
    fprintf(stderr, "Uncaught exception: %s\n", msg);
    free(msg);
    exit(1);
}

/* Forward declaration */
TLLValue tll_call_builtin(TLLVM *vm, int idx, TLLValue *args, int argCount);

static void do_call(TLLVM *vm, TLLFrame *frame, int resultReg, int fnIdx, int argCount) {
    TLLValue *args = (TLLValue*)alloca(argCount * sizeof(TLLValue));
    for (int i = argCount - 1; i >= 0; i--) args[i] = pop_arg(frame);

    if (fnIdx >= 100000) {
        /* Indirect call */
        int regNum = fnIdx - 100000;
        TLLValue possibleFn = frame->registers[regNum];
        /* Handle function value represented as map {"__fn":true, "fnIdx":N, "env":...} */
        if (possibleFn.type == TLL_MAP) {
            TLLValue fnFlag = map_get(possibleFn.as.map, "__fn");
            if (fnFlag.type == TLL_BOOL && fnFlag.as.boolean) {
                TLLValue idxVal = map_get(possibleFn.as.map, "fnIdx");
                int actualFnIdx = (idxVal.type == TLL_INT) ? (int)idxVal.as.integer : 0;
                TLLValue envVal = map_get(possibleFn.as.map, "env");
                TLLClosureEnv *env = NULL;
                if (envVal.type != TLL_NULL) {
                    env = (TLLClosureEnv*)calloc(1, sizeof(TLLClosureEnv));
                    env->capacity = 1;
                    env->upvalues = (TLLUpvalue**)calloc(1, sizeof(TLLUpvalue*));
                }
                possibleFn = tll_function(actualFnIdx, env);
            }
        }
        if (possibleFn.type == TLL_BUILTIN) {
            TLLValue result = tll_call_builtin(vm, possibleFn.as.builtin.idx, args, argCount);
            frame->registers[resultReg] = result;
            return;
        }
        if (possibleFn.type == TLL_FUNCTION) {
            int actualFnIdx = possibleFn.as.func.fnIdx;
            TLLClosureEnv *env = possibleFn.as.func.env;
            if (actualFnIdx >= 0 && actualFnIdx < vm->program->functionCount) {
                TLLFunction *fn = &vm->program->functions[actualFnIdx];
                TLLFrame *newFrame = create_frame(fn, resultReg, env);
                for (int i = 0; i < argCount && i < fn->paramCount; i++) {
                    tll_value_free(newFrame->locals[i]);
                    newFrame->locals[i] = args[i];
                }
                push_frame(vm, newFrame);
                return;
            }
        }
        /* Not callable - return null */
        frame->registers[resultReg] = tll_null();
        return;
    }

    /* Direct call */
    if (fnIdx >= 0 && fnIdx < vm->program->functionCount) {
        TLLFunction *fn = &vm->program->functions[fnIdx];
        TLLFrame *newFrame = create_frame(fn, resultReg, NULL);
        for (int i = 0; i < argCount && i < fn->paramCount; i++) {
            tll_value_free(newFrame->locals[i]);
            newFrame->locals[i] = args[i];
        }
        push_frame(vm, newFrame);
    }
}

void tll_vm_run(TLLVM *vm) {
    TLLFunction *mainFn = &vm->program->functions[vm->program->mainFunctionIndex];
    TLLFrame *mainFrame = create_frame(mainFn, -1, NULL);
    push_frame(vm, mainFrame);

    while (vm->callStackSize > 0) {
        TLLFrame *frame = vm->callStack[vm->callStackSize - 1];
        if (frame->pc >= frame->function->instructionCount) {
            TLLFrame *f = pop_frame(vm);
            if (vm->callStackSize > 0 && f->returnReg >= 0) {
                vm->callStack[vm->callStackSize - 1]->registers[f->returnReg] = tll_null();
            }
            free_frame(f);
            continue;
        }

        TLLInstruction *inst = &frame->function->instructions[frame->pc];
        frame->pc++;
        int a = inst->operandCount > 0 ? inst->operands[0] : 0;
        int b = inst->operandCount > 1 ? inst->operands[1] : 0;
        int c = inst->operandCount > 2 ? inst->operands[2] : 0;
        TLLValue *regs = frame->registers;
        TLLValue *consts = vm->program->constants;

        switch (inst->op) {
            case OP_LOAD_CONST:
                regs[a] = consts[b];
                break;
            case OP_LOAD_VAR:
                regs[a] = frame->locals[b];
                break;
            case OP_STORE_VAR:
                tll_value_free(frame->locals[a]);
                frame->locals[a] = regs[b];
                break;
            case OP_LOAD_GLOBAL:
                regs[a] = vm->globals[b];
                break;
            case OP_STORE_GLOBAL:
                tll_value_free(vm->globals[a]);
                vm->globals[a] = regs[b];
                break;
            case OP_BOX_LOCAL: {
                if (!frame->closureEnv) {
                    frame->closureEnv = (TLLClosureEnv*)calloc(1, sizeof(TLLClosureEnv));
                    frame->closureEnv->capacity = 8;
                    frame->closureEnv->upvalues = (TLLUpvalue**)calloc(8, sizeof(TLLUpvalue*));
                }
                while (frame->closureEnv->count <= b) {
                    if (frame->closureEnv->count >= frame->closureEnv->capacity) {
                        frame->closureEnv->capacity *= 2;
                        frame->closureEnv->upvalues = (TLLUpvalue**)realloc(frame->closureEnv->upvalues, frame->closureEnv->capacity * sizeof(TLLUpvalue*));
                    }
                    frame->closureEnv->upvalues[frame->closureEnv->count++] = NULL;
                }
                TLLUpvalue *box = (TLLUpvalue*)calloc(1, sizeof(TLLUpvalue));
                box->value = frame->locals[a];  /* Move value from local to box */
                frame->locals[a] = tll_null();  /* Clear original to avoid double-free */
                box->refCount = 1;
                frame->closureEnv->upvalues[b] = box;
                break;
            }
            case OP_GET_UPVALUE: {
                if (frame->closureEnv && b < frame->closureEnv->count && frame->closureEnv->upvalues[b]) {
                    regs[a] = frame->closureEnv->upvalues[b]->value;
                } else {
                    regs[a] = tll_null();
                }
                break;
            }
            case OP_SET_UPVALUE: {
                if (frame->closureEnv && a < frame->closureEnv->count && frame->closureEnv->upvalues[a]) {
                    tll_value_free(frame->closureEnv->upvalues[a]->value);
                    frame->closureEnv->upvalues[a]->value = regs[b];
                }
                break;
            }
            case OP_CLOSURE: {
                int captureCount = c;
                TLLClosureEnv *newEnv = (TLLClosureEnv*)calloc(1, sizeof(TLLClosureEnv));
                newEnv->capacity = captureCount > 0 ? captureCount : 1;
                newEnv->upvalues = (TLLUpvalue**)calloc(newEnv->capacity, sizeof(TLLUpvalue*));
                newEnv->count = captureCount;
                if (frame->closureEnv) {
                    for (int i = 0; i < captureCount; i++) {
                        int slot = inst->operands[3 + i];
                        if (slot < frame->closureEnv->count && frame->closureEnv->upvalues[slot]) {
                            newEnv->upvalues[i] = frame->closureEnv->upvalues[slot];
                            newEnv->upvalues[i]->refCount++;
                        }
                    }
                }
                regs[a] = tll_function(b, newEnv);
                break;
            }
            case OP_ADD: {
                TLLValue x = regs[b], y = regs[c];
                if (x.type == TLL_STRING || y.type == TLL_STRING) {
                    char *sx = tll_to_string(x), *sy = tll_to_string(y);
                    char *r = (char*)malloc(strlen(sx) + strlen(sy) + 1);
                    strcpy(r, sx); strcat(r, sy);
                    regs[a] = tll_string(r);
                    free(sx); free(sy); free(r);
                } else if (x.type == TLL_FLOAT || y.type == TLL_FLOAT) {
                    double dx = (x.type == TLL_INT) ? (double)x.as.integer : x.as.floating;
                    double dy = (y.type == TLL_INT) ? (double)y.as.integer : y.as.floating;
                    regs[a] = tll_float(dx + dy);
                } else {
                    regs[a] = tll_int(x.as.integer + y.as.integer);
                }
                break;
            }
            case OP_SUB:
                regs[a] = (regs[b].type == TLL_FLOAT || regs[c].type == TLL_FLOAT) ?
                    tll_float((regs[b].type==TLL_INT?(double)regs[b].as.integer:regs[b].as.floating) -
                              (regs[c].type==TLL_INT?(double)regs[c].as.integer:regs[c].as.floating)) :
                    tll_int(regs[b].as.integer - regs[c].as.integer);
                break;
            case OP_MUL:
                regs[a] = (regs[b].type == TLL_FLOAT || regs[c].type == TLL_FLOAT) ?
                    tll_float((regs[b].type==TLL_INT?(double)regs[b].as.integer:regs[b].as.floating) *
                              (regs[c].type==TLL_INT?(double)regs[c].as.integer:regs[c].as.floating)) :
                    tll_int(regs[b].as.integer * regs[c].as.integer);
                break;
            case OP_DIV: {
                double dx = (regs[b].type==TLL_INT?(double)regs[b].as.integer:regs[b].as.floating);
                double dy = (regs[c].type==TLL_INT?(double)regs[c].as.integer:regs[c].as.floating);
                regs[a] = tll_float(dx / dy);
                break;
            }
            case OP_MOD:
                regs[a] = tll_int(regs[b].as.integer % regs[c].as.integer);
                break;
            case OP_POW: {
                double dx = (regs[b].type==TLL_INT?(double)regs[b].as.integer:regs[b].as.floating);
                double dy = (regs[c].type==TLL_INT?(double)regs[c].as.integer:regs[c].as.floating);
                regs[a] = tll_float(pow(dx, dy));
                break;
            }
            case OP_EQ: regs[a] = tll_bool(tll_equals(regs[b], regs[c])); break;
            case OP_NEQ: regs[a] = tll_bool(!tll_equals(regs[b], regs[c])); break;
            case OP_LT: {
                if (regs[b].type == TLL_STRING && regs[c].type == TLL_STRING)
                    regs[a] = tll_bool(strcmp(regs[b].as.string, regs[c].as.string) < 0);
                else {
                    double dx = (regs[b].type==TLL_INT?(double)regs[b].as.integer:regs[b].as.floating);
                    double dy = (regs[c].type==TLL_INT?(double)regs[c].as.integer:regs[c].as.floating);
                    regs[a] = tll_bool(dx < dy);
                }
                break;
            }
            case OP_GT: {
                if (regs[b].type == TLL_STRING && regs[c].type == TLL_STRING)
                    regs[a] = tll_bool(strcmp(regs[b].as.string, regs[c].as.string) > 0);
                else {
                    double dx = (regs[b].type==TLL_INT?(double)regs[b].as.integer:regs[b].as.floating);
                    double dy = (regs[c].type==TLL_INT?(double)regs[c].as.integer:regs[c].as.floating);
                    regs[a] = tll_bool(dx > dy);
                }
                break;
            }
            case OP_LE: {
                double dx = (regs[b].type==TLL_INT?(double)regs[b].as.integer:regs[b].as.floating);
                double dy = (regs[c].type==TLL_INT?(double)regs[c].as.integer:regs[c].as.floating);
                regs[a] = tll_bool(dx <= dy);
                break;
            }
            case OP_GE: {
                double dx = (regs[b].type==TLL_INT?(double)regs[b].as.integer:regs[b].as.floating);
                double dy = (regs[c].type==TLL_INT?(double)regs[c].as.integer:regs[c].as.floating);
                regs[a] = tll_bool(dx >= dy);
                break;
            }
            case OP_AND: regs[a] = tll_bool(tll_truthy(regs[b]) && tll_truthy(regs[c])); break;
            case OP_OR: regs[a] = tll_bool(tll_truthy(regs[b]) || tll_truthy(regs[c])); break;
            case OP_NOT: regs[a] = tll_bool(!tll_truthy(regs[b])); break;
            case OP_NEG:
                regs[a] = (regs[b].type == TLL_FLOAT) ? tll_float(-regs[b].as.floating) : tll_int(-regs[b].as.integer);
                break;
            case OP_JMP: frame->pc = a; break;
            case OP_JMP_IF_FALSE:
                if (!tll_truthy(regs[a])) frame->pc = b;
                break;
            case OP_CALL:
                do_call(vm, frame, a, b, c);
                break;
            case OP_RET: {
                TLLValue retVal = regs[a];
                int retReg = frame->returnReg;
                TLLFrame *f = pop_frame(vm);
                if (vm->callStackSize > 0 && retReg >= 0) {
                    vm->callStack[vm->callStackSize - 1]->registers[retReg] = retVal;
                }
                free_frame(f);
                break;
            }
            case OP_PRINT: {
                char *s = tll_to_string(regs[a]);
                fputs(s, stdout);
                free(s);
                break;
            }
            case OP_PRINTLN: {
                char *s = tll_to_string(regs[a]);
                puts(s);
                free(s);
                break;
            }
            case OP_MAKE_ARRAY: {
                TLLValue arr = tll_array();
                for (int i = 0; i < b; i++) {
                    TLLValue v = pop_arg(frame);
                    /* unshift: insert at beginning */
                    if (arr.as.array->length >= arr.as.array->capacity) {
                        arr.as.array->capacity *= 2;
                        arr.as.array->items = (TLLValue*)realloc(arr.as.array->items, arr.as.array->capacity * sizeof(TLLValue));
                    }
                    memmove(&arr.as.array->items[1], arr.as.array->items, arr.as.array->length * sizeof(TLLValue));
                    arr.as.array->items[0] = v;
                    arr.as.array->length++;
                }
                regs[a] = arr;
                break;
            }
            case OP_MAKE_MAP: {
                TLLValue map = tll_map();
                for (int i = 0; i < b; i++) {
                    TLLValue v = pop_arg(frame);
                    TLLValue k = pop_arg(frame);
                    char *ks = tll_to_string(k);
                    map_set(map.as.map, ks, v);
                    free(ks);
                }
                regs[a] = map;
                break;
            }
            case OP_INDEX_GET: {
                TLLValue obj = regs[b];
                if (obj.type == TLL_ARRAY) {
                    int idx = (regs[c].type == TLL_INT) ? (int)regs[c].as.integer : 0;
                    regs[a] = array_get(obj.as.array, idx);
                } else if (obj.type == TLL_MAP) {
                    char *key = tll_to_string(regs[c]);
                    regs[a] = map_get(obj.as.map, key);
                    free(key);
                } else {
                    regs[a] = tll_null();
                }
                break;
            }
            case OP_INDEX_SET: {
                TLLValue obj = regs[a];
                if (obj.type == TLL_ARRAY) {
                    int idx = (regs[b].type == TLL_INT) ? (int)regs[b].as.integer : 0;
                    array_set(obj.as.array, idx, regs[c]);
                } else if (obj.type == TLL_MAP) {
                    char *key = tll_to_string(regs[b]);
                    map_set(obj.as.map, key, regs[c]);
                    free(key);
                }
                break;
            }
            case OP_MEMBER_GET: {
                TLLValue obj = regs[b];
                const char *propName = (consts[c].type == TLL_STRING) ? consts[c].as.string : "";
                if (obj.type == TLL_ARRAY && strcmp(propName, "length") == 0) {
                    regs[a] = tll_int(obj.as.array->length);
                } else if (obj.type == TLL_MAP) {
                    regs[a] = map_get(obj.as.map, propName);
                } else if (obj.type == TLL_FUNCTION || obj.type == TLL_BUILTIN) {
                    regs[a] = map_get((obj.type==TLL_MAP)?obj.as.map:NULL, propName);
                } else {
                    regs[a] = tll_null();
                }
                break;
            }
            case OP_MEMBER_SET: {
                TLLValue obj = regs[a];
                const char *propName = (consts[b].type == TLL_STRING) ? consts[b].as.string : "";
                if (obj.type == TLL_MAP) {
                    map_set(obj.as.map, propName, regs[c]);
                }
                break;
            }
            case OP_HALT:
                return;
            case OP_NOP:
                break;
            case OP_PUSH:
                push_arg(frame, regs[a]);
                break;
            case OP_CONCAT: {
                char *sx = tll_to_string(regs[b]), *sy = tll_to_string(regs[c]);
                char *r = (char*)malloc(strlen(sx) + strlen(sy) + 1);
                strcpy(r, sx); strcat(r, sy);
                regs[a] = tll_string(r);
                free(sx); free(sy); free(r);
                break;
            }
            case OP_LOAD_BUILTIN:
                regs[a] = tll_builtin(b);
                break;
            case OP_TRY_START:
                push_try(frame, a);
                break;
            case OP_TRY_END:
                pop_try(frame);
                break;
            case OP_THROW:
                throw_exception(vm, frame, regs[a]);
                break;
            default:
                fprintf(stderr, "tllvm: unknown opcode %d at pc %d in %s\n", inst->op, frame->pc - 1, frame->function->name);
                exit(1);
        }
    }
}

void tll_vm_free(TLLVM *vm) {
    while (vm->callStackSize > 0) {
        TLLFrame *f = pop_frame(vm);
        free_frame(f);
    }
    free(vm->callStack);
    for (int i = 0; i < vm->globalCount; i++) tll_value_free(vm->globals[i]);
    free(vm->globals);
    free(vm);
}
