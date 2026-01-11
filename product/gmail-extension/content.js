const COMPOSE_SELECTOR = 'div[role="dialog"]';
const BODY_SELECTOR = 'div[aria-label="Message Body"]';
const SUBJECT_SELECTOR = 'input[name="subjectbox"]';

let configCache = null;
let configPromise = null;
let receiveScanTimer = null;
const seenReceivedKeys = new Set();
const trackedComposes = new WeakSet();

function requestConfig() {
  if (configPromise) return configPromise;
  configPromise = new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "sf-get-config" }, (resp) => {
      configCache = resp && resp.ok ? resp.config : null;
      resolve(configCache);
      configPromise = null;
    });
  });
  return configPromise;
}

async function getConfig() {
  if (configCache) return configCache;
  return requestConfig();
}

function inferUserEmail() {
  const label = document.querySelector('a[aria-label*="@"]')?.getAttribute('aria-label') || "";
  const match = label.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (match) return match[0];
  const title = document.querySelector('img[alt*="@"]')?.getAttribute('alt') || "";
  const match2 = title.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match2 ? match2[0] : "";
}

function parseEmails(text) {
  if (!text) return [];
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  return matches ? matches.map((e) => e.trim()) : [];
}

function normalizeEmail(email) {
  return (email || "").trim().toLowerCase();
}

function uniqueEmails(emails) {
  const seen = new Set();
  const out = [];
  emails.forEach((email) => {
    const normalized = normalizeEmail(email);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    out.push(normalized);
  });
  return out;
}

function collectEmailsFromCompose(compose) {
  const to = [];
  const cc = [];
  const bcc = [];

  const inputs = compose.querySelectorAll('textarea[name="to"], textarea[name="cc"], textarea[name="bcc"]');
  inputs.forEach((input) => {
    const emails = parseEmails(input.value || "");
    if (input.name === "cc") cc.push(...emails);
    else if (input.name === "bcc") bcc.push(...emails);
    else to.push(...emails);
  });

  const chips = compose.querySelectorAll('span[email]');
  chips.forEach((chip) => {
    const email = chip.getAttribute('email');
    if (!email) return;
    const bucket = chip.closest('[aria-label="Cc"]') ? cc
      : chip.closest('[aria-label="Bcc"]') ? bcc
      : to;
    bucket.push(email);
  });

  return {
    to: uniqueEmails(to),
    cc: uniqueEmails(cc),
    bcc: uniqueEmails(bcc),
  };
}

function findSendButton(compose) {
  return compose.querySelector('div[role="button"][data-tooltip*="Send"], div[role="button"][aria-label^="Send"]');
}

function buildPixelHtml(trackingBaseUrl, tid, email) {
  const base = trackingBaseUrl.replace(/\/$/, "");
  const ts = Date.now();
  const params = [`tid=${encodeURIComponent(tid)}`, `ts=${ts}`];
  if (email) params.push(`e=${encodeURIComponent(email)}`);
  const src = `${base}/email/pixel.gif?${params.join("&")}`;
  return `<img data-sf-pixel="1" src="${src}" width="1" height="1" style="display:none !important;" />`;
}

