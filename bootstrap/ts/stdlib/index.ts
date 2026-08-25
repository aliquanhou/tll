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
  get: (arr: any, index: any) => Array.isArray(arr) ? arr[Number(index)] : undefined,
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

// ─── http ──────────────────────────────────────────────────────────────────
const { execSync } = require('child_process');

function shellEscape(str: string): string {
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

function tryParseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const http: StdLibModule = {
  get: (url: any) => {
    try {
      const result = execSync(`curl -s --max-time 10 ${shellEscape(String(url))}`, {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
      });
      return tryParseJson(result);
    } catch (e: any) {
      throw new Error('http.get error: ' + e.message);
    }
  },
  getText: (url: any) => {
    try {
      return execSync(`curl -s --max-time 10 ${shellEscape(String(url))}`, {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (e: any) {
      throw new Error('http.getText error: ' + e.message);
    }
  },
  post: (url: any, body: any) => {
    try {
      const bodyStr = body !== undefined && body !== null ? String(body) : '';
      const result = execSync(
        `curl -s --max-time 10 -X POST -d ${shellEscape(bodyStr)} ${shellEscape(String(url))}`,
        { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
      );
      return tryParseJson(result);
    } catch (e: any) {
      throw new Error('http.post error: ' + e.message);
    }
  },
  postJson: (url: any, data: any) => {
    try {
      const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);
      const result = execSync(
        `curl -s --max-time 10 -X POST -H 'Content-Type: application/json' -d ${shellEscape(jsonStr)} ${shellEscape(String(url))}`,
        { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
      );
      return tryParseJson(result);
    } catch (e: any) {
      throw new Error('http.postJson error: ' + e.message);
    }
  },
  request: (method: any, url: any, body: any, headers: any) => {
    try {
      let cmd = `curl -s --max-time 10 -X ${shellEscape(String(method).toUpperCase())}`;
      if (headers && typeof headers === 'object') {
        for (const [k, v] of Object.entries(headers)) {
          cmd += ` -H ${shellEscape(`${k}: ${v}`)}`;
        }
      }
      if (body !== undefined && body !== null && body !== '') {
        cmd += ` -d ${shellEscape(String(body))}`;
      }
      cmd += ` ${shellEscape(String(url))}`;
      const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
      return tryParseJson(result);
    } catch (e: any) {
      throw new Error('http.request error: ' + e.message);
    }
  },
  getStatus: (url: any) => {
    try {
      const result = execSync(
        `curl -s -o /dev/null -w '%{http_code}' --max-time 10 ${shellEscape(String(url))}`,
        { encoding: 'utf8' }
      );
      return parseInt(result.trim(), 10) || 0;
    } catch (e: any) {
      throw new Error('http.getStatus error: ' + e.message);
    }
  },
  download: (url: any, destPath: any) => {
    try {
      execSync(
        `curl -s --max-time 30 -o ${shellEscape(String(destPath))} ${shellEscape(String(url))}`,
        { encoding: 'utf8' }
      );
      return null;
    } catch (e: any) {
      throw new Error('http.download error: ' + e.message);
    }
  },
};

// ─── agent (AI / LLM) ──────────────────────────────────────────────────────
let agentApiKey = process.env.OPENAI_API_KEY || process.env.TLL_AI_API_KEY || '';
let agentBaseUrl = process.env.OPENAI_BASE_URL || process.env.TLL_AI_BASE_URL || 'https://api.openai.com/v1';
let agentDefaultModel = process.env.TLL_AI_MODEL || 'gpt-4o-mini';

// Memory store for agent conversations
const agentMemory: Map<string, string> = new Map();

function callLLM(messages: any[], model?: string): string {
  if (!agentApiKey) {
    throw new Error('agent: no API key set. Use agent.setApiKey(key) or set OPENAI_API_KEY env var.');
  }
  const useModel = model || agentDefaultModel;
  const url = `${agentBaseUrl.replace(/\/$/, '')}/chat/completions`;
  const body = JSON.stringify({
    model: useModel,
    messages: messages,
    temperature: 0.7,
  });
  const tmpFile = `/tmp/tll_agent_${Date.now()}_${Math.random().toString(36).slice(2)}.json`;
  try {
    require('fs').writeFileSync(tmpFile, body);
    const cmd = `curl -s --max-time 60 -X POST ${shellEscape(url)} ` +
      `-H "Content-Type: application/json" ` +
      `-H "Authorization: Bearer ${agentApiKey}" ` +
      `-d @${tmpFile}`;
    const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    const parsed = JSON.parse(result);
    if (parsed.error) {
      throw new Error(`LLM API error: ${parsed.error.message || JSON.stringify(parsed.error)}`);
    }
    if (parsed.choices && parsed.choices.length > 0) {
      return parsed.choices[0].message?.content || '';
    }
    throw new Error('LLM API returned no choices: ' + result.slice(0, 500));
  } catch (e: any) {
    if (e.message && e.message.startsWith('LLM')) throw e;
    throw new Error('agent API call error: ' + e.message);
  } finally {
    try { require('fs').unlinkSync(tmpFile); } catch {}
  }
}

// Call LLM with tools, returns the full message object (may include tool_calls)
function callLLMWithTools(messages: any[], tools: any[], model?: string): any {
  if (!agentApiKey) {
    throw new Error('agent: no API key set. Use agent.setApiKey(key) or set OPENAI_API_KEY env var.');
  }
  const useModel = model || agentDefaultModel;
  const url = `${agentBaseUrl.replace(/\/$/, '')}/chat/completions`;
  const body = JSON.stringify({
    model: useModel,
    messages: messages,
    tools: tools,
    tool_choice: 'auto',
    temperature: 0.7,
  });
  const tmpFile = `/tmp/tll_agent_tools_${Date.now()}_${Math.random().toString(36).slice(2)}.json`;
  try {
    require('fs').writeFileSync(tmpFile, body);
    const cmd = `curl -s --max-time 60 -X POST ${shellEscape(url)} ` +
      `-H "Content-Type: application/json" ` +
      `-H "Authorization: Bearer ${agentApiKey}" ` +
      `-d @${tmpFile}`;
    const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    const parsed = JSON.parse(result);
    if (parsed.error) {
      throw new Error(`LLM API error: ${parsed.error.message || JSON.stringify(parsed.error)}`);
    }
    if (parsed.choices && parsed.choices.length > 0) {
      return parsed.choices[0].message;
    }
    throw new Error('LLM API returned no choices: ' + result.slice(0, 500));
  } catch (e: any) {
    if (e.message && e.message.startsWith('LLM')) throw e;
    throw new Error('agent API call error: ' + e.message);
  } finally {
    try { require('fs').unlinkSync(tmpFile); } catch {}
  }
}

// Generate simple tool description from tool name (param names are arg0, arg1, ...)
function buildToolSchema(toolName: string, paramCount: number): any {
  const properties: Record<string, any> = {};
  const required: string[] = [];
  for (let i = 0; i < paramCount; i++) {
    const pname = `arg${i}`;
    properties[pname] = { type: 'string', description: `Argument ${i}` };
    required.push(pname);
  }
  return {
    type: 'function',
    function: {
      name: toolName,
      description: `Tool function: ${toolName}`,
      parameters: {
        type: 'object',
        properties: properties,
        required: required,
      },
    },
  };
}

const agent: StdLibModule = {
  run: (systemPrompt: any, userPrompt: any, model?: any) => {
    const messages = [
      { role: 'system', content: String(systemPrompt || '') },
      { role: 'user', content: String(userPrompt || '') },
    ];
    return callLLM(messages, model ? String(model) : undefined);
  },
  chat: (messages: any, model?: any) => {
    if (!Array.isArray(messages)) {
      throw new Error('agent.chat: messages must be an array of {role, content}');
    }
    return callLLM(messages, model ? String(model) : undefined);
  },
  setApiKey: (key: any) => {
    agentApiKey = String(key || '');
    return null;
  },
  setBaseUrl: (url: any) => {
    agentBaseUrl = String(url || '');
    return null;
  },
  setModel: (model: any) => {
    agentDefaultModel = String(model || '');
    return null;
  },
  getModel: () => agentDefaultModel,
  runWithTools: (systemPrompt: any, userPrompt: any, toolNames: any, model?: any) => {
    const runtime = (globalThis as any).__tll_runtime;
    if (!runtime) {
      throw new Error('agent.runWithTools: runtime not available');
    }
    if (!Array.isArray(toolNames)) {
      throw new Error('agent.runWithTools: toolNames must be an array');
    }

    // Build tool schemas by looking up param count from runtime
    const tools: any[] = [];
    const toolParamCounts: Record<string, number> = {};
    for (const name of toolNames) {
      const toolName = String(name);
      // Find function in runtime to get param count
      let paramCount = 1;
      try {
        const fns = runtime.program.functions;
        for (const fn of fns) {
          if (fn.name === toolName) {
            paramCount = fn.paramCount;
            break;
          }
        }
      } catch {}
      toolParamCounts[toolName] = paramCount;
      tools.push(buildToolSchema(toolName, paramCount));
    }

    // Build messages
    const messages: any[] = [
      { role: 'system', content: String(systemPrompt || '') },
      { role: 'user', content: String(userPrompt || '') },
    ];

    // Tool calling loop (max 10 iterations)
    const maxIterations = 10;
    for (let iter = 0; iter < maxIterations; iter++) {
      const responseMsg = callLLMWithTools(messages, tools, model ? String(model) : undefined);

      // If no tool_calls, this is the final answer
      if (!responseMsg.tool_calls || responseMsg.tool_calls.length === 0) {
        return responseMsg.content || '';
      }

      // Add assistant message with tool_calls
      messages.push(responseMsg);

      // Execute each tool call
      for (const toolCall of responseMsg.tool_calls) {
        const fnName = toolCall.function?.name;
        let fnArgs: any = {};
        try {
          fnArgs = JSON.parse(toolCall.function?.arguments || '{}');
        } catch {
          fnArgs = {};
        }

        // Convert args object to ordered array
        const paramCount = toolParamCounts[fnName] || 1;
        const args: any[] = [];
        for (let i = 0; i < paramCount; i++) {
          const val = fnArgs[`arg${i}`];
          args.push(val !== undefined ? String(val) : '');
        }

        // Call the TLL user function
        let result: any;
        try {
          result = runtime.callUserFunction(fnName, args);
        } catch (e: any) {
          result = `Error: ${e.message}`;
        }

        // Add tool result message
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result !== null && result !== undefined ? String(result) : '',
        });
      }
    }

    // Max iterations reached, return last assistant content if available
    const lastMsg = messages[messages.length - 1];
    return lastMsg?.content || '[Tool calling limit reached]';
  },
  // ─── Memory functions ───
  saveMemory: (key: any, value: any) => {
    agentMemory.set(String(key), String(value));
    return null;
  },
  loadMemory: (key: any) => {
    const val = agentMemory.get(String(key));
    return val !== undefined ? val : null;
  },
  hasMemory: (key: any) => {
    return agentMemory.has(String(key));
  },
  clearMemory: (key: any) => {
    agentMemory.delete(String(key));
    return null;
  },
  clearAllMemory: () => {
    agentMemory.clear();
    return null;
  },
  listMemory: () => {
    return Array.from(agentMemory.keys());
  },
  getMemoryCount: () => {
    return agentMemory.size;
  },
};

// ─── workflow (state machine) ──────────────────────────────────────────────
interface WorkflowTransition {
  from: string;
  to: string;
  event?: string;
  action?: string;
}

interface WorkflowDefinition {
  states: string[];
  initial: string;
  transitions: WorkflowTransition[];
}

interface WorkflowInstance {
  name: string;
  currentState: string;
  history: string[];
}

const workflowDefinitions: Map<string, WorkflowDefinition> = new Map();
const workflowInstances: Map<number, WorkflowInstance> = new Map();
let workflowInstanceIdCounter = 0;

const workflow: StdLibModule = {
  define: (name: any, config: any) => {
    const wfName = String(name);
    if (!config || typeof config !== 'object') {
      throw new Error('workflow.define: config must be an object with states, initial, transitions');
    }
    const states = Array.isArray(config.states) ? config.states.map(String) : [];
    const initial = String(config.initial || (states.length > 0 ? states[0] : ''));
    const transitions: WorkflowTransition[] = [];
    if (Array.isArray(config.transitions)) {
      for (const t of config.transitions) {
        if (t && typeof t === 'object') {
          transitions.push({
            from: String(t.from || ''),
            to: String(t.to || ''),
            event: t.event !== undefined ? String(t.event) : undefined,
            action: t.action !== undefined ? String(t.action) : undefined,
          });
        }
      }
    }
    workflowDefinitions.set(wfName, { states, initial, transitions });
    return null;
  },
  start: (name: any) => {
    const wfName = String(name);
    const def = workflowDefinitions.get(wfName);
    if (!def) {
      throw new Error(`workflow.start: workflow '${wfName}' not defined. Use workflow.define() first.`);
    }
    const id = ++workflowInstanceIdCounter;
    workflowInstances.set(id, {
      name: wfName,
      currentState: def.initial,
      history: [def.initial],
    });
    return id;
  },
  getState: (instanceId: any) => {
    const id = Number(instanceId);
    const inst = workflowInstances.get(id);
    if (!inst) {
      throw new Error(`workflow.getState: instance ${id} not found`);
    }
    return inst.currentState;
  },
  transition: (instanceId: any, event: any) => {
    const id = Number(instanceId);
    const eventName = String(event);
    const inst = workflowInstances.get(id);
    if (!inst) {
      throw new Error(`workflow.transition: instance ${id} not found`);
    }
    const def = workflowDefinitions.get(inst.name);
    if (!def) {
      throw new Error(`workflow.transition: workflow '${inst.name}' not defined`);
    }
    // Find matching transition: match by event name, or by target state name
    for (const t of def.transitions) {
      const matchesFrom = t.from === inst.currentState;
      const matchesEvent = t.event !== undefined && t.event === eventName;
      const matchesTo = t.to === eventName;
      if (matchesFrom && (matchesEvent || matchesTo)) {
        inst.currentState = t.to;
        inst.history.push(t.to);
        return t.to;
      }
    }
    throw new Error(`workflow.transition: no valid transition from '${inst.currentState}' for event '${eventName}'`);
  },
  canTransition: (instanceId: any, event: any) => {
    const id = Number(instanceId);
    const eventName = String(event);
    const inst = workflowInstances.get(id);
    if (!inst) return false;
    const def = workflowDefinitions.get(inst.name);
    if (!def) return false;
    for (const t of def.transitions) {
      const matchesFrom = t.from === inst.currentState;
      const matchesEvent = t.event !== undefined && t.event === eventName;
      const matchesTo = t.to === eventName;
      if (matchesFrom && (matchesEvent || matchesTo)) return true;
    }
    return false;
  },
  list: () => {
    return Array.from(workflowDefinitions.keys());
  },
  getHistory: (instanceId: any) => {
    const id = Number(instanceId);
    const inst = workflowInstances.get(id);
    if (!inst) return [];
    return inst.history;
  },
  getStates: (name: any) => {
    const wfName = String(name);
    const def = workflowDefinitions.get(wfName);
    if (!def) return [];
    return def.states;
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
  http,
  agent,
  workflow,
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
