const DEFAULT_CONFIG = {
  pipelineUrl: "http://localhost:8099",
  trackingBaseUrl: "http://localhost:8099",
  trackingToken: "",
  userEmail: "",
  trackSends: true,
  trackReceives: true,
  trackClicks: true,
};

const fields = [
  "pipelineUrl",
  "trackingBaseUrl",
  "trackingToken",
  "userEmail",
  "trackSends",
  "trackReceives",
  "trackClicks",
];

function loadSettings() {
  chrome.storage.sync.get(DEFAULT_CONFIG, (items) => {
    fields.forEach((field) => {
      const el = document.getElementById(field);
      if (!el) return;
      if (el.type === "checkbox") {
        el.checked = Boolean(items[field]);
      } else {
        el.value = items[field] || "";
      }
    });
  });
}

function saveSettings() {
  const payload = {};
  fields.forEach((field) => {
    const el = document.getElementById(field);
    if (!el) return;
    payload[field] = el.type === "checkbox" ? el.checked : el.value.trim();
  });

  chrome.storage.sync.set(payload, () => {
    const status = document.getElementById("status");
    if (status) {
      status.textContent = "Settings saved.";
      setTimeout(() => {
        status.textContent = "";
      }, 1500);
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadSettings();
  document.getElementById("save").addEventListener("click", saveSettings);
});