function wrapLinks(body, trackingBaseUrl, tid, email) {
  const base = trackingBaseUrl.replace(/\/$/, "");
  const links = body.querySelectorAll('a[href]');
  links.forEach((link) => {
    const href = link.getAttribute('href');
    if (!href || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    if (href.includes('/email/redirect')) return;
    const params = [`tid=${encodeURIComponent(tid)}`, `url=${encodeURIComponent(href)}`];
    if (email) params.push(`e=${encodeURIComponent(email)}`);
    const redirect = `${base}/email/redirect?${params.join("&")}`;
    link.setAttribute('href', redirect);
  });
}

function injectTracking(body, config, recipient, tid) {
  if (body.querySelector('img[data-sf-pixel="1"]')) {
    return;
  }
  if (!config.trackingBaseUrl) {
    return;
  }
  const pixelHtml = buildPixelHtml(config.trackingBaseUrl, tid, recipient);
  body.insertAdjacentHTML('beforeend', pixelHtml);
  if (config.trackClicks) {
    wrapLinks(body, config.trackingBaseUrl, tid, recipient);
  }
}

function sendEvent(payload) {
  chrome.runtime.sendMessage({ type: "sf-send-event", payload }, () => {});
}

async function handleSend(compose) {
  const config = await getConfig();
  if (!config || config.trackSends === false) return;

  const subject = compose.querySelector(SUBJECT_SELECTOR)?.value?.trim() || "";
  const { to, cc, bcc } = collectEmailsFromCompose(compose);
  const recipients = uniqueEmails([...to, ...cc, ...bcc]);
  if (!recipients.length) return;

  const body = compose.querySelector(BODY_SELECTOR);
  if (!body) return;

  const tid = crypto.randomUUID();
  const pixelRecipient = to[0] || cc[0] || bcc[0] || null;
  injectTracking(body, config, pixelRecipient, tid);

  const userEmail = (config.userEmail || inferUserEmail()).trim();
  sendEvent({
    event_type: "sent",
    direction: "outbound",
    tid,
    from_email: userEmail || null,
    to_emails: to,
    cc_emails: cc,
    bcc_emails: bcc,
    subject,
    user_email: userEmail || null,
    occurred_at: new Date().toISOString(),
    metadata: {
      source: "gmail_extension",
      url: window.location.href,
    },
  });
}

function attachCompose(compose) {
  if (trackedComposes.has(compose)) return;
  const button = findSendButton(compose);
  if (!button) return;

  trackedComposes.add(compose);
  button.addEventListener('click', () => {
    if (compose.dataset.sfSent === '1') return;
    compose.dataset.sfSent = '1';
    setTimeout(() => handleSend(compose), 0);
  });
}

function scanComposes() {
  document.querySelectorAll(COMPOSE_SELECTOR).forEach(attachCompose);
}

async function scanThreadView() {
  const config = await getConfig();
  if (!config || config.trackReceives === false) return;

  const main = document.querySelector('div[role="main"]');
  if (!main) return;

  const threadId = main.querySelector('[data-legacy-thread-id]')?.getAttribute('data-legacy-thread-id') || "";
  const messages = main.querySelectorAll('div[role="listitem"]');
  if (!messages.length) return;

  const lastMessage = messages[messages.length - 1];
  const fromEl = lastMessage.querySelector('span[email]');
  const fromEmail = fromEl?.getAttribute('email') || parseEmails(fromEl?.textContent || "")[0];
  if (!fromEmail) return;

  const userEmail = (config.userEmail || inferUserEmail()).trim();
  if (normalizeEmail(fromEmail) === normalizeEmail(userEmail)) return;

  const subject = document.querySelector('h2.hP')?.textContent?.trim() || "";
  const messageId = lastMessage.getAttribute('data-legacy-message-id') || "";
  const key = `${threadId}:${messageId || fromEmail}:${subject}`;
  if (seenReceivedKeys.has(key)) return;
  seenReceivedKeys.add(key);

  sendEvent({
    event_type: "received",
    direction: "inbound",
    tid: threadId || crypto.randomUUID(),
    from_email: fromEmail,
    to_emails: userEmail ? [userEmail] : [],
    thread_id: threadId || null,
    message_id: messageId || null,
    subject,
    user_email: userEmail || null,
    occurred_at: new Date().toISOString(),
    metadata: {
      source: "gmail_extension",
      url: window.location.href,
    },
  });
}

function scheduleThreadScan() {
  if (receiveScanTimer) return;
  receiveScanTimer = setTimeout(() => {
    receiveScanTimer = null;
    scanThreadView();
  }, 800);
}

const observer = new MutationObserver(() => {
  scanComposes();
  scheduleThreadScan();
});

observer.observe(document.body, { childList: true, subtree: true });
scanComposes();
