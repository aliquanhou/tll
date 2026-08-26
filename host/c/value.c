/* TLL Value system - dynamic typing for the bootstrap VM */
#include "tllvm.h"

TLLValue tll_null(void) {
    TLLValue v;
    v.type = TLL_NULL;
    v.as.integer = 0;
    return v;
}

TLLValue tll_bool(int b) {
    TLLValue v;
    v.type = TLL_BOOL;
    v.as.boolean = b ? 1 : 0;
    return v;
}

TLLValue tll_int(long long val) {
    TLLValue v;
    v.type = TLL_INT;
    v.as.integer = val;
    return v;
}

TLLValue tll_float(double val) {
    TLLValue v;
    v.type = TLL_FLOAT;
    v.as.floating = val;
    return v;
}

/* String allocation with refCount header: [int refCount][char data...] */
static char *alloc_string_rc(const char *s, int len) {
    char *buf = (char*)malloc(sizeof(int) + len + 1);
    *(int*)buf = 1;
    memcpy(buf + sizeof(int), s, len);
    buf[sizeof(int) + len] = '\0';
    return buf + sizeof(int);
}

static int *str_rc(char *s) { return (int*)(s - sizeof(int)); }

TLLValue tll_string(const char *s) {
    TLLValue v;
    v.type = TLL_STRING;
    v.as.string = s ? alloc_string_rc(s, (int)strlen(s)) : alloc_string_rc("", 0);
    return v;
}

TLLValue tll_string_n(const char *s, int len) {
    TLLValue v;
    v.type = TLL_STRING;
    v.as.string = alloc_string_rc(s, len);
    return v;
}

TLLValue tll_array(void) {
    TLLValue v;
    v.type = TLL_ARRAY;
    v.as.array = (TLLArray*)calloc(1, sizeof(TLLArray));
    v.as.array->capacity = 8;
    v.as.array->items = (TLLValue*)calloc(8, sizeof(TLLValue));
    v.as.array->length = 0;
    v.as.array->refCount = 1;
    return v;
}

TLLValue tll_map(void) {
    TLLValue v;
    v.type = TLL_MAP;
    v.as.map = (TLLMap*)calloc(1, sizeof(TLLMap));
    v.as.map->bucketCount = 16;
    v.as.map->buckets = (TLLMapEntry**)calloc(16, sizeof(TLLMapEntry*));
    v.as.map->size = 0;
    v.as.map->refCount = 1;
    return v;
}

TLLValue tll_function(int fnIdx, TLLClosureEnv *env) {
    TLLValue v;
    v.type = TLL_FUNCTION;
    v.as.func.fnIdx = fnIdx;
    v.as.func.env = env;
    return v;
}

TLLValue tll_builtin(int idx) {
    TLLValue v;
    v.type = TLL_BUILTIN;
    v.as.builtin.idx = idx;
    return v;
}

static unsigned int hash_string(const char *s) {
    unsigned int h = 5381;
    while (*s) h = ((h << 5) + h) + (unsigned char)*s++;
    return h;
}

void map_set(TLLMap *map, const char *key, TLLValue value) {
    unsigned int h = hash_string(key) % map->bucketCount;
    TLLMapEntry *e = map->buckets[h];
    while (e) {
        if (strcmp(e->key, key) == 0) {
            tll_value_free(e->value);
            e->value = value;
            return;
        }
        e = e->next;
    }
    e = (TLLMapEntry*)malloc(sizeof(TLLMapEntry));
    e->key = strdup(key);
    e->value = value;
    e->next = map->buckets[h];
    map->buckets[h] = e;
    map->size++;
}

TLLValue map_get(TLLMap *map, const char *key) {
    if (!map) return tll_null();
    unsigned int h = hash_string(key) % map->bucketCount;
    TLLMapEntry *e = map->buckets[h];
    while (e) {
        if (strcmp(e->key, key) == 0) return e->value;
        e = e->next;
    }
    return tll_null();
}

int map_has(TLLMap *map, const char *key) {
    if (!map) return 0;
    unsigned int h = hash_string(key) % map->bucketCount;
    TLLMapEntry *e = map->buckets[h];
    while (e) {
        if (strcmp(e->key, key) == 0) return 1;
        e = e->next;
    }
    return 0;
}

void array_push(TLLArray *arr, TLLValue v) {
    if (arr->length >= arr->capacity) {
        arr->capacity *= 2;
        arr->items = (TLLValue*)realloc(arr->items, arr->capacity * sizeof(TLLValue));
    }
    arr->items[arr->length++] = v;
}

TLLValue array_get(TLLArray *arr, int idx) {
    if (idx < 0 || idx >= arr->length) return tll_null();
    return arr->items[idx];
}

void array_set(TLLArray *arr, int idx, TLLValue v) {
    while (arr->length <= idx) array_push(arr, tll_null());
    tll_value_free(arr->items[idx]);
    arr->items[idx] = v;
}

int tll_truthy(TLLValue v) {
    switch (v.type) {
        case TLL_NULL: return 0;
        case TLL_BOOL: return v.as.boolean;
        case TLL_INT: return v.as.integer != 0;
        case TLL_FLOAT: return v.as.floating != 0.0;
        case TLL_STRING: return strlen(v.as.string) > 0;
        case TLL_ARRAY: return v.as.array->length > 0;
        case TLL_MAP: return v.as.map->size > 0;
        default: return 1;
    }
}

