// Guardian AI — Popup Script

// ── TAB SWITCHING ──────────────────────────────────────────

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("tab-" + tab.dataset.tab).classList.add("active");
  });
});

// ── PAGE DETECTION ──────────────────────────────────────────

async function detectPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || "";
  const isAmazon = /amazon\.(com|co\.uk|com\.au|ca|de|fr|in|co\.jp)/.test(url);
  const isProduct = /\/dp\/|\/gp\/product\//.test(url);

  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");

  if (!isAmazon) {
    document.getElementById("not-amazon").style.display = "block";
    document.getElementById("btn-audit").style.display = "none";
    statusDot.className = "status-dot dot-gray";
    statusText.textContent = "Not on Amazon";
    return false;
  }

  if (!isProduct) {
    document.getElementById("not-amazon").style.display = "block";
    document.getElementById("not-amazon").textContent = "Navigate to a product page to audit";
    document.getElementById("btn-audit").style.display = "none";
    statusDot.className = "status-dot dot-orange";
    statusText.textContent = "Browse to a product page";
    return false;
  }

  const marketplace = url.includes(".co.uk") ? "UK" :
    url.includes(".com.au") ? "AU" :
    url.includes(".ca") ? "CA" :
    url.includes(".de") ? "DE" :
    url.includes(".fr") ? "FR" :
    url.includes(".in") ? "IN" :
    url.includes(".co.jp") ? "JP" : "US";

  statusDot.className = "status-dot dot-green";
  statusText.textContent = `Amazon ${marketplace} product detected`;

  try {
    const result = await chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_DATA" });
    if (result) {
      document.getElementById("page-info").style.display = "block";
      document.getElementById("page-asin").textContent = "ASIN: " + result.asin;
      document.getElementById("page-title").textContent = result.title;
      document.getElementById("marketplace-badge").textContent = marketplace;

      if (result.mainImageUrl) {
        document.getElementById("fix-preview").style.display = "block";
        document.getElementById("fix-preview-img").src = result.mainImageUrl;
      }

      const cached = await chrome.tabs.sendMessage(tab.id, {
        type: "GET_CACHED_AUDIT",
        asin: result.asin
      });
      if (cached) displayAuditResult(cached);
    }
  } catch (e) {
    console.log("Could not connect to content script:", e);
  }

  return true;
}

// ── AUDIT ──────────────────────────────────────────────────

document.getElementById("btn-audit").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  setLoading(true, "Extracting images from page...");

  try {
    const pageData = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_FULL_DATA" });

    if (!pageData || pageData.images.length === 0) {
      setLoading(false);
      showError("No product images found on this page");
      return;
    }

    setLoading(true, `Analyzing ${pageData.images.length} images...`);

    const response = await chrome.runtime.sendMessage({
      type: "ANALYZE_IMAGES",
      data: {
        images: pageData.images,
        title: pageData.title,
        asin: pageData.asin,
        marketplace: pageData.marketplace
      }
    });

    setLoading(false);

    if (response.success) {
      displayAuditResult(response.data);
      document.getElementById("btn-full-report").style.display = "block";
      document.getElementById("btn-save").style.display = "block";
      window.__lastAudit = { pageData, result: response.data };
    } else {
      showError(response.error);
    }
  } catch (e) {
    setLoading(false);
    showError("Failed to analyze: " + e.message);
  }
});

function displayAuditResult(result) {
  const circle = document.getElementById("score-circle");
  const status = document.getElementById("score-status");
  const violations = document.getElementById("score-violations");
  const violationsList = document.getElementById("violations-list");

  const score = result.overall_score || 0;
  circle.textContent = score;
  circle.className = "score-circle " +
    (score >= 85 ? "score-pass" : score >= 70 ? "score-warning" : "score-fail");

  status.textContent = result.status === "PASS" ? "✅ PASS" : "❌ FAIL";
  violations.textContent = `${result.violations?.length || 0} violations found`;

  document.getElementById("score-section").style.display = "flex";

  if (result.violations && result.violations.length > 0) {
    const sevOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    const sorted = [...result.violations].sort((a, b) =>
      (sevOrder[a.severity] ?? 4) - (sevOrder[b.severity] ?? 4)
    );

    violationsList.style.display = "block";
    violationsList.innerHTML = sorted.slice(0, 4).map(v => {
      const sevClass = `sev-${(v.severity || "medium").toLowerCase()}`;
      return `
        <div class="violation-card ${sevClass}">
          <div class="violation-rule">${v.severity} — ${v.rule}</div>
          <div class="violation-desc">${v.description}</div>
        </div>
      `;
    }).join("");

    if (sorted.length > 4) {
      violationsList.innerHTML += `
        <div class="violation-more">+${sorted.length - 4} more — open full report</div>
      `;
    }
  }
}

// ── FIX IMAGE ──────────────────────────────────────────────

