const tokenKey = "sf_hubspot_token";
const oauthKey = "sf_hubspot_oauth";
const scriptKey = "sf_last_script";

const el = (id) => document.getElementById(id);

const tokenInput = el("tokenInput");
const oauthConnect = el("oauthConnect");
const oauthRefresh = el("oauthRefresh");
const oauthStatus = el("oauthStatus");
const oauthRedirect = el("oauthRedirect");
const oauthConfigHint = el("oauthConfigHint");
const toggleToken = el("toggleToken");
const saveToken = el("saveToken");
const tokenStatus = el("tokenStatus");
const pingHubSpot = el("pingHubSpot");
const pingOutput = el("pingOutput");
const includeContacts = el("includeContacts");
const includeCompanies = el("includeCompanies");
const initProperties = el("initProperties");
const initOutput = el("initOutput");
const initStatus = el("initStatus");
const scriptInput = el("scriptInput");
const scriptFile = el("scriptFile");
const runScript = el("runScript");
const runOutput = el("runOutput");
const runStatus = el("runStatus");
const clearLogs = el("clearLogs");
const healthCheck = el("healthCheck");
const healthStatus = el("healthStatus");
const loadSample = el("loadSample");

const postJson = async (path, payload) => {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data && data.error ? data.error : "Request failed";
    throw new Error(message);
  }
  return data;
};

const getJson = async (path) => {
  const res = await fetch(path);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data && data.error ? data.error : "Request failed";
    throw new Error(message);
  }
  return data;
};

const setStatus = (node, text, state) => {
  node.textContent = text;
  if (state) {
    node.dataset.state = state;
  } else {
    node.removeAttribute("data-state");
  }
};

const setOutput = (node, text) => {
  node.textContent = text || "";
};

const tokenFromStorage = () => localStorage.getItem(tokenKey) || "";

