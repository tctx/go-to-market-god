const DEFAULTS = {
  runnerUrl: 'http://localhost:5050/run',
  openaiBaseUrl: 'https://api.openai.com/v1/chat/completions',
  model: 'gpt-4o-mini',
};

async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      ['openaiKey', 'hubspotToken', 'runnerUrl', 'openaiBaseUrl', 'model'],
      (data) => {
        resolve({
          openaiKey: data.openaiKey || '',
          hubspotToken: data.hubspotToken || '',
          runnerUrl: data.runnerUrl || DEFAULTS.runnerUrl,
          openaiBaseUrl: data.openaiBaseUrl || DEFAULTS.openaiBaseUrl,
          model: data.model || DEFAULTS.model,
        });
      }
    );
  });
}

async function setDefaultConfig() {
  const existing = await getConfig();
  if (!existing.runnerUrl) {
    chrome.storage.sync.set(DEFAULTS);
  }
}

async function loadMegaPrompt() {
  // Try runner first (keeps prompt out of the packaged extension), then fall back to bundled file.
  const config = await getConfig();
  const runnerPromptUrl = config.runnerUrl?.replace(/\/run$/, '/prompt');

  if (runnerPromptUrl) {
    try {
      const res = await fetch(runnerPromptUrl);
      if (res.ok) return await res.text();
    } catch (_) {
      // fall through to bundled prompt
    }
  }

  try {
    const url = chrome.runtime.getURL('mega-prompt.md');
    const res = await fetch(url);
    if (!res.ok) throw new Error('Mega prompt not found in extension. Copy mega-prompt.md into /product/extension before loading.');
    return await res.text();
  } catch (e) {
    throw new Error(e.message || 'Failed to load mega prompt');
  }
}

const extractCodeBlock = (text) => {
  const match = text.match(/```(?:javascript|js)?\\n([\\s\\S]*?)```/i);
  if (match && match[1]) return match[1].trim();
  return text.trim();
};

async function callOpenAI({ prompt, context, model, openaiKey, openaiBaseUrl }) {
  if (!openaiKey) throw new Error('OpenAI key not set. Add it in the extension options.');

  const messages = [
    {
      role: 'system',
      content:
        'You are a HubSpot enrichment agent. Return ONLY the JavaScript code that enriches the current HubSpot record using the provided mega prompt and page context. Do not include prose.',
    },
    {
      role: 'user',
      content: `${prompt}\n\n---\n\nPage Context:\n${JSON.stringify(context, null, 2)}`,
    },
  ];

  const res = await fetch(openaiBaseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      response_format: { type: 'text' },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${text.slice(0, 400)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || '';
  if (!content) throw new Error('Empty response from OpenAI');
  return extractCodeBlock(content);
}

async function runScriptViaRunner({ code, runnerUrl, hubspotToken }) {
  const res = await fetch(runnerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, token: hubspotToken || undefined }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Runner error ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.error || 'Runner reported failure');
  }
  return data;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'atlas-run-enrichment') return;

  (async () => {
    const tabId = sender?.tab?.id;
    const { payload } = msg;
    const config = await getConfig();

    if (tabId) chrome.tabs.sendMessage(tabId, { type: 'atlas-status', message: 'Loading mega prompt...' });
    let megaPrompt;
    try {
      megaPrompt = await loadMegaPrompt();
    } catch (e) {
      if (tabId) chrome.tabs.sendMessage(tabId, { type: 'atlas-done', ok: false, error: e.message });
      sendResponse({ ok: false, error: e.message });
      return;
    }

    if (tabId) chrome.tabs.sendMessage(tabId, { type: 'atlas-status', message: 'Calling OpenAI...' });
    let code;
    try {
      code = await callOpenAI({
        prompt: megaPrompt,
        context: payload,
        model: config.model,
        openaiKey: config.openaiKey,
        openaiBaseUrl: config.openaiBaseUrl,
      });
    } catch (e) {
      if (tabId) chrome.tabs.sendMessage(tabId, { type: 'atlas-done', ok: false, error: e.message });
      sendResponse({ ok: false, error: e.message });
      return;
    }

    if (tabId) chrome.tabs.sendMessage(tabId, { type: 'atlas-status', message: 'Executing script via runner...' });
    try {
      await runScriptViaRunner({
        code,
        runnerUrl: config.runnerUrl,
        hubspotToken: config.hubspotToken,
      });
      if (tabId) chrome.tabs.sendMessage(tabId, { type: 'atlas-done', ok: true });
      sendResponse({ ok: true });
    } catch (e) {
      if (tabId) chrome.tabs.sendMessage(tabId, { type: 'atlas-done', ok: false, error: e.message });
      sendResponse({ ok: false, error: e.message });
    }
  })();

  return true; // keep sendResponse alive
});

setDefaultConfig();
