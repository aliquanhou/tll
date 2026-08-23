/**
 * TLL Standard Library - Bootstrap Implementation (TypeScript)
 *
 * All standard library functions are registered here and exposed to TLL
 * programs via the LOAD_BUILTIN opcode. Each function receives already-
 * evaluated JS values and returns a JS value that the VM can use.
 *
 * Modules: io, json, math, strings, arrays, convert
 */

export type StdLibFn = (...args: any[]) => any;

export interface StdLibModule {
  [fnName: string]: StdLibFn;
}

// ─── io ───────────────────────────────────────────────────────────────────
const io: StdLibModule = {
  println: (...args: any[]) => {
    const text = args.length > 0 ? stringify(args[0]) : '';
    console.log(text);
    return null;
  },
  print: (...args: any[]) => {
    const text = args.length > 0 ? stringify(args[0]) : '';
    process.stdout.write(text);
    return null;
  },
  readLine: (...args: any[]) => {
    const prompt = args.length > 0 ? stringify(args[0]) : '';
    // Synchronous read via node:readline (best-effort for bootstrap)
    try {
      const fs = require('fs');
      if (prompt) process.stdout.write(prompt);
      const buf = Buffer.alloc(1024);
      const fd = fs.openSync(0, 'rs');
      const bytes = fs.readSync(fd, buf, 0, 1024, null);
      fs.closeSync(fd);
      return buf.toString('utf8', 0, bytes).replace(/\r?\n$/, '');
    } catch {
      return '';
    }
  },
};

// ─── json ─────────────────────────────────────────────────────────────────
const json: StdLibModule = {
  parse: (text: any) => {
    try {
      return JSON.parse(String(text));
    } catch (e: any) {
      throw new Error('JSON parse error: ' + e.message);
    }
  },
  stringify: (value: any, indent?: any) => {
    if (indent !== undefined && indent !== null) {
      return JSON.stringify(value, null, Number(indent));
    }
    return JSON.stringify(value);
  },
};

// ─── math ─────────────────────────────────────────────────────────────────
const math: StdLibModule = {
  sqrt: (x: any) => Math.sqrt(Number(x)),
  abs: (x: any) => Math.abs(Number(x)),
  floor: (x: any) => Math.floor(Number(x)),
  ceil: (x: any) => Math.ceil(Number(x)),
  round: (x: any) => Math.round(Number(x)),
  min: (a: any, b: any) => Math.min(Number(a), Number(b)),
  max: (a: any, b: any) => Math.max(Number(a), Number(b)),
  pow: (base: any, exp: any) => Math.pow(Number(base), Number(exp)),
  sin: (x: any) => Math.sin(Number(x)),
  cos: (x: any) => Math.cos(Number(x)),
  tan: (x: any) => Math.tan(Number(x)),
  log: (x: any) => Math.log(Number(x)),
  log2: (x: any) => Math.log2(Number(x)),
  log10: (x: any) => Math.log10(Number(x)),
  exp: (x: any) => Math.exp(Number(x)),
  pi: () => Math.PI,
  e: () => Math.E,
  random: () => Math.random(),
  randomInt: (min: any, max: any) => {
    const lo = Math.ceil(Number(min));
    const hi = Math.floor(Number(max));
    return Math.floor(Math.random() * (hi - lo + 1)) + lo;
  },
};

// ─── strings ──────────────────────────────────────────────────────────────
const strings: StdLibModule = {
  length: (s: any) => String(s).length,
  toUpper: (s: any) => String(s).toUpperCase(),
  toLower: (s: any) => String(s).toLowerCase(),
  trim: (s: any) => String(s).trim(),
  trimStart: (s: any) => String(s).trimStart(),
  trimEnd: (s: any) => String(s).trimEnd(),
  split: (s: any, sep: any) => String(s).split(String(sep)),
  join: (arr: any, sep: any) => {
    if (Array.isArray(arr)) return arr.map(stringify).join(String(sep));
    return String(arr);
  },
  contains: (s: any, sub: any) => String(s).includes(String(sub)),
  startsWith: (s: any, prefix: any) => String(s).startsWith(String(prefix)),
  endsWith: (s: any, suffix: any) => String(s).endsWith(String(suffix)),
  substring: (s: any, start: any, end?: any) => {
    const str = String(s);
    if (end !== undefined && end !== null) return str.substring(Number(start), Number(end));
    return str.substring(Number(start));
  },
  replace: (s: any, from: any, to: any) => String(s).replace(String(from), String(to)),
  replaceAll: (s: any, from: any, to: any) => String(s).split(String(from)).join(String(to)),
  repeat: (s: any, count: any) => String(s).repeat(Number(count)),
  padStart: (s: any, len: any, pad?: any) => String(s).padStart(Number(len), pad !== undefined ? String(pad) : ' '),
  padEnd: (s: any, len: any, pad?: any) => String(s).padEnd(Number(len), pad !== undefined ? String(pad) : ' '),
  charAt: (s: any, index: any) => String(s).charAt(Number(index)),
  charCodeAt: (s: any, index: any) => String(s).charCodeAt(Number(index)),
  indexOf: (s: any, sub: any) => String(s).indexOf(String(sub)),
  lastIndexOf: (s: any, sub: any) => String(s).lastIndexOf(String(sub)),
  isEmpty: (s: any) => String(s).length === 0,
  reverse: (s: any) => String(s).split('').reverse().join(''),
  lines: (s: any) => String(s).split(/\r?\n/),
  words: (s: any) => String(s).trim().split(/\s+/),
};

