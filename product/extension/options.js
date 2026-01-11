const fields = ['openaiKey', 'hubspotToken', 'runnerUrl', 'openaiBaseUrl', 'model'];

function load() {
  chrome.storage.sync.get(fields, (data) => {
    fields.forEach((key) => {
      const el = document.getElementById(key);
      if (el) el.value = data[key] || '';
    });
  });
}

function save() {
  const payload = {};
  fields.forEach((key) => {
    const el = document.getElementById(key);
    if (el) payload[key] = el.value.trim();
  });
  chrome.storage.sync.set(payload, () => {
    const status = document.getElementById('status');
    status.textContent = 'Saved';
    setTimeout(() => (status.textContent = ''), 1200);
  });
}

document.getElementById('save').addEventListener('click', save);
document.addEventListener('DOMContentLoaded', load);
