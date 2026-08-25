/*
 * TLL Native Launcher (tllvm)
 * Bootstrap/Host layer only - NOT TLL Language Core.
 *
 * Responsibility:
 *   1. Load .tllbc (JSON bytecode)
 *   2. Execute TLL bytecode opcodes (minimal VM)
 *   3. Provide Host ABI (io, fs, http, random, process, clock)
 *
 * NOT responsible for:
 *   - Lexer, Parser, TypeChecker, Codegen, Linker (TLL compiler)
 *   - TLL language semantics (runtime/vm.tll is the source of truth)
 *   - Stdlib computation (json/math/strings/arrays/convert should be TLL)
 *
 * This is the "first match" that lights the TLL VM.
 * Architecture: tllvm -> vm_run.tllbc -> TLL VM (vm.tll) -> user program
 */

#ifndef TLLVM_H
#define TLLVM_H

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

/* === TLL Value Types === */
typedef enum {
    TLL_NULL,
    TLL_BOOL,
    TLL_INT,
    TLL_FLOAT,
    TLL_STRING,
    TLL_ARRAY,
    TLL_MAP,
    TLL_FUNCTION,  /* {__fn:true, fnIdx, env} */
    TLL_BUILTIN,   /* {__builtin:true, idx} */
    TLL_UPVALUE    /* {value: TLLValue} */
} TLLType;

typedef struct TLLValue TLLValue;
typedef struct TLLArray TLLArray;
typedef struct TLLMap TLLMap;
typedef struct TLLMapEntry TLLMapEntry;
typedef struct TLLClosureEnv TLLClosureEnv;
typedef struct TLLUpvalue TLLUpvalue;

struct TLLValue {
    TLLType type;
    union {
        int boolean;
        long long integer;
        double floating;
        char *string;
        TLLArray *array;
        TLLMap *map;
        struct { int fnIdx; TLLClosureEnv *env; } func;
        struct { int idx; } builtin;
        TLLUpvalue *upvalue;
    } as;
};

struct TLLArray {
    TLLValue *items;
    int length;
    int capacity;
};

struct TLLMapEntry {
    char *key;
    TLLValue value;
    TLLMapEntry *next;
};

struct TLLMap {
    TLLMapEntry **buckets;
    int bucketCount;
    int size;
};

struct TLLUpvalue {
    TLLValue value;
    int refCount;
};

struct TLLClosureEnv {
    TLLUpvalue **upvalues;
    int count;
    int capacity;
};

/* === Bytecode structures === */
typedef struct {
    int op;
    int *operands;
    int operandCount;
} TLLInstruction;

typedef struct {
    char *name;
    int paramCount;
    TLLInstruction *instructions;
    int instructionCount;
    int localCount;
} TLLFunction;

typedef struct {
    TLLFunction *functions;
    int functionCount;
    TLLValue *constants;
    int constantCount;
    int mainFunctionIndex;
    int globalCount;
} TLLProgram;

/* === Call Frame === */
typedef struct {
    TLLFunction *function;
    int pc;
    TLLValue registers[256];
    TLLValue *locals;
    int localCount;
    TLLValue *argStack;
    int argStackSize;
    int argStackCapacity;
    int *tryStack;
    int tryStackSize;
    int tryStackCapacity;
    int returnReg;
    TLLClosureEnv *closureEnv;
} TLLFrame;

/* === VM === */
typedef struct {
    TLLProgram *program;
    TLLFrame **callStack;
    int callStackSize;
    int callStackCapacity;
    TLLValue *globals;
    int globalCount;
} TLLVM;

/* === Opcode constants === */
enum {
    OP_LOAD_CONST = 0,
    OP_LOAD_VAR = 1,
    OP_STORE_VAR = 2,
    OP_ADD = 3,
    OP_SUB = 4,
    OP_MUL = 5,
    OP_DIV = 6,
    OP_MOD = 7,
    OP_POW = 8,
    OP_EQ = 9,
    OP_NEQ = 10,
    OP_LT = 11,
    OP_GT = 12,
    OP_LE = 13,
    OP_GE = 14,
    OP_AND = 15,
    OP_OR = 16,
    OP_NOT = 17,
    OP_NEG = 18,
    OP_JMP = 19,
    OP_JMP_IF_FALSE = 20,
    OP_CALL = 21,
    OP_RET = 22,
    OP_PRINT = 23,
    OP_PRINTLN = 24,
    OP_MAKE_ARRAY = 25,
    OP_MAKE_MAP = 26,
    OP_MAKE_STRUCT = 27,
    OP_INDEX_GET = 28,
    OP_INDEX_SET = 29,
    OP_MEMBER_GET = 30,
    OP_MEMBER_SET = 31,
    OP_HALT = 32,
    OP_NOP = 33,
    OP_PUSH = 34,
    OP_CONCAT = 35,
    OP_LOAD_BUILTIN = 36,
    OP_THROW = 37,
    OP_TRY_START = 38,
    OP_TRY_END = 39,
    OP_LOAD_GLOBAL = 40,
    OP_STORE_GLOBAL = 41,
    OP_CLOSURE = 42,
    OP_GET_UPVALUE = 43,
    OP_SET_UPVALUE = 44,
    OP_BOX_LOCAL = 45
};

/* === Function declarations === */

/* Value operations */
TLLValue tll_null(void);
TLLValue tll_bool(int b);
TLLValue tll_int(long long v);
TLLValue tll_float(double v);
TLLValue tll_string(const char *s);
TLLValue tll_string_n(const char *s, int len);
TLLValue tll_array(void);
TLLValue tll_map(void);
TLLValue tll_function(int fnIdx, TLLClosureEnv *env);
TLLValue tll_builtin(int idx);
void tll_value_free(TLLValue v);
char *tll_to_string(TLLValue v);
int tll_truthy(TLLValue v);
int tll_equals(TLLValue a, TLLValue b);

/* Array operations */
void array_push(TLLArray *arr, TLLValue v);
TLLValue array_get(TLLArray *arr, int idx);
void array_set(TLLArray *arr, int idx, TLLValue v);

/* Map operations */
void map_set(TLLMap *map, const char *key, TLLValue v);
TLLValue map_get(TLLMap *map, const char *key);
int map_has(TLLMap *map, const char *key);

/* JSON parser */
TLLProgram *tll_load_program(const char *filename);
TLLValue tll_parse_json(const char **json);

/* VM */
TLLVM *tll_vm_create(TLLProgram *prog);
void tll_vm_run(TLLVM *vm);
void tll_vm_free(TLLVM *vm);

/* Builtin */
TLLValue tll_call_builtin(TLLVM *vm, int idx, TLLValue *args, int argCount);

/* Host ABI */
void host_print(const char *s);
void host_println(const char *s);
char *host_read_line(const char *prompt);
char *host_read_file(const char *path);
void host_write_file(const char *path, const char *content);

#endif /* TLLVM_H */