// ─── arrays ───────────────────────────────────────────────────────────────
const arrays: StdLibModule = {
  length: (arr: any) => Array.isArray(arr) ? arr.length : 0,
  push: (arr: any, ...items: any[]) => {
    if (Array.isArray(arr)) {
      for (const item of items) arr.push(item);
    }
    return arr;
  },
  pop: (arr: any) => Array.isArray(arr) ? arr.pop() : undefined,
  shift: (arr: any) => Array.isArray(arr) ? arr.shift() : undefined,
  unshift: (arr: any, ...items: any[]) => {
    if (Array.isArray(arr)) {
      for (const item of items.reverse()) arr.unshift(item);
    }
    return arr;
  },
  concat: (a: any, b: any) => {
    const arr1 = Array.isArray(a) ? a : [a];
    const arr2 = Array.isArray(b) ? b : [b];
    return arr1.concat(arr2);
  },
  slice: (arr: any, start: any, end?: any) => {
    if (!Array.isArray(arr)) return [];
    if (end !== undefined && end !== null) return arr.slice(Number(start), Number(end));
    return arr.slice(Number(start));
  },
  includes: (arr: any, item: any) => Array.isArray(arr) && arr.includes(item),
  indexOf: (arr: any, item: any) => Array.isArray(arr) ? arr.indexOf(item) : -1,
  join: (arr: any, sep: any) => Array.isArray(arr) ? arr.map(stringify).join(String(sep)) : '',
  reverse: (arr: any) => Array.isArray(arr) ? [...arr].reverse() : arr,
  sort: (arr: any) => {
    if (!Array.isArray(arr)) return arr;
    return [...arr].sort((a, b) => {
      if (typeof a === 'number' && typeof b === 'number') return a - b;
      return String(a).localeCompare(String(b));
    });
  },
  filter: (arr: any, fn: any) => {
    if (!Array.isArray(arr) || typeof fn !== 'function') return arr;
    return arr.filter((v, i) => fn(v, i));
  },
  map: (arr: any, fn: any) => {
    if (!Array.isArray(arr) || typeof fn !== 'function') return arr;
    return arr.map((v, i) => fn(v, i));
  },
  reduce: (arr: any, fn: any, init?: any) => {
    if (!Array.isArray(arr) || typeof fn !== 'function') return init;
    if (init !== undefined) return arr.reduce((acc, v, i) => fn(acc, v, i), init);
    return arr.reduce((acc, v, i) => fn(acc, v, i));
  },
  forEach: (arr: any, fn: any) => {
    if (Array.isArray(arr) && typeof fn === 'function') {
      arr.forEach((v, i) => fn(v, i));
    }
    return null;
  },
  find: (arr: any, fn: any) => {
    if (!Array.isArray(arr) || typeof fn !== 'function') return undefined;
    return arr.find((v, i) => fn(v, i));
  },
  some: (arr: any, fn: any) => {
    if (!Array.isArray(arr) || typeof fn !== 'function') return false;
    return arr.some((v, i) => fn(v, i));
  },
  every: (arr: any, fn: any) => {
    if (!Array.isArray(arr) || typeof fn !== 'function') return true;
    return arr.every((v, i) => fn(v, i));
  },
  flat: (arr: any, depth?: any) => {
    if (!Array.isArray(arr)) return arr;
    const d = depth !== undefined ? Number(depth) : 1;
    return arr.flat(d);
  },
  fill: (arr: any, value: any, start?: any, end?: any) => {
    if (!Array.isArray(arr)) return arr;
    const s = start !== undefined ? Number(start) : 0;
    const e = end !== undefined ? Number(end) : arr.length;
    return arr.fill(value, s, e);
  },
  range: (start: any, end: any, step?: any) => {
    const s = Number(start);
    const e = Number(end);
    const st = step !== undefined ? Number(step) : 1;
    const result: number[] = [];
    if (st > 0) {
      for (let i = s; i < e; i += st) result.push(i);
    } else if (st < 0) {
      for (let i = s; i > e; i += st) result.push(i);
    }
    return result;
  },
};

