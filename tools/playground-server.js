// TLL Playground Backend API
// POST /run -> { code: string } -> { output: string, ok: boolean }
const http = require('http');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 3000;
const TLL_CLI = '/opt/tll/tll-compiler/dist/src/cli.js';
const MAX_CODE_LENGTH = 10000;
const TIMEOUT_MS = 10000;

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function runTLL(code) {
  return new Promise((resolve) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tll-playground-'));
    const tmpFile = path.join(tmpDir, 'playground.tll');

    try {
      fs.writeFileSync(tmpFile, code, 'utf8');
    } catch (e) {
      cleanup(tmpDir);
      resolve({ output: 'Error: Failed to write temporary file\n' + e.message, ok: false });
      return;
    }

    execFile('node', [TLL_CLI, 'run', tmpFile], {
      timeout: TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
      cwd: tmpDir,
      env: { ...process.env, PATH: process.env.PATH }
    }, (error, stdout, stderr) => {
      cleanup(tmpDir);
      let output = '';
      let ok = true;

      if (stdout) output += stdout;
      if (stderr) output += stderr;

      if (error) {
        ok = false;
        if (error.killed) {
          output += '\n[Execution timed out after ' + (TIMEOUT_MS / 1000) + ' seconds]';
        } else if (error.code && !stdout && !stderr) {
          output += '\n[Process exited with code ' + error.code + ']';
        }
      }

      if (!output) output = '(no output)';
      resolve({ output, ok });
    });
  });
}

function cleanup(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    // ignore
  }
}

function sendJSON(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  // Health check
  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    sendJSON(res, 200, { status: 'ok', service: 'tll-playground', version: '0.1.0' });
    return;
  }

  // Run endpoint
  if (req.method === 'POST' && req.url === '/run') {
    try {
      const body = await parseBody(req);
      let payload;
      try {
        payload = JSON.parse(body);
      } catch (e) {
        sendJSON(res, 400, { output: 'Error: Invalid JSON\n' + e.message, ok: false });
        return;
      }

      if (!payload.code || typeof payload.code !== 'string') {
        sendJSON(res, 400, { output: 'Error: Missing or invalid "code" field', ok: false });
        return;
      }

      if (payload.code.length > MAX_CODE_LENGTH) {
        sendJSON(res, 400, { output: 'Error: Code too long (max ' + MAX_CODE_LENGTH + ' characters)', ok: false });
        return;
      }

      const result = await runTLL(payload.code);
      sendJSON(res, 200, result);
    } catch (e) {
      sendJSON(res, 500, { output: 'Server error: ' + e.message, ok: false });
    }
    return;
  }

  sendJSON(res, 404, { output: 'Not found', ok: false });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('TLL Playground API listening on http://127.0.0.1:' + PORT);
  console.log('TLL CLI: ' + TLL_CLI);
});
