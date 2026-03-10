// Guardian AI — Side Panel Script

let panelData = null;

// ── INIT ───────────────────────────────────────────────────

async function init() {
  showLoading("Loading audit data...");

  try {
    const stored = await chrome.storage.session.get("guardianPanelData");
    panelData = stored.guardianPanelData;

    if (!panelData) {
      hideLoading();
      document.getElementById("empty-state").style.display = "block";
      return;
    }

    if (panelData.result) {
      renderReport(panelData);
    } else {
      showLoading("Running full audit...");
      await runFullAudit(panelData.pageData);
    }
  } catch (e) {
    hideLoading();
    document.getElementById("empty-state").style.display = "block";
    console.error("Side panel init error:", e);
  }
}

// ── RENDER REPORT ──────────────────────────────────────────

function renderReport(data) {
  hideLoading();
  const { pageData, result } = data;
  const content = document.getElementById("main-content");
  content.style.display = "block";

  // Product info
  document.getElementById("product-asin").textContent = "ASIN: " + (pageData.asin || "—");
  document.getElementById("product-title").textContent = pageData.title || "Unknown Product";
  document.getElementById("product-marketplace").textContent = pageData.marketplace || "US";

  // Score
  const score = result.overall_score || 0;
  const ring = document.getElementById("main-score-ring");
  ring.textContent = score;
  ring.className = "score-ring " + (score >= 85 ? "pass" : score >= 70 ? "warning" : "fail");

  const label = document.getElementById("score-label");
  label.textContent = result.status === "PASS" ? "✅ COMPLIANT" : "❌ NON-COMPLIANT";
  label.className = "score-meta " + (result.status === "PASS" ? "pass-text" : "fail-text");

  const violationCount = result.violations?.length || 0;
  const imageCount = pageData.images?.length || 0;
  document.getElementById("score-summary").textContent =
    `${imageCount} images analyzed · ${violationCount} violations found`;

  // Image grid
  renderImageGrid(pageData.images || [], result);

  // Violations
  renderViolations(result.violations || []);

  // Recommendations
  renderRecommendations(result.fix_recommendations || result.fixRecommendations || []);
}

function renderImageGrid(images, result) {
  const grid = document.getElementById("image-grid");
  grid.innerHTML = images.map((img, i) => {
    const imgSrc = img.base64
      ? `data:image/jpeg;base64,${img.base64}`
      : img.url || "";
    const type = img.type || "SECONDARY";
    const badgeClass = type === "MAIN" ? "badge-main" : type === "APLUS" ? "badge-aplus" : "badge-secondary";
    const analysis = img.analysis;
    const imgScore = analysis?.overall_score || analysis?.overallScore;
    const status = analysis?.status;

    return `
      <div class="image-card">
        <img src="${imgSrc}" alt="Image ${i + 1}" loading="lazy">
        <span class="image-badge ${badgeClass}">${type}</span>
        ${status ? `<span class="image-status-dot ${status === "PASS" ? "dot-pass" : "dot-fail"}"></span>` : '<span class="image-status-dot dot-pending"></span>'}
        ${imgScore !== undefined ? `<span class="image-score ${imgScore >= 85 ? "pass" : "fail"}">${imgScore}%</span>` : ""}
      </div>
    `;
  }).join("");
}

function renderViolations(violations) {
  const section = document.getElementById("violations-section");
  const list = document.getElementById("violations-list");

  if (violations.length === 0) {
    section.style.display = "none";
    return;
  }

  const sevOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const sorted = [...violations].sort((a, b) =>
    (sevOrder[a.severity] ?? 4) - (sevOrder[b.severity] ?? 4)
  );

  list.innerHTML = sorted.map((v, i) => {
    const sev = (v.severity || "medium").toLowerCase();
    return `
      <div class="violation-card sev-${sev}" style="animation-delay: ${i * 80}ms">
        <div class="violation-header">
          <span class="severity-badge ${sev}">${v.severity}</span>
          <span class="violation-rule">${v.rule}</span>
        </div>
        <div class="violation-desc">${v.description}</div>
        ${v.recommendation ? `
          <button class="violation-toggle" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'block' ? 'none' : 'block'; this.textContent = this.nextElementSibling.style.display === 'block' ? '▲ Hide recommendation' : '▼ Show recommendation'">▼ Show recommendation</button>
          <div class="violation-rec">${v.recommendation}</div>
        ` : ""}
      </div>
    `;
  }).join("");
}

function renderRecommendations(recs) {
  const container = document.getElementById("recommendations");
  if (recs.length === 0) {
    container.innerHTML = '<div class="rec-item" style="color: #00C851;">✅ No additional recommendations</div>';
    return;
  }
  container.innerHTML = recs.map(r => `
    <div class="rec-item">
      <span class="rec-icon">💡</span>
      <span>${r}</span>
    </div>
  `).join("");
}

// ── FULL AUDIT ─────────────────────────────────────────────