const oauthFromStorage = () => {
  const raw = localStorage.getItem(oauthKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
};

const updateTokenUI = () => {
  const token = tokenFromStorage();
  const oauth = oauthFromStorage();
  const label = oauth && oauth.access_token ? "OAuth" : token ? "Saved" : "Not saved";
  tokenStatus.textContent = label;
  tokenStatus.dataset.state = token || (oauth && oauth.access_token) ? "ok" : "idle";
  if (!tokenInput.value && token) tokenInput.value = token;
};

const updateOAuthUI = () => {
  const oauth = oauthFromStorage();
  if (!oauth || !oauth.access_token) {
    setStatus(oauthStatus, "OAuth idle", "idle");
    oauthRefresh.disabled = true;
    return;
  }
  const issuedAt = oauth.issued_at || Date.now();
  const expiresIn = Number(oauth.expires_in || 0);
  const expiresAt = issuedAt + expiresIn * 1000;
  const msLeft = expiresAt - Date.now();
  const minutesLeft = Math.max(0, Math.round(msLeft / 60000));
  const state = msLeft > 0 ? "ok" : "error";
  const label = msLeft > 0 ? `Connected (${minutesLeft}m left)` : "Expired";
  setStatus(oauthStatus, label, state);
  oauthRefresh.disabled = !oauth.refresh_token;
};

const storeOAuth = (payload) => {
  const next = {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_in: payload.expires_in,
    token_type: payload.token_type,
    issued_at: Date.now(),
  };
  localStorage.setItem(oauthKey, JSON.stringify(next));
  if (payload.access_token) {
    localStorage.setItem(tokenKey, payload.access_token);
    tokenInput.value = payload.access_token;
  }
  updateTokenUI();
  updateOAuthUI();
};

const saveTokenToStorage = () => {
  const token = tokenInput.value.trim();
  if (token) {
    localStorage.setItem(tokenKey, token);
    localStorage.removeItem(oauthKey);
  } else {
    localStorage.removeItem(tokenKey);
  }
  updateTokenUI();
  updateOAuthUI();
};

const renderInitResults = (payload) => {
  initOutput.innerHTML = "";
  if (!payload || !payload.results) {
    initOutput.textContent = "No results.";
    return;
  }

  const buildSection = (label, result) => {
    const section = document.createElement("div");
    section.className = "result-section";

    const title = document.createElement("div");
    title.className = "result-title";
    title.textContent = `${label}: created ${result.created}, exists ${result.exists}, failed ${result.failed}`;
    section.appendChild(title);

    const list = document.createElement("ul");
    list.className = "result-list";
    result.results.forEach((item) => {
      const row = document.createElement("li");
      const msg = item.error ? ` - ${item.error}` : "";
      row.textContent = `${item.name}: ${item.status}${msg}`;
      row.dataset.state = item.status;
      list.appendChild(row);
    });
    section.appendChild(list);
    initOutput.appendChild(section);
  };

  if (payload.results.contacts) buildSection("Contacts", payload.results.contacts);
  if (payload.results.companies) buildSection("Companies", payload.results.companies);
};

const renderRunLogs = (payload) => {
  runOutput.innerHTML = "";
  if (!payload || !payload.logs) {
    runOutput.textContent = "No logs.";
    return;
  }
  payload.logs.forEach((log) => {
    const line = document.createElement("div");
    line.className = `log-line log-${log.level}`;
    line.textContent = `[${log.level}] ${log.message}`;
    runOutput.appendChild(line);
  });
};

saveToken.addEventListener("click", () => {
  saveTokenToStorage();
});

oauthConnect.addEventListener("click", () => {
  setStatus(oauthStatus, "Opening login", "pending");
  window.open("/oauth/start", "hubspot-oauth", "width=520,height=720");
});

oauthRefresh.addEventListener("click", async () => {
  setStatus(oauthStatus, "Refreshing", "pending");
  try {
    const oauth = oauthFromStorage();
    if (!oauth || !oauth.refresh_token) throw new Error("Missing refresh token");
    const result = await postJson("/api/hubspot/refresh", { refresh_token: oauth.refresh_token });
    if (!result.ok || !result.token) throw new Error("Refresh failed");
    storeOAuth({
      access_token: result.token.access_token,
      refresh_token: result.token.refresh_token || oauth.refresh_token,
      expires_in: result.token.expires_in,
      token_type: result.token.token_type,
    });
  } catch (error) {
    setStatus(oauthStatus, "Refresh failed", "error");
    setOutput(pingOutput, error.message || "Refresh failed");
  }
});

toggleToken.addEventListener("click", () => {
  tokenInput.type = tokenInput.type === "password" ? "text" : "password";
  toggleToken.textContent = tokenInput.type === "password" ? "Show" : "Hide";
});

pingHubSpot.addEventListener("click", async () => {
  setStatus(tokenStatus, "Checking", "pending");
  setOutput(pingOutput, "");
  try {
    const token = tokenFromStorage() || tokenInput.value.trim();
    if (!token) throw new Error("Missing token");
    const result = await postJson("/api/hubspot/ping", { token });
    setOutput(pingOutput, result.ok ? "Connection OK" : "Connection failed");
    setStatus(tokenStatus, "Connected", "ok");
  } catch (error) {
    setOutput(pingOutput, error.message || "Connection failed");
    setStatus(tokenStatus, "Not saved", "error");
  }
});

initProperties.addEventListener("click", async () => {
  setStatus(initStatus, "Working", "pending");
  initOutput.textContent = "";
  try {
    const token = tokenFromStorage() || tokenInput.value.trim();
    if (!token) throw new Error("Missing token");
    const payload = {
      token,
      includeContacts: includeContacts.checked,
      includeCompanies: includeCompanies.checked,
    };
    const result = await postJson("/api/properties/init", payload);
    renderInitResults(result);
    setStatus(initStatus, "Done", "ok");
  } catch (error) {
    initOutput.textContent = error.message || "Failed to create properties";
    setStatus(initStatus, "Failed", "error");
  }
});

runScript.addEventListener("click", async () => {
  setStatus(runStatus, "Running", "pending");
  runOutput.textContent = "";
  try {
    const token = tokenFromStorage() || tokenInput.value.trim();
    const code = scriptInput.value.trim();
    if (!code) throw new Error("Paste a script first");
    const result = await postJson("/api/script/run", { token, code });
    renderRunLogs(result);
    setStatus(runStatus, result.ok ? "Complete" : "Failed", result.ok ? "ok" : "error");
  } catch (error) {
    runOutput.textContent = error.message || "Script failed";
    setStatus(runStatus, "Failed", "error");
  }
});

clearLogs.addEventListener("click", () => {
  runOutput.textContent = "";
  setStatus(runStatus, "Idle", "idle");
});

scriptFile.addEventListener("change", () => {
  const file = scriptFile.files && scriptFile.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    scriptInput.value = reader.result || "";
    localStorage.setItem(scriptKey, scriptInput.value);
  };
  reader.readAsText(file);
});

loadSample.addEventListener("click", async () => {
  try {
    const res = await fetch("/api/script/active");
    if (!res.ok) throw new Error("add-to-hubspot.js not found");
    const text = await res.text();
    scriptInput.value = text;
    localStorage.setItem(scriptKey, scriptInput.value);
  } catch (error) {
    runOutput.textContent = error.message || "Failed to load script";
  }
});

healthCheck.addEventListener("click", async () => {
  setStatus(healthStatus, "Checking", "pending");
  try {
    const result = await getJson("/api/health");
    setStatus(healthStatus, result.ok ? "OK" : "Error", result.ok ? "ok" : "error");
  } catch (error) {
    setStatus(healthStatus, "Offline", "error");
  }
});

scriptInput.addEventListener("input", () => {
  localStorage.setItem(scriptKey, scriptInput.value);
});

(() => {
  const storedToken = tokenFromStorage();
  if (storedToken) tokenInput.value = storedToken;
  updateTokenUI();
  updateOAuthUI();
  const storedScript = localStorage.getItem(scriptKey);
  if (storedScript) scriptInput.value = storedScript;
})();

