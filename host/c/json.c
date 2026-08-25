/* Minimal JSON parser for loading .tllbc bytecode files */
#include "tllvm.h"
#include <ctype.h>

static void skip_ws(const char **p) {
    while (**p && isspace((unsigned char)**p)) (*p)++;
}

static TLLValue parse_json_value(const char **p);

static char *parse_json_string(const char **p) {
    if (**p != '"') return NULL;
    (*p)++;
    int cap = 64, len = 0;
    char *buf = (char*)malloc(cap);
    while (**p && **p != '"') {
        if (**p == '\\') {
            (*p)++;
            char c = **p;
            switch (c) {
                case 'n': c = '\n'; break;
                case 't': c = '\t'; break;
                case 'r': c = '\r'; break;
                case '\\': c = '\\'; break;
                case '"': c = '"'; break;
                case '/': c = '/'; break;
                case 'u': {
                    /* Simple unicode: skip 4 hex chars, output '?' */
                    (*p) += 4;
                    c = '?';
                    break;
                }
                default: break;
            }
            if (len + 1 >= cap) { cap *= 2; buf = (char*)realloc(buf, cap); }
            buf[len++] = c;
        } else {
            if (len + 1 >= cap) { cap *= 2; buf = (char*)realloc(buf, cap); }
            buf[len++] = **p;
        }
        (*p)++;
    }
    if (**p == '"') (*p)++;
    buf[len] = '\0';
    return buf;
}

static TLLValue parse_json_number(const char **p) {
    char *start = (char*)*p;
    int is_float = 0;
    if (**p == '-') (*p)++;
    while (isdigit((unsigned char)**p)) (*p)++;
    if (**p == '.') { is_float = 1; (*p)++; while (isdigit((unsigned char)**p)) (*p)++; }
    if (**p == 'e' || **p == 'E') {
        is_float = 1; (*p)++;
        if (**p == '+' || **p == '-') (*p)++;
        while (isdigit((unsigned char)**p)) (*p)++;
    }
    int len = (int)(*p - start);
    char *numstr = (char*)malloc(len + 1);
    memcpy(numstr, start, len);
    numstr[len] = '\0';
    TLLValue v;
    if (is_float) {
        v = tll_float(atof(numstr));
    } else {
        v = tll_int(atoll(numstr));
    }
    free(numstr);
    return v;
}

static TLLValue parse_json_array(const char **p) {
    (*p)++; /* skip [ */
    TLLValue arr = tll_array();
    skip_ws(p);
    if (**p == ']') { (*p)++; return arr; }
    while (1) {
        skip_ws(p);
        TLLValue v = parse_json_value(p);
        array_push(arr.as.array, v);
        skip_ws(p);
        if (**p == ',') { (*p)++; continue; }
        if (**p == ']') { (*p)++; break; }
        break;
    }
    return arr;
}

static TLLValue parse_json_object(const char **p) {
    (*p)++; /* skip { */
    TLLValue map = tll_map();
    skip_ws(p);
    if (**p == '}') { (*p)++; return map; }
    while (1) {
        skip_ws(p);
        char *key = parse_json_string(p);
        skip_ws(p);
        if (**p == ':') (*p)++;
        skip_ws(p);
        TLLValue v = parse_json_value(p);
        map_set(map.as.map, key, v);
        free(key);
        skip_ws(p);
        if (**p == ',') { (*p)++; continue; }
        if (**p == '}') { (*p)++; break; }
        break;
    }
    return map;
}

static TLLValue parse_json_value(const char **p) {
    skip_ws(p);
    char c = **p;
    if (c == '"') {
        char *s = parse_json_string(p);
        TLLValue v = tll_string(s);
        free(s);
        return v;
    }
    if (c == '{') return parse_json_object(p);
    if (c == '[') return parse_json_array(p);
    if (c == '-' || isdigit((unsigned char)c)) return parse_json_number(p);
    if (strncmp(*p, "true", 4) == 0) { *p += 4; return tll_bool(1); }
    if (strncmp(*p, "false", 5) == 0) { *p += 5; return tll_bool(0); }
    if (strncmp(*p, "null", 4) == 0) { *p += 4; return tll_null(); }
    return tll_null();
}

TLLValue tll_parse_json(const char **json) {
    return parse_json_value(json);
}

static TLLInstruction *parse_instructions(TLLValue arr, int *count) {
    if (arr.type != TLL_ARRAY) { *count = 0; return NULL; }
    int n = arr.as.array->length;
    TLLInstruction *instrs = (TLLInstruction*)calloc(n, sizeof(TLLInstruction));
    for (int i = 0; i < n; i++) {
        TLLValue obj = arr.as.array->items[i];
        if (obj.type != TLL_MAP) continue;
        TLLValue opv = map_get(obj.as.map, "op");
        instrs[i].op = (opv.type == TLL_INT) ? (int)opv.as.integer : 0;
        TLLValue opsv = map_get(obj.as.map, "operands");
        if (opsv.type == TLL_ARRAY) {
            int oc = opsv.as.array->length;
            instrs[i].operandCount = oc;
            instrs[i].operands = (int*)calloc(oc, sizeof(int));
            for (int j = 0; j < oc; j++) {
                TLLValue ov = opsv.as.array->items[j];
                if (ov.type == TLL_INT) instrs[i].operands[j] = (int)ov.as.integer;
                else if (ov.type == TLL_FLOAT) instrs[i].operands[j] = (int)ov.as.floating;
            }
        } else {
            instrs[i].operandCount = 0;
            instrs[i].operands = NULL;
        }
    }
    *count = n;
    return instrs;
}

