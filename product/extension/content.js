const BUTTON_ID = 'atlas-enrich-btn';
const STATUS_ID = 'atlas-enrich-status';

const injectButton = () => {
  if (document.getElementById(BUTTON_ID)) return;

  const btn = document.createElement('button');
  btn.id = BUTTON_ID;
  btn.textContent = 'Atlas Enrich';
  Object.assign(btn.style, {
    position: 'fixed',
    bottom: '18px',
    right: '18px',
    zIndex: 99999,
    padding: '10px 14px',
    borderRadius: '10px',
    border: 'none',
    background: 'linear-gradient(120deg, #60a5fa, #22d3ee)',
    color: '#0b1021',
    fontWeight: '700',
    boxShadow: '0 10px 30px rgba(34, 211, 238, 0.3)',
    cursor: 'pointer',
    fontSize: '14px',
  });

  const status = document.createElement('div');
  status.id = STATUS_ID;
  status.textContent = '';
  Object.assign(status.style, {
    position: 'fixed',
    bottom: '56px',
    right: '18px',
    zIndex: 99998,
    padding: '8px 12px',
    borderRadius: '10px',
    background: '#0b1021',
    color: '#cbd5f5',
    fontSize: '12px',
    maxWidth: '280px',
    display: 'none',
    boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
  });

  btn.addEventListener('click', async () => {
    status.style.display = 'block';
    status.textContent = 'Gathering context...';

    const selection = window.getSelection()?.toString() || '';
    const bodyText = document.body?.innerText || '';
    const snippet = bodyText.slice(0, 8000);

    chrome.runtime.sendMessage(
      {
        type: 'atlas-run-enrichment',
        payload: {
          url: window.location.href,
          title: document.title,
          selection: selection.slice(0, 2000),
          snippet,
        },
      },
      (resp) => {
        if (chrome.runtime.lastError) {
          status.textContent = `Extension error: ${chrome.runtime.lastError.message}`;
          return;
        }
        if (!resp) {
          status.textContent = 'No response from background.';
          return;
        }
        status.textContent = resp.ok ? 'Running enrichment...' : `Failed: ${resp.error || 'unknown error'}`;
      }
    );
  });

  document.body.appendChild(btn);
  document.body.appendChild(status);
};

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'atlas-status') {
    const status = document.getElementById(STATUS_ID);
    if (status) {
      status.style.display = 'block';
      status.textContent = msg.message || '';
    }
  }
  if (msg?.type === 'atlas-done') {
    const status = document.getElementById(STATUS_ID);
    if (status) {
      status.style.display = 'block';
      status.textContent = msg.ok ? 'Enrichment complete. Refreshing...' : `Failed: ${msg.error || ''}`;
    }
    if (msg.ok) {
      setTimeout(() => {
        window.location.reload();
      }, 1200);
    }
  }
});

injectButton();