window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) return;
  const data = event.data || {};
  if (data.type === "hubspot_oauth" && data.payload) {
    storeOAuth(data.payload);
    setOutput(pingOutput, "OAuth connected");
  }
});

getJson("/api/oauth/config")
  .then((config) => {
    oauthRedirect.textContent = config.redirectUri || "Unavailable";
    if (!config.hasClientId || !config.hasClientSecret) {
      oauthConfigHint.textContent = "Missing HUBSPOT_CLIENT_ID or HUBSPOT_CLIENT_SECRET in .env.";
      oauthConnect.disabled = true;
      oauthRefresh.disabled = true;
    } else {
      oauthConfigHint.textContent = `Scopes: ${config.scopes.join(", ")}`;
    }
  })
  .catch(() => {
    oauthRedirect.textContent = "Unavailable";
    oauthConfigHint.textContent = "OAuth config failed to load.";
  });

// ============================================================
// Web Extraction UI Logic
// ============================================================

const extractUrl = el("extractUrl");
const extractPreset = el("extractPreset");
const extractPrompt = el("extractPrompt");
const extractFormat = el("extractFormat");
const extractWriteHubspot = el("extractWriteHubspot");
const runExtraction = el("runExtraction");
const clearExtraction = el("clearExtraction");
const extractOutput = el("extractOutput");
const extractStatus = el("extractStatus");
const extractModeSingle = el("extractModeSingle");
const extractModeCsv = el("extractModeCsv");
const extractModeHubspot = el("extractModeHubspot");
const extractSingleRow = el("extractSingleRow");
const extractCsvRow = el("extractCsvRow");
const extractHubspotRow = el("extractHubspotRow");
const extractCsvFile = el("extractCsvFile");
const extractCsvPreview = el("extractCsvPreview");
const extractCustomRow = el("extractCustomRow");
const loadHubspotCompanies = el("loadHubspotCompanies");
const extractHubspotPreview = el("extractHubspotPreview");

let extractionUrls = [];
let hubspotCompanies = [];

// Toggle input mode visibility
const updateExtractModeUI = () => {
  const mode = document.querySelector('input[name="extractMode"]:checked')?.value || "single";
  extractSingleRow.style.display = mode === "single" ? "flex" : "none";
  extractCsvRow.style.display = mode === "csv" ? "flex" : "none";
  extractHubspotRow.style.display = mode === "hubspot" ? "flex" : "none";
};

extractModeSingle.addEventListener("change", updateExtractModeUI);
extractModeCsv.addEventListener("change", updateExtractModeUI);
extractModeHubspot.addEventListener("change", updateExtractModeUI);

// Toggle custom prompt visibility
extractPreset.addEventListener("change", () => {
  extractCustomRow.style.display = extractPreset.value === "custom" ? "flex" : "none";
});

// CSV file handling
extractCsvFile.addEventListener("change", async () => {
  const file = extractCsvFile.files && extractCsvFile.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async () => {
    const csvContent = reader.result;
    try {
      const result = await postJson("/api/extract/parse-csv", { csvContent });
      extractionUrls = result.urls || [];
      extractCsvPreview.textContent = `Found ${extractionUrls.length} URLs in CSV`;
    } catch (error) {
      extractCsvPreview.textContent = `Error: ${error.message}`;
      extractionUrls = [];
    }
  };
  reader.readAsText(file);
});

// Load HubSpot companies
loadHubspotCompanies.addEventListener("click", async () => {
  setStatus(extractStatus, "Loading", "pending");
  try {
    const token = tokenFromStorage() || tokenInput.value.trim();
    if (!token) throw new Error("Missing HubSpot token");

    const result = await postJson("/api/extract/hubspot-companies", { token });
    hubspotCompanies = result.companies || [];
    extractionUrls = hubspotCompanies.map((c) => c.website).filter(Boolean);

    extractHubspotPreview.textContent = `Found ${hubspotCompanies.length} companies (${extractionUrls.length} with websites)`;
    setStatus(extractStatus, "Loaded", "ok");
  } catch (error) {
    extractHubspotPreview.textContent = `Error: ${error.message}`;
    setStatus(extractStatus, "Error", "error");
  }
});

// Render extraction results
const renderExtractionResult = (result) => {
  if (!result) return "";

  if (result.success === false) {
    return `<div class="log-line log-error">Error: ${result.error || "Unknown error"}</div>`;
  }

  let html = "";

  if (result.metadata) {
    html += `<div class="log-line log-info">Extracted from: ${result.url}</div>`;
    html += `<div class="log-line log-info">Browser: ${result.metadata.browserEnv || "LOCAL"} | Duration: ${result.metadata.durationMs || 0}ms</div>`;
  }

  if (result.hubspotWritten) {
    html += `<div class="log-line log-info">Written to HubSpot company: ${result.hubspotCompanyId}</div>`;
  } else if (result.hubspotError) {
    html += `<div class="log-line log-warn">HubSpot write failed: ${result.hubspotError}</div>`;
  }

  if (result.data) {
    html += `<div class="result-section"><div class="result-title">Extracted Data:</div>`;
    html += `<pre style="background: rgba(26,26,26,0.05); padding: 12px; border-radius: 8px; overflow-x: auto; font-size: 0.82rem;">${JSON.stringify(result.data, null, 2)}</pre></div>`;
  }

  return html;
};