async function runFullAudit(pageData) {
  const images = pageData.images || [];
  if (images.length === 0) {
    hideLoading();
    document.getElementById("empty-state").style.display = "block";
    return;
  }

  const progressBar = document.getElementById("progress-bar");
  const progressFill = document.getElementById("progress-fill");
  progressBar.style.display = "block";

  for (let i = 0; i < images.length; i++) {
    document.getElementById("loading-message").textContent =
      `Analyzing image ${i + 1} of ${images.length}...`;
    progressFill.style.width = `${((i + 1) / images.length) * 100}%`;

    if (!images[i].base64) continue;

    try {
      const response = await chrome.runtime.sendMessage({
        type: "ANALYZE_IMAGES",
        data: {
          images: [images[i]],
          title: pageData.title,
          asin: pageData.asin,
          marketplace: pageData.marketplace
        }
      });
      if (response.success) {
        images[i].analysis = response.data;
      }
    } catch (e) {
      console.error("Analysis failed for image", i, e);
    }
  }

  const analyzed = images.filter(i => i.analysis);
  const scores = analyzed.map(i => i.analysis.overall_score || 0);
  const avgScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const allViolations = analyzed.flatMap(i => i.analysis.violations || []);
  const allRecs = analyzed.flatMap(i => i.analysis.fix_recommendations || []);

  const result = {
    overall_score: avgScore,
    status: avgScore >= 85 ? "PASS" : "FAIL",
    violations: allViolations,
    fix_recommendations: allRecs
  };

  panelData = { pageData: { ...pageData, images }, result };
  chrome.storage.session.set({ guardianPanelData: panelData });
  renderReport(panelData);
}

// ── FIX ALL ────────────────────────────────────────────────

document.getElementById("btn-fix-all").addEventListener("click", async () => {
  if (!panelData?.result || !panelData?.pageData?.images) return;

  const failedImages = panelData.pageData.images.filter(img => {
    const analysis = img.analysis;
    return analysis && (analysis.status === "FAIL" || (analysis.overall_score || 0) < 85);
  });

  if (failedImages.length === 0) {
    alert("No failed images to fix!");
    return;
  }

  const btn = document.getElementById("btn-fix-all");
  btn.disabled = true;
  btn.textContent = "Fixing...";

  const progress = document.getElementById("fix-progress");
  const progressText = document.getElementById("fix-progress-text");
  const progressFill = document.getElementById("fix-progress-fill");
  progress.style.display = "block";

  for (let i = 0; i < failedImages.length; i++) {
    progressText.textContent = `Fixing image ${i + 1} of ${failedImages.length}...`;
    progressFill.style.width = `${((i + 1) / failedImages.length) * 100}%`;

    try {
      const response = await chrome.runtime.sendMessage({
        type: "FIX_IMAGE",
        data: {
          imageBase64: failedImages[i].base64,
          imageType: failedImages[i].type || "SECONDARY",
          analysisResult: failedImages[i].analysis || {}
        }
      });

      if (response.success || response.fixedImageBase64) {
        failedImages[i].fixedBase64 = response.fixedImageBase64;
      }
    } catch (e) {
      console.error("Fix failed for image", i, e);
    }

    // Rate limiting
    if (i < failedImages.length - 1) {
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  const fixed = failedImages.filter(i => i.fixedBase64).length;
  progressText.textContent = `✅ Fixed ${fixed} of ${failedImages.length} images`;
  btn.textContent = `✅ ${fixed} Fixed`;
  btn.disabled = false;

  setTimeout(() => {
    btn.textContent = "✨ Fix All Failures";
    progress.style.display = "none";
  }, 5000);
});

// ── EXPORT ─────────────────────────────────────────────────

document.getElementById("btn-export").addEventListener("click", () => {
  if (!panelData) return;

  const exportData = {
    timestamp: new Date().toISOString(),
    product: {
      asin: panelData.pageData.asin,
      title: panelData.pageData.title,
      marketplace: panelData.pageData.marketplace
    },
    score: panelData.result.overall_score,
    status: panelData.result.status,
    violations: panelData.result.violations,
    recommendations: panelData.result.fix_recommendations,
    images: (panelData.pageData.images || []).map(img => ({
      type: img.type,
      url: img.url,
      score: img.analysis?.overall_score,
      status: img.analysis?.status,
      violations: img.analysis?.violations
    }))
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `guardian-report-${panelData.pageData.asin}-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

// ── COMPETITOR COMPARISON ──────────────────────────────────

document.getElementById("btn-compare").addEventListener("click", () => {
  const url = document.getElementById("competitor-url").value.trim();
  if (!url) return;
  alert("Competitor comparison coming soon! This will analyze the competitor listing and show a side-by-side comparison.");
});

// ── UTILITIES ──────────────────────────────────────────────

function showLoading(msg) {
  document.getElementById("loading-overlay").style.display = "block";
  document.getElementById("loading-message").textContent = msg;
  document.getElementById("main-content").style.display = "none";
  document.getElementById("empty-state").style.display = "none";
}

function hideLoading() {
  document.getElementById("loading-overlay").style.display = "none";
}

// Listen for data updates
chrome.storage.session.onChanged.addListener((changes) => {
  if (changes.guardianPanelData?.newValue) {
    panelData = changes.guardianPanelData.newValue;
    if (panelData.result) renderReport(panelData);
  }
});

// ── START ──────────────────────────────────────────────────

init();