int tll_equals(TLLValue a, TLLValue b) {
    if (a.type != b.type) {
        /* Allow int/float comparison */
        if ((a.type == TLL_INT || a.type == TLL_FLOAT) &&
            (b.type == TLL_INT || b.type == TLL_FLOAT)) {
            double da = (a.type == TLL_INT) ? (double)a.as.integer : a.as.floating;
            double db = (b.type == TLL_INT) ? (double)b.as.integer : b.as.floating;
            return da == db;
        }
        return 0;
    }
    switch (a.type) {
        case TLL_NULL: return 1;
        case TLL_BOOL: return a.as.boolean == b.as.boolean;
        case TLL_INT: return a.as.integer == b.as.integer;
        case TLL_FLOAT: return a.as.floating == b.as.floating;
        case TLL_STRING: return strcmp(a.as.string, b.as.string) == 0;
        default: return 0; /* reference equality for array/map/function */
    }
}

static char *int_to_string(long long v) {
    char buf[32];
    snprintf(buf, sizeof(buf), "%lld", v);
    return strdup(buf);
}

static char *float_to_string(double v) {
    char buf[64];
    if (v == (long long)v) {
        snprintf(buf, sizeof(buf), "%lld.0", (long long)v);
    } else {
        snprintf(buf, sizeof(buf), "%g", v);
    }
    return strdup(buf);
}

char *tll_to_string(TLLValue v) {
    switch (v.type) {
        case TLL_NULL: return strdup("");
        case TLL_BOOL: return strdup(v.as.boolean ? "true" : "false");
        case TLL_INT: return int_to_string(v.as.integer);
        case TLL_FLOAT: return float_to_string(v.as.floating);
        case TLL_STRING: return strdup(v.as.string);
        case TLL_ARRAY: {
            /* Build array string */
            char *result = strdup("[");
            for (int i = 0; i < v.as.array->length; i++) {
                if (i > 0) { char *t = result; result = (char*)malloc(strlen(t) + 3); strcpy(result, t); strcat(result, ", "); free(t); }
                char *elem = tll_to_string(v.as.array->items[i]);
                char *t = result;
                result = (char*)malloc(strlen(result) + strlen(elem) + 1);
                strcpy(result, t);
                strcat(result, elem);
                free(t);
                free(elem);
            }
            char *t = result;
            result = (char*)malloc(strlen(result) + 2);
            strcpy(result, t);
            strcat(result, "]");
            free(t);
            return result;
        }
        case TLL_MAP: {
            /* Simple JSON-like representation */
            char *result = strdup("{");
            int first = 1;
            for (int b = 0; b < v.as.map->bucketCount; b++) {
                TLLMapEntry *e = v.as.map->buckets[b];
                while (e) {
                    if (!first) { char *t = result; result = (char*)malloc(strlen(t) + 3); strcpy(result, t); strcat(result, ", "); free(t); }
                    first = 0;
                    char *val = tll_to_string(e->value);
                    char *tmp = (char*)malloc(strlen(result) + strlen(e->key) + strlen(val) + 8);
                    sprintf(tmp, "%s\"%s\":%s", result, e->key, val);
                    free(result);
                    free(val);
                    result = tmp;
                    e = e->next;
                }
            }
            char *t = result;
            result = (char*)malloc(strlen(result) + 2);
            strcpy(result, t);
            strcat(result, "}");
            free(t);
            return result;
        }
        case TLL_FUNCTION: {
            char buf[64];
            snprintf(buf, sizeof(buf), "[function:%d]", v.as.func.fnIdx);
            return strdup(buf);
        }
        default: return strdup("?");
    }
}

void tll_value_incref(TLLValue v) {
    switch (v.type) {
        case TLL_STRING: (*str_rc(v.as.string))++; break;
        case TLL_ARRAY: v.as.array->refCount++; break;
        case TLL_MAP: v.as.map->refCount++; break;
        case TLL_FUNCTION: if (v.as.func.env) v.as.func.env->refCount++; break;
        default: break;
    }
}

void tll_value_free(TLLValue v) {
    switch (v.type) {
        case TLL_STRING: {
            int *rc = str_rc(v.as.string);
            if (--(*rc) == 0) free(v.as.string - sizeof(int));
            break;
        }
        case TLL_ARRAY: {
            if (--v.as.array->refCount == 0) {
                for (int i = 0; i < v.as.array->length; i++)
                    tll_value_free(v.as.array->items[i]);
                free(v.as.array->items);
                free(v.as.array);
            }
            break;
        }
        case TLL_MAP: {
            if (--v.as.map->refCount == 0) {
                for (int b = 0; b < v.as.map->bucketCount; b++) {
                    TLLMapEntry *e = v.as.map->buckets[b];
                    while (e) {
                        TLLMapEntry *next = e->next;
                        free(e->key);
                        tll_value_free(e->value);
                        free(e);
                        e = next;
                    }
                }
                free(v.as.map->buckets);
                free(v.as.map);
            }
            break;
        }
        case TLL_FUNCTION: {
            TLLClosureEnv *env = v.as.func.env;
            if (env && --env->refCount == 0) {
                for (int i = 0; i < env->count; i++) {
                    TLLUpvalue *box = env->upvalues[i];
                    if (box && --box->refCount == 0) {
                        tll_value_free(box->value);
                        free(box);
                    }
                }
                free(env->upvalues);
                free(env);
            }
            break;
        }
        default: break;
    }
}