const renderBatchResults = (result) => {
  let html = "";

  html += `<div class="log-line log-info">Batch Complete: ${result.successful}/${result.total} successful</div>`;
  html += `<div class="log-line log-info">Duration: ${result.metadata?.totalDurationMs || 0}ms (avg: ${result.metadata?.avgDurationMs || 0}ms per URL)</div>`;

  if (result.errors && result.errors.length > 0) {
    html += `<div class="result-section"><div class="result-title">Errors (${result.errors.length}):</div>`;
    result.errors.forEach((err) => {
      html += `<div class="log-line log-error">${err.url}: ${err.error}</div>`;
    });
    html += `</div>`;
  }

  if (result.results && result.results.length > 0) {
    html += `<div class="result-section"><div class="result-title">Results (${result.results.length}):</div>`;
    result.results.forEach((r) => {
      html += `<div style="margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--border);">`;
      html += renderExtractionResult(r);
      html += `</div>`;
    });
    html += `</div>`;
  }

  return html;
};

// Run extraction
runExtraction.addEventListener("click", async () => {
  const mode = document.querySelector('input[name="extractMode"]:checked')?.value || "single";
  const preset = extractPreset.value;
  const writeToHubspot = extractWriteHubspot.checked;
  const token = tokenFromStorage() || tokenInput.value.trim();

  let customPrompt = null;
  let outputFormat = null;

  if (preset === "custom") {
    customPrompt = extractPrompt.value.trim();
    try {
      outputFormat = extractFormat.value.trim() ? JSON.parse(extractFormat.value.trim()) : null;
    } catch (_) {
      outputFormat = null;
    }
  }

  setStatus(extractStatus, "Extracting", "pending");
  extractOutput.innerHTML = "<div class='log-line'>Starting extraction...</div>";

  try {
    if (mode === "single") {
      const url = extractUrl.value.trim();
      if (!url) throw new Error("Please enter a URL");

      const result = await postJson("/api/extract/single", {
        url,
        preset,
        customPrompt,
        outputFormat,
        writeToHubspot,
        token: writeToHubspot ? token : undefined,
      });

      extractOutput.innerHTML = renderExtractionResult(result);
      setStatus(extractStatus, result.success ? "Complete" : "Failed", result.success ? "ok" : "error");
    } else {
      // Batch mode (CSV or HubSpot)
      if (extractionUrls.length === 0) {
        throw new Error(mode === "csv" ? "Please upload a CSV file first" : "Please load HubSpot companies first");
      }

      const result = await postJson("/api/extract/batch", {
        urls: extractionUrls,
        preset,
        customPrompt,
        outputFormat,
        writeToHubspot,
        token: writeToHubspot ? token : undefined,
        concurrency: 2,
      });

      extractOutput.innerHTML = renderBatchResults(result);
      setStatus(extractStatus, `${result.successful}/${result.total} done`, result.failed > 0 ? "error" : "ok");
    }
  } catch (error) {
    extractOutput.innerHTML = `<div class="log-line log-error">Error: ${error.message}</div>`;
    setStatus(extractStatus, "Failed", "error");
  }
});

// Clear extraction output
clearExtraction.addEventListener("click", () => {
  extractOutput.innerHTML = "";
  setStatus(extractStatus, "Idle", "idle");
  extractionUrls = [];
  hubspotCompanies = [];
  extractCsvPreview.textContent = "";
  extractHubspotPreview.textContent = "";
});

// ============================================================
// Menu Hunter UI Logic
// ============================================================

const huntUrl = el("huntUrl");
const huntUrls = el("huntUrls");
const huntLocation = el("huntLocation");
const huntFormat = el("huntFormat");
const runHunt = el("runHunt");
const clearHunt = el("clearHunt");
const huntOutput = el("huntOutput");
const huntStatus = el("huntStatus");
const huntModeSingle = el("huntModeSingle");
const huntModeBatch = el("huntModeBatch");
const huntSingleRow = el("huntSingleRow");
const huntBatchRow = el("huntBatchRow");

// Toggle input mode visibility
const updateHuntModeUI = () => {
  const mode = document.querySelector('input[name="huntMode"]:checked')?.value || "single";
  huntSingleRow.style.display = mode === "single" ? "flex" : "none";
  huntBatchRow.style.display = mode === "batch" ? "flex" : "none";
};

huntModeSingle.addEventListener("change", updateHuntModeUI);
huntModeBatch.addEventListener("change", updateHuntModeUI);