// ─── convert ──────────────────────────────────────────────────────────────
const convert: StdLibModule = {
  toInt: (value: any) => {
    const n = parseInt(String(value), 10);
    return isNaN(n) ? 0 : n;
  },
  toFloat: (value: any) => {
    const n = parseFloat(String(value));
    return isNaN(n) ? 0.0 : n;
  },
  toString: (value: any) => stringify(value),
  toBool: (value: any) => Boolean(value),
  toChar: (code: any) => String.fromCharCode(Number(code)),
  charCode: (ch: any) => String(ch).charCodeAt(0),
  typeOf: (value: any) => {
    if (value === null || value === undefined) return 'null';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    return typeof value;
  },
};

// ─── fs ────────────────────────────────────────────────────────────────────
const nodeFs = require('fs');
const nodePath = require('path');

const fs: StdLibModule = {
  readFile: (filePath: any) => {
    try {
      return nodeFs.readFileSync(String(filePath), 'utf8');
    } catch (e: any) {
      throw new Error('fs.readFile error: ' + e.message);
    }
  },
  writeFile: (filePath: any, content: any) => {
    try {
      const dir = nodePath.dirname(String(filePath));
      if (dir && dir !== '.' && !nodeFs.existsSync(dir)) {
        nodeFs.mkdirSync(dir, { recursive: true });
      }
      nodeFs.writeFileSync(String(filePath), String(content), 'utf8');
      return null;
    } catch (e: any) {
      throw new Error('fs.writeFile error: ' + e.message);
    }
  },
  appendFile: (filePath: any, content: any) => {
    try {
      nodeFs.appendFileSync(String(filePath), String(content), 'utf8');
      return null;
    } catch (e: any) {
      throw new Error('fs.appendFile error: ' + e.message);
    }
  },
  exists: (filePath: any) => {
    return nodeFs.existsSync(String(filePath));
  },
  mkdir: (dirPath: any) => {
    try {
      nodeFs.mkdirSync(String(dirPath), { recursive: true });
      return null;
    } catch (e: any) {
      throw new Error('fs.mkdir error: ' + e.message);
    }
  },
  remove: (targetPath: any) => {
    try {
      const p = String(targetPath);
      if (nodeFs.existsSync(p)) {
        const stat = nodeFs.statSync(p);
        if (stat.isDirectory()) {
          nodeFs.rmSync(p, { recursive: true, force: true });
        } else {
          nodeFs.unlinkSync(p);
        }
      }
      return null;
    } catch (e: any) {
      throw new Error('fs.remove error: ' + e.message);
    }
  },
  listDir: (dirPath: any) => {
    try {
      return nodeFs.readdirSync(String(dirPath));
    } catch (e: any) {
      throw new Error('fs.listDir error: ' + e.message);
    }
  },
  isFile: (filePath: any) => {
    try {
      return nodeFs.statSync(String(filePath)).isFile();
    } catch {
      return false;
    }
  },
  isDir: (dirPath: any) => {
    try {
      return nodeFs.statSync(String(dirPath)).isDirectory();
    } catch {
      return false;
    }
  },
  fileSize: (filePath: any) => {
    try {
      return nodeFs.statSync(String(filePath)).size;
    } catch (e: any) {
      throw new Error('fs.fileSize error: ' + e.message);
    }
  },
  copyFile: (src: any, dest: any) => {
    try {
      nodeFs.copyFileSync(String(src), String(dest));
      return null;
    } catch (e: any) {
      throw new Error('fs.copyFile error: ' + e.message);
    }
  },
  rename: (oldPath: any, newPath: any) => {
    try {
      nodeFs.renameSync(String(oldPath), String(newPath));
      return null;
    } catch (e: any) {
      throw new Error('fs.rename error: ' + e.message);
    }
  },
};

// ─── Module Registry ───────────────────────────────────────────────────────
export const stdlibModules: Record<string, StdLibModule> = {
  io,
  json,
  math,
  strings,
  arrays,
  convert,
  fs,
};

/**
 * Flat registry: "module.function" -> function
 * Used by the compiler to resolve builtin calls and by the runtime's
 * LOAD_BUILTIN opcode via builtinFunctions[].
 */
export const builtinFunctions: StdLibFn[] = [];
export const builtinIndex: Map<string, number> = new Map();

for (const [modName, mod] of Object.entries(stdlibModules)) {
  for (const [fnName, fn] of Object.entries(mod)) {
    const key = `${modName}.${fnName}`;
    builtinIndex.set(key, builtinFunctions.length);
    builtinFunctions.push(fn);
  }
}

/** Look up a builtin by "module.function" key. Returns -1 if not found. */
export function getBuiltinIndex(moduleName: string, fnName: string): number {
  const idx = builtinIndex.get(`${moduleName}.${fnName}`);
  return idx !== undefined ? idx : -1;
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function stringify(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return '[' + value.map(v => stringify(v)).join(', ') + ']';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
