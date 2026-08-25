/* TLL Builtin functions - Host ABI + stdlib implementation for bootstrap VM.
 * Note: In the final architecture, json/math/strings/arrays/convert should be
 * implemented in TLL stdlib. This C implementation is for bootstrap only.
 */
#include "tllvm.h"
#include <time.h>
#include <sys/stat.h>
#include <errno.h>
#include <ctype.h>

#ifdef _WIN32
#include <windows.h>
#else
#include <dirent.h>
#endif

/* === Helper: string operations === */
static char *str_dup(const char *s) { return s ? strdup(s) : strdup(""); }

static char *str_sub(const char *s, int start, int end) {
    int len = (int)strlen(s);
    if (start < 0) start = 0;
    if (end > len) end = len;
    if (start >= end) return strdup("");
    return tll_string_n(s + start, end - start).as.string;
}

/* === Builtin dispatch === */
TLLValue tll_call_builtin(TLLVM *vm, int idx, TLLValue *args, int argCount) {
    (void)vm;
    /* io (0-2) */
    if (idx == 0) { /* println */
        if (argCount > 0) { char *s = tll_to_string(args[0]); puts(s); free(s); }
        else puts("");
        return tll_null();
    }
    if (idx == 1) { /* print */
        if (argCount > 0) { char *s = tll_to_string(args[0]); fputs(s, stdout); free(s); }
        return tll_null();
    }
    if (idx == 2) { /* readLine */
        char buf[4096];
        if (argCount > 0) { char *s = tll_to_string(args[0]); fputs(s, stdout); free(s); }
        if (fgets(buf, sizeof(buf), stdin)) {
            int len = (int)strlen(buf);
            while (len > 0 && (buf[len-1] == '\n' || buf[len-1] == '\r')) buf[--len] = '\0';
            return tll_string(buf);
        }
        return tll_string("");
    }

    /* json (3-4) */
    if (idx == 3) { /* parse */
        if (argCount > 0 && args[0].type == TLL_STRING) {
            const char *p = args[0].as.string;
            return tll_parse_json(&p);
        }
        return tll_null();
    }
    if (idx == 4) { /* stringify */
        if (argCount > 0) {
            char *s = tll_to_string(args[0]);
            TLLValue r = tll_string(s);
            free(s);
            return r;
        }
        return tll_string("");
    }

    /* math (5-23) */
    if (idx >= 5 && idx <= 23) {
        double x = (argCount > 0) ? ((args[0].type==TLL_INT)?(double)args[0].as.integer:args[0].as.floating) : 0;
        double y = (argCount > 1) ? ((args[1].type==TLL_INT)?(double)args[1].as.integer:args[1].as.floating) : 0;
        switch (idx) {
            case 5: return tll_float(sqrt(x));
            case 6: return tll_float(fabs(x));
            case 7: return tll_float(floor(x));
            case 8: return tll_float(ceil(x));
            case 9: return tll_float(round(x));
            case 10: return tll_float(x < y ? x : y);
            case 11: return tll_float(x > y ? x : y);
            case 12: return tll_float(pow(x, y));
            case 13: return tll_float(sin(x));
            case 14: return tll_float(cos(x));
            case 15: return tll_float(tan(x));
            case 16: return tll_float(log(x));
            case 17: return tll_float(log(x) / log(2.0));
            case 18: return tll_float(log10(x));
            case 19: return tll_float(exp(x));
            case 20: return tll_float(3.14159265358979323846);
            case 21: return tll_float(2.71828182845904523536);
            case 22: return tll_float((double)rand() / RAND_MAX);
            case 23: {
                int mn = (int)x, mx = (int)y;
                return tll_int(mn + rand() % (mx - mn + 1));
            }
        }
    }

    /* strings (24-48) */
    if (idx >= 24 && idx <= 48) {
        const char *s = (argCount > 0 && args[0].type == TLL_STRING) ? args[0].as.string : "";
        int slen = (int)strlen(s);
        switch (idx) {
            case 24: return tll_int(slen); /* length */
            case 25: { /* toUpper */
                char *r = strdup(s);
                for (int i = 0; r[i]; i++) r[i] = toupper((unsigned char)r[i]);
                return tll_string(r);
            }
            case 26: { /* toLower */
                char *r = strdup(s);
                for (int i = 0; r[i]; i++) r[i] = tolower((unsigned char)r[i]);
                return tll_string(r);
            }
            case 27: { /* trim */
                int start = 0, end = slen;
                while (start < end && isspace((unsigned char)s[start])) start++;
                while (end > start && isspace((unsigned char)s[end-1])) end--;
                return tll_string_n(s + start, end - start);
            }
            case 28: { /* trimStart */
                int start = 0;
                while (start < slen && isspace((unsigned char)s[start])) start++;
                return tll_string(s + start);
            }
            case 29: { /* trimEnd */
                int end = slen;
                while (end > 0 && isspace((unsigned char)s[end-1])) end--;
                return tll_string_n(s, end);
            }
            case 30: { /* split */
                const char *sep = (argCount > 1 && args[1].type == TLL_STRING) ? args[1].as.string : "";
                TLLValue arr = tll_array();
                if (strlen(sep) == 0) {
                    for (int i = 0; i < slen; i++) array_push(arr.as.array, tll_string_n(s+i, 1));
                } else {
                    int seplen = (int)strlen(sep);
                    const char *p = s;
                    while (1) {
                        const char *found = strstr(p, sep);
                        if (!found) { array_push(arr.as.array, tll_string(p)); break; }
                        array_push(arr.as.array, tll_string_n(p, (int)(found - p)));
                        p = found + seplen;
                    }
                }
                return arr;
            }
            case 31: { /* join */
                TLLValue arr = (argCount > 0 && args[0].type == TLL_ARRAY) ? args[0] : tll_array();
                const char *sep = (argCount > 1 && args[1].type == TLL_STRING) ? args[1].as.string : "";
                char *result = strdup("");
                for (int i = 0; i < arr.as.array->length; i++) {
                    if (i > 0) { char *t = result; result = strcat(strdup(result), sep); free(t); }
                    char *elem = tll_to_string(arr.as.array->items[i]);
                    char *t = result;
                    result = (char*)malloc(strlen(result) + strlen(elem) + 1);
                    strcpy(result, t); strcat(result, elem);
                    free(t); free(elem);
                }
                TLLValue r = tll_string(result);
                free(result);
                return r;
            }
            case 32: return tll_bool(strstr(s, (argCount>1)?args[1].as.string:"") != NULL); /* contains */
            case 33: { /* startsWith */
                const char *p = (argCount>1)?args[1].as.string:"";
                return tll_bool(strncmp(s, p, strlen(p)) == 0);
            }
            case 34: { /* endsWith */
                const char *p = (argCount>1)?args[1].as.string:"";
                int plen = (int)strlen(p);
                return tll_bool(slen >= plen && strcmp(s + slen - plen, p) == 0);
            }
            case 35: { /* substring */
                int start = (argCount>1 && args[1].type==TLL_INT)?(int)args[1].as.integer:0;
                int end = (argCount>2 && args[2].type==TLL_INT)?(int)args[2].as.integer:slen;
                return tll_string(str_sub(s, start, end));
            }
            case 36: { /* replace */
                const char *from = (argCount>1)?args[1].as.string:"";
                const char *to = (argCount>2)?args[2].as.string:"";
                /* Replace first occurrence */
                const char *found = strstr(s, from);
                if (!found) return tll_string(s);
                int pos = (int)(found - s);
                char *r = (char*)malloc(pos + strlen(to) + strlen(found + strlen(from)) + 1);
                memcpy(r, s, pos);
                strcpy(r + pos, to);
                strcat(r, found + strlen(from));
                TLLValue result = tll_string(r);
                free(r);
                return result;
            }
            case 37: { /* replaceAll */
                const char *from = (argCount>1)?args[1].as.string:"";
                const char *to = (argCount>2)?args[2].as.string:"";
                if (strlen(from) == 0) return tll_string(s);
                char *result = strdup("");
                const char *p = s;
                while (1) {
                    const char *found = strstr(p, from);
                    if (!found) { char *t=result; result=strcat(strdup(result),p); free(t); break; }
                    int pos = (int)(found - p);
                    char *tmp = (char*)malloc(strlen(result) + pos + strlen(to) + 1);
                    strcpy(tmp, result);
                    strncat(tmp, p, pos);
                    strcat(tmp, to);
                    free(result); result = tmp;
                    p = found + strlen(from);
                }
                TLLValue r = tll_string(result);
                free(result);
                return r;
            }
            case 38: { /* repeat */
                int n = (argCount>1)?(int)args[1].as.integer:0;
                char *r = strdup("");
                for (int i = 0; i < n; i++) { char *t=r; r=strcat(strdup(r),s); free(t); }
                TLLValue result = tll_string(r); free(r); return result;
            }
            case 39: { /* padStart */
                int len = (argCount>1)?(int)args[1].as.integer:slen;
                const char *pad = (argCount>2)?args[2].as.string:" ";
                if (slen >= len) return tll_string(s);
                int padlen = len - slen;
                char *r = (char*)malloc(len + 1);
                int padcharlen = (int)strlen(pad);
                for (int i = 0; i < padlen; i++) r[i] = pad[i % padcharlen];
                strcpy(r + padlen, s);
                TLLValue result = tll_string(r); free(r); return result;
            }
            case 40: { /* padEnd */
                int len = (argCount>1)?(int)args[1].as.integer:slen;
                const char *pad = (argCount>2)?args[2].as.string:" ";
                if (slen >= len) return tll_string(s);
                char *r = (char*)malloc(len + 1);
                strcpy(r, s);
                int padcharlen = (int)strlen(pad);
                for (int i = slen; i < len; i++) r[i] = pad[(i-slen) % padcharlen];
                r[len] = '\0';
                TLLValue result = tll_string(r); free(r); return result;
            }
            case 41: { /* charAt */
                int i = (argCount>1)?(int)args[1].as.integer:0;
                if (i < 0 || i >= slen) return tll_string("");
                return tll_string_n(s + i, 1);
            }
            case 42: { /* charCodeAt */
                int i = (argCount>1)?(int)args[1].as.integer:0;
                if (i < 0 || i >= slen) return tll_int(0);
                return tll_int((unsigned char)s[i]);
            }
            case 43: { /* indexOf */
                const char *sub = (argCount>1)?args[1].as.string:"";
                const char *found = strstr(s, sub);
                return tll_int(found ? (int)(found - s) : -1);
            }
            case 44: { /* lastIndexOf */
                const char *sub = (argCount>1)?args[1].as.string:"";
                int sublen = (int)strlen(sub);
                if (sublen == 0) return tll_int(slen);
                for (int i = slen - sublen; i >= 0; i--) {
                    if (strncmp(s + i, sub, sublen) == 0) return tll_int(i);
                }
                return tll_int(-1);
            }
            case 45: return tll_bool(slen == 0); /* isEmpty */
            case 46: { /* reverse */
                char *r = strdup(s);
                for (int i = 0, j = slen-1; i < j; i++, j--) { char t=r[i]; r[i]=r[j]; r[j]=t; }
                TLLValue result = tll_string(r); free(r); return result;
            }
            case 47: { /* lines */
                TLLValue arr = tll_array();
                const char *p = s;
                while (*p) {
                    const char *nl = strchr(p, '\n');
                    if (!nl) { array_push(arr.as.array, tll_string(p)); break; }
                    int len = (int)(nl - p);
                    if (len > 0 && p[len-1] == '\r') len--;
                    array_push(arr.as.array, tll_string_n(p, len));
                    p = nl + 1;
                }
                return arr;
            }
            case 48: { /* words */
                TLLValue arr = tll_array();
                const char *p = s;
                while (*p) {
                    while (*p && isspace((unsigned char)*p)) p++;
                    if (!*p) break;
                    const char *start = p;
                    while (*p && !isspace((unsigned char)*p)) p++;
                    array_push(arr.as.array, tll_string_n(start, (int)(p - start)));
                }
                return arr;
            }
        }
    }

    /* arrays (49-71) */
    if (idx >= 49 && idx <= 71) {
        TLLArray *arr = (argCount > 0 && args[0].type == TLL_ARRAY) ? args[0].as.array : NULL;
        switch (idx) {
            case 49: return tll_int(arr ? arr->length : 0); /* length */
            case 50: { /* get */
                int i = (argCount>1)?(int)args[1].as.integer:0;
                return arr ? array_get(arr, i) : tll_null();
            }
            case 51: { /* push */
                if (arr) { for (int i = 1; i < argCount; i++) array_push(arr, args[i]); }
                return args[0];
            }
            case 52: { /* pop */
                if (!arr || arr->length == 0) return tll_null();
                return arr->items[--arr->length];
            }
            case 53: { /* shift */
                if (!arr || arr->length == 0) return tll_null();
                TLLValue v = arr->items[0];
                memmove(arr->items, arr->items + 1, (arr->length - 1) * sizeof(TLLValue));
                arr->length--;
                return v;
            }
            case 54: { /* unshift */
                if (arr) {
                    int n = argCount - 1;
                    while (arr->length + n > arr->capacity) { arr->capacity *= 2; arr->items = realloc(arr->items, arr->capacity * sizeof(TLLValue)); }
                    memmove(arr->items + n, arr->items, arr->length * sizeof(TLLValue));
                    for (int i = 0; i < n; i++) arr->items[i] = args[n - i];
                    arr->length += n;
                }
                return args[0];
            }
            case 55: { /* concat */
                TLLValue result = tll_array();
                if (arr) for (int i = 0; i < arr->length; i++) array_push(result.as.array, arr->items[i]);
                if (argCount > 1 && args[1].type == TLL_ARRAY) {
                    TLLArray *a2 = args[1].as.array;
                    for (int i = 0; i < a2->length; i++) array_push(result.as.array, a2->items[i]);
                }
                return result;
            }
            case 56: { /* slice */
                int start = (argCount>1)?(int)args[1].as.integer:0;
                int end = (argCount>2)?(int)args[2].as.integer:(arr?arr->length:0);
                TLLValue result = tll_array();
                if (arr) {
                    if (start < 0) start += arr->length;
                    if (end < 0) end += arr->length;
                    for (int i = start; i < end && i < arr->length; i++) array_push(result.as.array, arr->items[i]);
                }
                return result;
            }
            case 57: { /* includes */
                if (!arr) return tll_bool(0);
                for (int i = 0; i < arr->length; i++) if (tll_equals(arr->items[i], args[1])) return tll_bool(1);
                return tll_bool(0);
            }
            case 58: { /* indexOf */
                if (!arr) return tll_int(-1);
                for (int i = 0; i < arr->length; i++) if (tll_equals(arr->items[i], args[1])) return tll_int(i);
                return tll_int(-1);
            }
            case 59: { /* join */
                const char *sep = (argCount>1)?args[1].as.string:",";
                char *result = strdup("");
                if (arr) {
                    for (int i = 0; i < arr->length; i++) {
                        if (i > 0) { char *t=result; result=strcat(strdup(result),sep); free(t); }
                        char *elem = tll_to_string(arr->items[i]);
                        char *t = result;
                        result = malloc(strlen(result)+strlen(elem)+1);
                        strcpy(result,t); strcat(result,elem);
                        free(t); free(elem);
                    }
                }
                TLLValue r = tll_string(result); free(result); return r;
            }
            case 60: { /* reverse */
                if (arr) for (int i=0,j=arr->length-1; i<j; i++,j--) { TLLValue t=arr->items[i]; arr->items[i]=arr->items[j]; arr->items[j]=t; }
                return args[0];
            }
            case 61: /* sort - simple bubble sort */
                if (arr) {
                    for (int i = 0; i < arr->length-1; i++)
                        for (int j = 0; j < arr->length-1-i; j++) {
                            double a = (arr->items[j].type==TLL_INT)?(double)arr->items[j].as.integer:arr->items[j].as.floating;
                            double b = (arr->items[j+1].type==TLL_INT)?(double)arr->items[j+1].as.integer:arr->items[j+1].as.floating;
                            if (a > b) { TLLValue t=arr->items[j]; arr->items[j]=arr->items[j+1]; arr->items[j+1]=t; }
                        }
                }
                return args[0];
            case 62: /* filter - requires function call, simplified */
            case 63: /* map */
            case 64: /* reduce */
            case 65: /* forEach */
            case 66: /* find */
            case 67: /* some */
            case 68: /* every */
                /* Higher-order functions require callback support - return array as-is for bootstrap */
                return args[0];
            case 69: { /* flat */
                TLLValue result = tll_array();
                int depth = (argCount>1)?(int)args[1].as.integer:1;
                if (arr) {
                    for (int i = 0; i < arr->length; i++) {
                        if (depth > 0 && arr->items[i].type == TLL_ARRAY) {
                            TLLArray *inner = arr->items[i].as.array;
                            for (int j = 0; j < inner->length; j++) array_push(result.as.array, inner->items[j]);
                        } else {
                            array_push(result.as.array, arr->items[i]);
                        }
                    }
                }
                return result;
            }
            case 70: { /* fill */
                TLLValue val = (argCount>1)?args[1]:tll_null();
                int start = (argCount>2)?(int)args[2].as.integer:0;
                int end = (argCount>3)?(int)args[3].as.integer:(arr?arr->length:0);
                if (arr) for (int i = start; i < end && i < arr->length; i++) arr->items[i] = val;
                return args[0];
            }
            case 71: { /* range */
                int start = (argCount>0)?(int)args[0].as.integer:0;
                int end = (argCount>1)?(int)args[1].as.integer:0;
                int step = (argCount>2)?(int)args[2].as.integer:1;
                TLLValue result = tll_array();
                if (step > 0) { for (int i = start; i < end; i += step) array_push(result.as.array, tll_int(i)); }
                else if (step < 0) { for (int i = start; i > end; i += step) array_push(result.as.array, tll_int(i)); }
                return result;
            }
        }
    }

    /* convert (72-78) */
    if (idx >= 72 && idx <= 78) {
        TLLValue v = argCount > 0 ? args[0] : tll_null();
        switch (idx) {
            case 72: { /* toInt */
                if (v.type == TLL_INT) return v;
                if (v.type == TLL_FLOAT) return tll_int((long long)v.as.floating);
                if (v.type == TLL_STRING) return tll_int(atoll(v.as.string));
                if (v.type == TLL_BOOL) return tll_int(v.as.boolean ? 1 : 0);
                return tll_int(0);
            }
            case 73: { /* toFloat */
                if (v.type == TLL_FLOAT) return v;
                if (v.type == TLL_INT) return tll_float((double)v.as.integer);
                if (v.type == TLL_STRING) return tll_float(atof(v.as.string));
                if (v.type == TLL_BOOL) return tll_float(v.as.boolean ? 1.0 : 0.0);
                return tll_float(0.0);
            }
            case 74: { /* toString */
                char *s = tll_to_string(v);
                TLLValue r = tll_string(s);
                free(s);
                return r;
            }
            case 75: /* toBool */
                return tll_bool(tll_truthy(v));
            case 76: { /* toChar */
                int c = (v.type==TLL_INT)?(int)v.as.integer:0;
                char buf[2] = {(char)c, 0};
                return tll_string(buf);
            }
            case 77: { /* charCode */
                if (v.type == TLL_STRING && strlen(v.as.string) > 0) return tll_int((unsigned char)v.as.string[0]);
                return tll_int(0);
            }
            case 78: { /* typeOf */
                switch (v.type) {
                    case TLL_NULL: return tll_string("null");
                    case TLL_BOOL: return tll_string("bool");
                    case TLL_INT: return tll_string("int");
                    case TLL_FLOAT: return tll_string("float");
                    case TLL_STRING: return tll_string("string");
                    case TLL_ARRAY: return tll_string("array");
                    case TLL_MAP: return tll_string("map");
                    case TLL_FUNCTION: return tll_string("function");
                    case TLL_BUILTIN: return tll_string("builtin");
                    default: return tll_string("unknown");
                }
            }
        }
    }

    /* fs (79-90) */
    if (idx >= 79 && idx <= 90) {
        const char *path = (argCount > 0 && args[0].type == TLL_STRING) ? args[0].as.string : "";
        switch (idx) {
            case 79: { /* readFile */
                FILE *f = fopen(path, "rb");
                if (!f) return tll_string("");
                fseek(f, 0, SEEK_END);
                long sz = ftell(f);
                fseek(f, 0, SEEK_SET);
                char *buf = (char*)malloc(sz + 1);
                fread(buf, 1, sz, f);
                buf[sz] = '\0';
                fclose(f);
                TLLValue r = tll_string(buf);
                free(buf);
                return r;
            }
            case 80: { /* writeFile */
                const char *content = (argCount>1)?args[1].as.string:"";
                FILE *f = fopen(path, "wb");
                if (f) { fputs(content, f); fclose(f); }
                return tll_null();
            }
            case 81: { /* appendFile */
                const char *content = (argCount>1)?args[1].as.string:"";
                FILE *f = fopen(path, "ab");
                if (f) { fputs(content, f); fclose(f); }
                return tll_null();
            }
            case 82: { /* exists */
                struct stat st;
                return tll_bool(stat(path, &st) == 0);
            }
            case 83: /* mkdir */
#ifdef _WIN32
                mkdir(path);
#else
                mkdir(path, 0755);
#endif
                return tll_null();
            case 84: /* remove */
                remove(path);
                return tll_null();
            case 85: { /* listDir */
                TLLValue arr = tll_array();
#ifdef _WIN32
                WIN32_FIND_DATAA fd;
                char pattern[4096];
                snprintf(pattern, sizeof(pattern), "%s\\*", path);
                HANDLE h = FindFirstFileA(pattern, &fd);
                if (h != INVALID_HANDLE_VALUE) {
                    do {
                        if (strcmp(fd.cFileName, ".") != 0 && strcmp(fd.cFileName, "..") != 0)
                            array_push(arr.as.array, tll_string(fd.cFileName));
                    } while (FindNextFileA(h, &fd));
                    FindClose(h);
                }
#else
                DIR *d = opendir(path);
                if (d) {
                    struct dirent *e;
                    while ((e = readdir(d))) {
                        if (strcmp(e->d_name, ".") != 0 && strcmp(e->d_name, "..") != 0)
                            array_push(arr.as.array, tll_string(e->d_name));
                    }
                    closedir(d);
                }
#endif
                return arr;
            }
            case 86: { /* isFile */
                struct stat st;
                return tll_bool(stat(path, &st) == 0 && S_ISREG(st.st_mode));
            }
            case 87: { /* isDir */
                struct stat st;
                return tll_bool(stat(path, &st) == 0 && S_ISDIR(st.st_mode));
            }
            case 88: { /* fileSize */
                struct stat st;
                if (stat(path, &st) == 0) return tll_int(st.st_size);
                return tll_int(0);
            }
            case 89: { /* copyFile */
                const char *dst = (argCount>1)?args[1].as.string:"";
                FILE *src = fopen(path, "rb");
                if (!src) return tll_null();
                FILE *out = fopen(dst, "wb");
                if (!out) { fclose(src); return tll_null(); }
                char buf[4096]; size_t n;
                while ((n = fread(buf, 1, sizeof(buf), src)) > 0) fwrite(buf, 1, n, out);
                fclose(src); fclose(out);
                return tll_null();
            }
            case 90: { /* rename */
                const char *dst = (argCount>1)?args[1].as.string:"";
                rename(path, dst);
                return tll_null();
            }
        }
    }

    /* http (91-97) - simplified for bootstrap */
    if (idx >= 91 && idx <= 97) {
        fprintf(stderr, "tllvm: http builtin %d not available in bootstrap mode\n", idx);
        return tll_null();
    }

    /* agent/workflow (98-119) - deferred */
    if (idx >= 98 && idx <= 119) {
        fprintf(stderr, "tllvm: agent/workflow builtin %d not available\n", idx);
        return tll_null();
    }

    fprintf(stderr, "tllvm: unknown builtin index %d\n", idx);
    return tll_null();
}