// Render menu hunt result
const renderHuntResult = (result) => {
  if (!result) return "";

  if (result.success === false) {
    let html = `<div class="log-line log-error">Error: ${result.error || "Unknown error"}</div>`;
    if (result.phases) {
      html += `<div class="log-line log-info">Phases completed: ${result.phases.map(p => p.phase).join(" → ")}</div>`;
    }
    return html;
  }

  let html = "";

  // Metadata
  html += `<div class="log-line log-info">Source: ${result.url}</div>`;
  html += `<div class="log-line log-info">Final URL: ${result.finalUrl || result.url}</div>`;

  if (result.metadata) {
    html += `<div class="log-line log-info">Discovery: ${result.metadata.discoveryType} (confidence: ${(result.metadata.confidence * 100).toFixed(0)}%)</div>`;
    html += `<div class="log-line log-info">Duration: ${result.metadata.durationMs}ms | Tokens: ${result.metadata.tokensUsed || 0}</div>`;
    if (result.metadata.usedFallback) {
      html += `<div class="log-line log-warn">Used fallback parser (AI extraction failed)</div>`;
    }
  }

  // Validation
  if (result.validation) {
    const v = result.validation;
    html += `<div class="log-line ${v.valid ? 'log-info' : 'log-warn'}">Validation: ${v.stats.totalItems} items in ${v.stats.sections} sections (${v.stats.itemsWithPrice} with prices)</div>`;
    if (v.warnings && v.warnings.length > 0) {
      html += `<div class="log-line log-warn">Warnings: ${v.warnings.slice(0, 3).join(", ")}${v.warnings.length > 3 ? ` (+${v.warnings.length - 3} more)` : ""}</div>`;
    }
  }

  // Menu data
  if (result.menu) {
    html += `<div class="result-section" style="margin-top: 16px;">`;
    html += `<div class="result-title">Menu Data:</div>`;
    html += `<pre style="background: rgba(26,26,26,0.05); padding: 12px; border-radius: 8px; overflow-x: auto; font-size: 0.82rem; max-height: 400px;">${JSON.stringify(result.menu, null, 2)}</pre>`;
    html += `</div>`;

    // Copy button
    html += `<div style="margin-top: 8px;">`;
    html += `<button class="btn secondary" onclick="navigator.clipboard.writeText(JSON.stringify(${JSON.stringify(result.menu)}, null, 2)).then(() => alert('Copied to clipboard!'))">Copy JSON</button>`;
    html += `</div>`;
  }

  return html;
};

const renderBatchHuntResults = (result) => {
  let html = "";

  html += `<div class="log-line log-info">Batch Complete: ${result.successful}/${result.total} successful</div>`;
  html += `<div class="log-line log-info">Duration: ${result.metadata?.totalDurationMs || 0}ms</div>`;

  if (result.errors && result.errors.length > 0) {
    html += `<div class="result-section"><div class="result-title">Errors (${result.errors.length}):</div>`;
    result.errors.forEach((err) => {
      html += `<div class="log-line log-error">${err.url}: ${err.error}</div>`;
    });
    html += `</div>`;
  }

  if (result.results && result.results.length > 0) {
    html += `<div class="result-section"><div class="result-title">Results (${result.results.length}):</div>`;
    result.results.forEach((r, i) => {
      html += `<div style="margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--border);">`;
      html += `<div class="log-line log-info" style="font-weight: 600;">Result ${i + 1}: ${r.url}</div>`;
      html += renderHuntResult(r);
      html += `</div>`;
    });
    html += `</div>`;
  }

  return html;
};

// Run menu hunt
runHunt.addEventListener("click", async () => {
  const mode = document.querySelector('input[name="huntMode"]:checked')?.value || "single";
  const location = huntLocation.value.trim() || "Austin TX";
  const format = huntFormat.value;

  setStatus(huntStatus, "Hunting", "pending");
  huntOutput.innerHTML = "<div class='log-line'>Starting menu hunt... This may take 30-60 seconds.</div>";

  try {
    if (mode === "single") {
      const url = huntUrl.value.trim();
      if (!url) throw new Error("Please enter a URL");

      const result = await postJson("/api/extract/hunt-menu", {
        url,
        location,
        format,
      });

      huntOutput.innerHTML = renderHuntResult(result);
      setStatus(huntStatus, result.success ? "Complete" : "Failed", result.success ? "ok" : "error");
    } else {
      // Batch mode
      const urlList = huntUrls.value.trim().split("\n").map(u => u.trim()).filter(u => u);
      if (urlList.length === 0) throw new Error("Please enter at least one URL");

      const result = await postJson("/api/extract/hunt-menu-batch", {
        urls: urlList,
        location,
        format,
        concurrency: 2,
      });

      huntOutput.innerHTML = renderBatchHuntResults(result);
      setStatus(huntStatus, `${result.successful}/${result.total} done`, result.failed > 0 ? "error" : "ok");
    }
  } catch (error) {
    huntOutput.innerHTML = `<div class="log-line log-error">Error: ${error.message}</div>`;
    setStatus(huntStatus, "Failed", "error");
  }
});