document.getElementById("btn-fix-main").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  document.getElementById("fix-loading").style.display = "block";
  document.getElementById("btn-fix-main").style.display = "none";

  try {
    const pageData = await chrome.tabs.sendMessage(tab.id, { type: "GET_MAIN_IMAGE_BASE64" });

    if (!pageData?.base64) {
      document.getElementById("fix-loading").style.display = "none";
      document.getElementById("btn-fix-main").style.display = "block";
      showError("Could not extract main image");
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: "FIX_IMAGE",
      data: {
        imageBase64: pageData.base64,
        imageType: "MAIN",
        analysisResult: window.__lastAudit?.result || {
          generative_prompt: "Fix this Amazon product image. Pure white background RGB(255,255,255), product fills 85% of frame, remove all text overlays and badges."
        }
      }
    });

    document.getElementById("fix-loading").style.display = "none";

    if (response.success || response.fixedImageBase64) {
      const base64 = response.fixedImageBase64;
      const fixedImg = document.getElementById("fix-result-img");
      fixedImg.src = "data:image/png;base64," + base64;
      document.getElementById("fix-result").style.display = "block";

      document.getElementById("btn-download-fix").onclick = () => {
        const link = document.createElement("a");
        link.href = "data:image/png;base64," + base64;
        link.download = "guardian-fixed-main-" + Date.now() + ".png";
        link.click();
      };
    } else {
      document.getElementById("btn-fix-main").style.display = "block";
      showError(response.error || "Fix generation failed");
    }
  } catch (e) {
    document.getElementById("fix-loading").style.display = "none";
    document.getElementById("btn-fix-main").style.display = "block";
    showError("Fix failed: " + e.message);
  }
});

// ── SETTINGS ──────────────────────────────────────────────

async function loadSettings() {
  const settings = await chrome.storage.sync.get(["geminiApiKey", "guardianUrl"]);
  if (settings.geminiApiKey) document.getElementById("input-gemini-key").value = settings.geminiApiKey;
  if (settings.guardianUrl) document.getElementById("input-guardian-url").value = settings.guardianUrl;
}

document.getElementById("btn-save-settings").addEventListener("click", async () => {
  const key = document.getElementById("input-gemini-key").value.trim();
  const url = document.getElementById("input-guardian-url").value.trim();
  await chrome.storage.sync.set({ geminiApiKey: key, guardianUrl: url });
  const status = document.getElementById("settings-status");
  status.textContent = "✅ Settings saved";
  setTimeout(() => (status.textContent = ""), 3000);
});

document.getElementById("btn-test-connection").addEventListener("click", async () => {
  const status = document.getElementById("settings-status");
  status.textContent = "Testing...";

  const settings = await chrome.storage.sync.get(["geminiApiKey", "guardianUrl"]);

  if (settings.guardianUrl) {
    try {
      const res = await fetch(settings.guardianUrl + "/functions/v1/health", {
        signal: AbortSignal.timeout(10000)
      });
      status.textContent = res.ok ? "✅ Guardian AI connected" : "⚠️ Guardian API returned error";
    } catch {
      status.textContent = settings.geminiApiKey
        ? "⚠️ Guardian offline — will use Gemini direct"
        : "❌ No connection available";
    }
  } else if (settings.geminiApiKey) {
    status.textContent = "✅ Gemini API key configured (direct mode)";
  } else {
    status.textContent = "❌ No API configured — add keys above";
  }
});

// ── FULL REPORT ─────────────────────────────────────────────

document.getElementById("btn-full-report")?.addEventListener("click", async () => {
  const settings = await chrome.storage.sync.get(["guardianUrl"]);
  const url = settings.guardianUrl || "https://amazon-listing-guardian.lovable.app";
  const asin = window.__lastAudit?.pageData?.asin || "";
  chrome.tabs.create({ url: url + "?source=extension&asin=" + asin });
});

// ── SAVE ────────────────────────────────────────────────────

document.getElementById("btn-save")?.addEventListener("click", async () => {
  if (!window.__lastAudit) return;
  const btn = document.getElementById("btn-save");
  btn.textContent = "Saving...";

  const response = await chrome.runtime.sendMessage({
    type: "SAVE_TO_GUARDIAN",
    data: window.__lastAudit
  });
  btn.textContent = response.success ? "✅ Saved!" : "❌ Save failed";
  setTimeout(() => (btn.textContent = "💾 Save to Guardian AI"), 3000);
});

// ── UTILITIES ──────────────────────────────────────────────

function setLoading(show, text) {
  document.getElementById("loading").style.display = show ? "block" : "none";
  document.getElementById("loading-text").textContent = text || "Analyzing...";
  document.getElementById("btn-audit").disabled = show;
}

function showError(msg) {
  const el = document.createElement("div");
  el.style.cssText = "background:#2a1515;border:1px solid #FF4444;border-radius:8px;padding:10px;font-size:11px;color:#FF4444;margin-bottom:8px;";
  el.textContent = "❌ " + msg;
  const container = document.querySelector(".tab-content.active");
  container.insertBefore(el, container.firstChild);
  setTimeout(() => el.remove(), 6000);
}

// ── INIT ───────────────────────────────────────────────────

loadSettings();
detectPage();
