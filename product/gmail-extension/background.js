const DEFAULT_CONFIG = {
  pipelineUrl: "http://localhost:8099",
  trackingBaseUrl: "http://localhost:8099",
  trackingToken: "",
  userEmail: "",
  trackSends: true,
  trackReceives: true,
  trackClicks: true,
};

function loadConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_CONFIG, (items) => resolve(items));
  });
}

async function postEvent(event) {
  const config = await loadConfig();
  if (!config.trackSends && event.event_type === "sent") {
    return { ok: true, skipped: true };
  }
  if (!config.trackReceives && event.event_type === "received") {
    return { ok: true, skipped: true };
  }
  const baseUrl = (config.pipelineUrl || "").replace(/\/$/, "");
  if (!baseUrl) {
    return { ok: false, error: "Missing pipeline URL" };
  }

  const headers = { "Content-Type": "application/json" };
  if (config.trackingToken) {
    headers["X-SF-Tracking-Token"] = config.trackingToken;
  }

  const response = await fetch(`${baseUrl}/email/event`, {
    method: "POST",
    headers,
    body: JSON.stringify(event),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Pipeline error ${response.status}: ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return { ok: true };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) {
    return;
  }

  if (message.type === "sf-get-config") {
    loadConfig().then((config) => sendResponse({ ok: true, config }));
    return true;
  }

  if (message.type === "sf-send-event") {
    postEvent(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});