// Clear menu hunt output
clearHunt.addEventListener("click", () => {
  huntOutput.innerHTML = "";
  setStatus(huntStatus, "Idle", "idle");
});

// ============================================================
// LinkedIn Outreach UI Logic
// ============================================================

const linkedinLogin = el("linkedinLogin");
const linkedinLogout = el("linkedinLogout");
const linkedinStatus = el("linkedinStatus");
const linkedinHint = el("linkedinHint");
const runLinkedin = el("runLinkedin");
const clearLinkedin = el("clearLinkedin");
const linkedinOutput = el("linkedinOutput");
const linkedinActionStatus = el("linkedinActionStatus");
const linkedinSearchQuery = el("linkedinSearchQuery");
const linkedinCompanyFilter = el("linkedinCompanyFilter");
const linkedinCompanyName = el("linkedinCompanyName");
const linkedinRoles = el("linkedinRoles");
const linkedinProfileUrl = el("linkedinProfileUrl");
const linkedinTargetUrl = el("linkedinTargetUrl");
const linkedinMessage = el("linkedinMessage");
const linkedinUseAI = el("linkedinUseAI");
const linkedinSaveToHubspot = el("linkedinSaveToHubspot");
const linkedinLimit = el("linkedinLimit");

const linkedinSearchRow = el("linkedinSearchRow");
const linkedinCompanyRow = el("linkedinCompanyRow");
const linkedinProfileRow = el("linkedinProfileRow");
const linkedinMessageRow = el("linkedinMessageRow");

const linkedinModeSearch = el("linkedinModeSearch");
const linkedinModeCompany = el("linkedinModeCompany");
const linkedinModeProfile = el("linkedinModeProfile");
const linkedinModeConnect = el("linkedinModeConnect");
const linkedinModeMessage = el("linkedinModeMessage");

// Update mode UI visibility
const updateLinkedinModeUI = () => {
  const mode = document.querySelector('input[name="linkedinMode"]:checked')?.value || "search";
  linkedinSearchRow.style.display = mode === "search" ? "flex" : "none";
  linkedinCompanyRow.style.display = mode === "company" ? "flex" : "none";
  linkedinProfileRow.style.display = mode === "profile" ? "flex" : "none";
  linkedinMessageRow.style.display = (mode === "connect" || mode === "message") ? "flex" : "none";
};

linkedinModeSearch.addEventListener("change", updateLinkedinModeUI);
linkedinModeCompany.addEventListener("change", updateLinkedinModeUI);
linkedinModeProfile.addEventListener("change", updateLinkedinModeUI);
linkedinModeConnect.addEventListener("change", updateLinkedinModeUI);
linkedinModeMessage.addEventListener("change", updateLinkedinModeUI);

// Check LinkedIn status on page load
const checkLinkedInStatus = async () => {
  try {
    const result = await getJson("/api/linkedin/status");
    if (result.isLoggedIn) {
      setStatus(linkedinStatus, "Connected", "ok");
      linkedinHint.textContent = result.profile?.name ? `Logged in as: ${result.profile.name}` : "Session active";
    } else {
      setStatus(linkedinStatus, "Not connected", "idle");
    }
  } catch (error) {
    setStatus(linkedinStatus, "Unavailable", "error");
    linkedinHint.textContent = "Server not running or LinkedIn module unavailable";
  }
};

// Login to LinkedIn
linkedinLogin.addEventListener("click", async () => {
  setStatus(linkedinStatus, "Logging in...", "pending");
  linkedinOutput.innerHTML = "<div class='log-line'>Opening browser for LinkedIn login...</div>";

  try {
    const result = await postJson("/api/linkedin/login", { forceLogin: false });
    if (result.loggedIn) {
      setStatus(linkedinStatus, "Connected", "ok");
      linkedinHint.textContent = result.profile?.name ? `Logged in as: ${result.profile.name}` : "Session active";
      linkedinOutput.innerHTML = "<div class='log-line log-info'>Successfully logged in to LinkedIn</div>";
    } else {
      setStatus(linkedinStatus, "Login incomplete", "error");
      linkedinOutput.innerHTML = "<div class='log-line log-warn'>Login may have failed - check browser window</div>";
    }
  } catch (error) {
    setStatus(linkedinStatus, "Login failed", "error");
    linkedinOutput.innerHTML = `<div class='log-line log-error'>Login error: ${error.message}</div>`;
  }
});

// Logout from LinkedIn
linkedinLogout.addEventListener("click", async () => {
  setStatus(linkedinStatus, "Logging out...", "pending");
  try {
    await postJson("/api/linkedin/logout");
    setStatus(linkedinStatus, "Not connected", "idle");
    linkedinHint.textContent = "Session cleared. Set LINKEDIN_EMAIL and LINKEDIN_PASSWORD in .env for auto-login.";
    linkedinOutput.innerHTML = "<div class='log-line log-info'>Logged out and cleared session cookies</div>";
  } catch (error) {
    setStatus(linkedinStatus, "Error", "error");
    linkedinOutput.innerHTML = `<div class='log-line log-error'>Logout error: ${error.message}</div>`;
  }
});

