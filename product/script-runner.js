#!/usr/bin/env node
// Local web UI to paste Atlas-generated JS and run it against HubSpot.
// Usage: node product/script-runner.js (then open http://localhost:5050)

const fs = require('fs');
const http = require('http');
const path = require('path');
const vm = require('vm');

const megaPromptPath = path.join(__dirname, '..', 'mega-prompt.md');
const LOCAL_HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN || '';
const PORT = Number(process.env.PORT || 5050);
const TIMEOUT_MS = Number(process.env.RUN_TIMEOUT_MS || 45000);
const htmlPath = path.join(__dirname, 'script-runner.html');
const indexHtml = fs.readFileSync(htmlPath, 'utf8');

const withCors = (headers = {}) => ({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  ...headers,
});

const send = (res, statusCode, headers, body) => {
  res.writeHead(statusCode, withCors(headers));
  res.end(body);
};

const sendJson = (res, statusCode, payload) => {
  send(res, statusCode, { 'Content-Type': 'application/json' }, JSON.stringify(payload));
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 2 * 1024 * 1024) reject(new Error('Request too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });

const serializeArg = (arg) => {
  try {
    if (typeof arg === 'string') return arg;
    if (arg instanceof Error) return arg.stack || arg.message;
    return JSON.stringify(arg, null, 2);
  } catch (_) {
    return String(arg);
  }
};

const pickToken = (provided) => {
  if (provided && typeof provided === 'string' && provided.trim()) {
    return { token: provided.trim(), source: 'request' };
  }
  if (process.env.HUBSPOT_TOKEN && process.env.HUBSPOT_TOKEN.trim()) {
    return { token: process.env.HUBSPOT_TOKEN.trim(), source: 'env' };
  }
  if (LOCAL_HUBSPOT_TOKEN && LOCAL_HUBSPOT_TOKEN.trim()) {
    return { token: LOCAL_HUBSPOT_TOKEN.trim(), source: 'local' };
  }
  return { token: '', source: 'none' };
};

const replaceToken = (code, token) => {
  if (!token) return { source: code, replaced: false, injected: false };
  const declarationPattern = /\b(?:const|let|var)\s+HUBSPOT_TOKEN\s*=\s*[^;]*;/m;
  if (declarationPattern.test(code)) {
    return {
      source: code.replace(declarationPattern, `const HUBSPOT_TOKEN = '${token}';`),
      replaced: true,
      injected: false,
    };
  }
  return { source: `const HUBSPOT_TOKEN = '${token}';\n${code}`, replaced: false, injected: true };
};

async function runUserCode(source, token) {
  const logs = [];
  const consoleShim = {};

  ['log', 'info', 'warn', 'error'].forEach((level) => {
    consoleShim[level] = (...args) => {
      const message = args.map(serializeArg).join(' ');
      logs.push({ level, message, ts: new Date().toISOString() });
      console[level](...args);
    };
  });

  const sandbox = {
    console: consoleShim,
    fetch,
    setTimeout,
    clearTimeout,
    URL,
    TextEncoder,
    TextDecoder,
    Buffer,
    process: { env: { HUBSPOT_TOKEN: token || '' } },
  };

  const context = vm.createContext(sandbox);
  const script = new vm.Script(source, { filename: 'user-script.js' });
  const execution = (async () => {
    const result = script.runInContext(context);
    if (result && typeof result.then === 'function') await result;
  })();

  let timeoutHandle;
  try {
    await Promise.race([
      execution,
      new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(`Timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS);
      }),
    ]);
    return { ok: true, logs };
  } catch (error) {
    logs.push({ level: 'error', message: serializeArg(error), ts: new Date().toISOString() });
    return { ok: false, logs, error: error.message || 'Execution failed' };
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url.startsWith('/health')) {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'GET' && req.url === '/prompt') {
    try {
      const prompt = fs.readFileSync(megaPromptPath, 'utf8');
      return send(res, 200, { 'Content-Type': 'text/plain; charset=utf-8' }, prompt);
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: `Failed to read mega-prompt.md: ${error.message}` });
    }
  }

  if (req.method === 'GET' && req.url.startsWith('/')) {
    return send(res, 200, { 'Content-Type': 'text/html; charset=utf-8' }, indexHtml);
  }

  if (req.method === 'OPTIONS') {
    return send(res, 200, { 'Content-Type': 'text/plain' }, '');
  }

  if (req.method === 'POST' && req.url === '/run') {
    try {
      const body = await readBody(req);
      const parsed = JSON.parse(body || '{}');
      const { code, token } = parsed;

      if (!code || typeof code !== 'string') {
        return sendJson(res, 400, { ok: false, error: 'Missing code' });
      }

      const { token: effectiveToken, source: tokenSource } = pickToken(token);
      const { source, replaced, injected } = replaceToken(code, effectiveToken);
      const result = await runUserCode(source, effectiveToken);
      return sendJson(res, 200, {
        ...result,
        tokenInjected: Boolean(effectiveToken),
        tokenReplaced: replaced,
        tokenInjectedAtTop: injected,
        tokenSource,
      });
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: error.message || 'Server error' });
    }
  }

  return sendJson(res, 404, { ok: false, error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`HubSpot script runner listening on http://localhost:${PORT}`);
  console.log('Paste your generated JS into the UI and click Run.');
});