TLLProgram *tll_load_program(const char *filename) {
    FILE *f = fopen(filename, "rb");
    if (!f) { fprintf(stderr, "tllvm: cannot open %s\n", filename); return NULL; }
    fseek(f, 0, SEEK_END);
    long size = ftell(f);
    fseek(f, 0, SEEK_SET);
    char *data = (char*)malloc(size + 1);
    fread(data, 1, size, f);
    data[size] = '\0';
    fclose(f);

    const char *p = data;
    TLLValue root = parse_json_value(&p);
    if (root.type != TLL_MAP) {
        fprintf(stderr, "tllvm: invalid bytecode format\n");
        free(data);
        return NULL;
    }

    TLLProgram *prog = (TLLProgram*)calloc(1, sizeof(TLLProgram));

    /* Parse functions */
    TLLValue funcs = map_get(root.as.map, "functions");
    if (funcs.type == TLL_ARRAY) {
        prog->functionCount = funcs.as.array->length;
        prog->functions = (TLLFunction*)calloc(prog->functionCount, sizeof(TLLFunction));
        for (int i = 0; i < prog->functionCount; i++) {
            TLLValue fobj = funcs.as.array->items[i];
            if (fobj.type != TLL_MAP) continue;
            TLLValue name = map_get(fobj.as.map, "name");
            prog->functions[i].name = (name.type == TLL_STRING) ? strdup(name.as.string) : strdup("?");
            TLLValue pc = map_get(fobj.as.map, "paramCount");
            prog->functions[i].paramCount = (pc.type == TLL_INT) ? (int)pc.as.integer : 0;
            TLLValue lc = map_get(fobj.as.map, "localCount");
            prog->functions[i].localCount = (lc.type == TLL_INT) ? (int)lc.as.integer : 0;
            TLLValue instrs = map_get(fobj.as.map, "instructions");
            prog->functions[i].instructions = parse_instructions(instrs, &prog->functions[i].instructionCount);
        }
    }

    /* Parse constants */
    TLLValue consts = map_get(root.as.map, "constants");
    if (consts.type == TLL_ARRAY) {
        prog->constantCount = consts.as.array->length;
        prog->constants = (TLLValue*)calloc(prog->constantCount, sizeof(TLLValue));
        for (int i = 0; i < prog->constantCount; i++) {
            TLLValue v = consts.as.array->items[i];
            /* Detect function value objects: {"__fn":true, "fnIdx":N, "env":...} */
            if (v.type == TLL_MAP) {
                TLLValue fnFlag = map_get(v.as.map, "__fn");
                if (fnFlag.type == TLL_BOOL && fnFlag.as.boolean) {
                    TLLValue idxVal = map_get(v.as.map, "fnIdx");
                    int fnIdx = (idxVal.type == TLL_INT) ? (int)idxVal.as.integer : 0;
                    TLLValue envVal = map_get(v.as.map, "env");
                    TLLClosureEnv *env = NULL;
                    if (envVal.type != TLL_NULL) {
                        /* Closure with environment - for now create empty env */
                        env = (TLLClosureEnv*)calloc(1, sizeof(TLLClosureEnv));
                        env->capacity = 1;
                        env->upvalues = (TLLUpvalue**)calloc(1, sizeof(TLLUpvalue*));
                    }
                    prog->constants[i] = tll_function(fnIdx, env);
                    continue;
                }
                /* Detect builtin value objects: {"__builtin":true, "idx":N} */
                TLLValue builtinFlag = map_get(v.as.map, "__builtin");
                if (builtinFlag.type == TLL_BOOL && builtinFlag.as.boolean) {
                    TLLValue idxVal = map_get(v.as.map, "idx");
                    int idx = (idxVal.type == TLL_INT) ? (int)idxVal.as.integer : 0;
                    prog->constants[i] = tll_builtin(idx);
                    continue;
                }
            }
            prog->constants[i] = v;
        }
    }

    TLLValue mfi = map_get(root.as.map, "mainFunctionIndex");
    prog->mainFunctionIndex = (mfi.type == TLL_INT) ? (int)mfi.as.integer : 0;
    TLLValue gc = map_get(root.as.map, "globalCount");
    prog->globalCount = (gc.type == TLL_INT) ? (int)gc.as.integer : 0;

    free(data);
    /* Note: root value and its children are intentionally not freed - constants array references them */
    return prog;
}