// Render LinkedIn search results
const renderLinkedInProfiles = (profiles, title = "Results") => {
  if (!profiles || profiles.length === 0) {
    return `<div class="log-line log-warn">No profiles found</div>`;
  }

  let html = `<div class="result-section"><div class="result-title">${title} (${profiles.length}):</div>`;
  html += `<ul class="result-list">`;

  profiles.forEach((p, i) => {
    html += `<li style="padding: 8px 0; border-bottom: 1px solid var(--border);">`;
    html += `<div style="font-weight: 600;">${i + 1}. ${p.name || "Unknown"}</div>`;
    if (p.headline) html += `<div style="font-size: 0.9rem; color: var(--muted);">${p.headline}</div>`;
    if (p.currentCompany) html += `<div style="font-size: 0.85rem;">Company: ${p.currentCompany}</div>`;
    if (p.location) html += `<div style="font-size: 0.85rem;">Location: ${p.location}</div>`;
    if (p.connectionDegree) html += `<div style="font-size: 0.85rem;">Connection: ${p.connectionDegree}</div>`;
    if (p.profileUrl) html += `<div style="font-size: 0.85rem;"><a href="${p.profileUrl}" target="_blank" style="color: var(--accent);">View Profile</a></div>`;
    html += `</li>`;
  });

  html += `</ul></div>`;
  return html;
};

// Render full profile
const renderLinkedInFullProfile = (profile) => {
  if (!profile) return "";

  let html = `<div class="result-section">`;
  html += `<div class="result-title">${profile.name || "Unknown"}</div>`;

  if (profile.headline) html += `<div class="log-line">${profile.headline}</div>`;
  if (profile.location) html += `<div class="log-line log-info">Location: ${profile.location}</div>`;
  if (profile.connectionStatus) html += `<div class="log-line log-info">Connection: ${profile.connectionStatus}</div>`;

  if (profile.about) {
    html += `<div style="margin-top: 12px;"><strong>About:</strong></div>`;
    html += `<div style="font-size: 0.9rem; margin-top: 4px; white-space: pre-wrap;">${profile.about.slice(0, 500)}${profile.about.length > 500 ? '...' : ''}</div>`;
  }

  if (profile.experience && profile.experience.length > 0) {
    html += `<div style="margin-top: 12px;"><strong>Experience:</strong></div>`;
    profile.experience.slice(0, 3).forEach((e) => {
      html += `<div style="font-size: 0.9rem; margin-top: 4px;">• ${e.title} at ${e.company}${e.dateRange ? ` (${e.dateRange})` : ''}</div>`;
    });
    if (profile.experience.length > 3) {
      html += `<div style="font-size: 0.85rem; color: var(--muted);">+${profile.experience.length - 3} more</div>`;
    }
  }

  if (profile.skills && profile.skills.length > 0) {
    html += `<div style="margin-top: 12px;"><strong>Skills:</strong> ${profile.skills.slice(0, 10).join(", ")}${profile.skills.length > 10 ? '...' : ''}</div>`;
  }

  if (profile.profileUrl) {
    html += `<div style="margin-top: 12px;"><a href="${profile.profileUrl}" target="_blank" style="color: var(--accent);">View on LinkedIn</a></div>`;
  }

  html += `</div>`;

  // Full JSON for copy
  html += `<div style="margin-top: 12px;">`;
  html += `<button class="btn secondary" onclick="navigator.clipboard.writeText(JSON.stringify(${JSON.stringify(profile)}, null, 2)).then(() => alert('Copied to clipboard!'))">Copy JSON</button>`;
  html += `</div>`;

  return html;
};

// Run LinkedIn action
runLinkedin.addEventListener("click", async () => {
  const mode = document.querySelector('input[name="linkedinMode"]:checked')?.value || "search";
  const token = tokenFromStorage() || tokenInput.value.trim();
  const limit = parseInt(linkedinLimit.value) || 10;

  setStatus(linkedinActionStatus, "Working...", "pending");
  linkedinOutput.innerHTML = "<div class='log-line'>Processing request...</div>";

  try {
    let result;

    switch (mode) {
      case "search": {
        const query = linkedinSearchQuery.value.trim();
        const company = linkedinCompanyFilter.value.trim();
        if (!query && !company) throw new Error("Enter a search query or company filter");

        result = await postJson("/api/linkedin/search", { query, company, limit });

        if (result.ok) {
          linkedinOutput.innerHTML = renderLinkedInProfiles(result.results, `Search: "${query || company}"`);

          // Save to HubSpot if requested
          if (linkedinSaveToHubspot.checked && result.results?.length > 0) {
            linkedinOutput.innerHTML += "<div class='log-line'>Saving to HubSpot...</div>";
            const saveResult = await postJson("/api/linkedin/batch-enrich", {
              profiles: result.results,
              token,
            });
            linkedinOutput.innerHTML += `<div class='log-line log-info'>Saved ${saveResult.created} new, updated ${saveResult.updated}</div>`;
          }

          setStatus(linkedinActionStatus, `${result.results?.length || 0} found`, "ok");
        }
        break;
      }

      case "company": {
        const companyName = linkedinCompanyName.value.trim();
        const roles = linkedinRoles.value.split(",").map(r => r.trim()).filter(Boolean);
        if (!companyName) throw new Error("Enter a company name");

        result = await postJson("/api/linkedin/company-people", { companyName, roles, limit });

        if (result.ok) {
          linkedinOutput.innerHTML = renderLinkedInProfiles(result.employees, `${result.companyName || companyName} Contacts`);

          if (linkedinSaveToHubspot.checked && result.employees?.length > 0) {
            linkedinOutput.innerHTML += "<div class='log-line'>Saving to HubSpot...</div>";
            const saveResult = await postJson("/api/linkedin/batch-enrich", {
              profiles: result.employees,
              token,
            });
            linkedinOutput.innerHTML += `<div class='log-line log-info'>Saved ${saveResult.created} new, updated ${saveResult.updated}</div>`;
          }

          setStatus(linkedinActionStatus, `${result.employees?.length || 0} found`, "ok");
        }
        break;
      }

      case "profile": {
        const profileUrl = linkedinProfileUrl.value.trim();
        if (!profileUrl) throw new Error("Enter a profile URL or name");

        // Determine if it's a URL or a name search
        const isUrl = profileUrl.includes("linkedin.com") || !profileUrl.includes(" ");
        const payload = isUrl ? { profileUrl } : { personName: profileUrl };

        result = await postJson("/api/linkedin/profile/extract", payload);

        if (result.ok) {
          linkedinOutput.innerHTML = renderLinkedInFullProfile(result.profile);

          if (linkedinSaveToHubspot.checked && result.profile) {
            linkedinOutput.innerHTML += "<div class='log-line'>Saving to HubSpot...</div>";
            const saveResult = await postJson("/api/linkedin/save-to-hubspot", {
              profile: result.profile,
              token,
            });
            linkedinOutput.innerHTML += `<div class='log-line log-info'>Saved as contact: ${saveResult.contactId}</div>`;
          }

          setStatus(linkedinActionStatus, "Profile extracted", "ok");
        }
        break;
      }

      case "connect": {
        const profileUrl = linkedinTargetUrl.value.trim();
        const note = linkedinMessage.value.trim();
        const useAI = linkedinUseAI.checked;
        if (!profileUrl) throw new Error("Enter a profile URL");

        result = await postJson("/api/linkedin/connect", {
          profileUrl,
          note: note || undefined,
          useAI,
        });

        if (result.ok) {
          let statusMsg = result.status;
          if (result.status === "sent") statusMsg = "Connection request sent!";
          else if (result.status === "already_connected") statusMsg = "Already connected";
          else if (result.status === "pending") statusMsg = "Request already pending";

          linkedinOutput.innerHTML = `<div class='log-line log-info'>${statusMsg}</div>`;
          if (result.note) {
            linkedinOutput.innerHTML += `<div style="margin-top: 8px;"><strong>Note sent:</strong></div>`;
            linkedinOutput.innerHTML += `<div style="font-size: 0.9rem; white-space: pre-wrap;">${result.note}</div>`;
          }

          setStatus(linkedinActionStatus, statusMsg, result.status === "sent" ? "ok" : "idle");
        }
        break;
      }

      case "message": {
        const profileUrl = linkedinTargetUrl.value.trim();
        const message = linkedinMessage.value.trim();
        const useAI = linkedinUseAI.checked;
        if (!profileUrl) throw new Error("Enter a profile URL");
        if (!message && !useAI) throw new Error("Enter a message or enable AI enhancement");

        result = await postJson("/api/linkedin/message", {
          profileUrl,
          message: message || undefined,
          useAI,
        });

        if (result.ok) {
          linkedinOutput.innerHTML = `<div class='log-line log-info'>Message sent successfully!</div>`;
          if (result.message) {
            linkedinOutput.innerHTML += `<div style="margin-top: 8px;"><strong>Message:</strong></div>`;
            linkedinOutput.innerHTML += `<div style="font-size: 0.9rem; white-space: pre-wrap;">${result.message}</div>`;
          }
          setStatus(linkedinActionStatus, "Message sent", "ok");
        } else {
          throw new Error(result.error || "Failed to send message");
        }
        break;
      }
    }

    if (result && !result.ok) {
      throw new Error(result.error || "Operation failed");
    }

  } catch (error) {
    linkedinOutput.innerHTML = `<div class='log-line log-error'>Error: ${error.message}</div>`;
    setStatus(linkedinActionStatus, "Failed", "error");
  }
});

// Clear LinkedIn output
clearLinkedin.addEventListener("click", () => {
  linkedinOutput.innerHTML = "";
  setStatus(linkedinActionStatus, "Idle", "idle");
});

// Check status on load
checkLinkedInStatus();
