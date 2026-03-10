// Guardian AI — Content Script
// Injected into Amazon product pages

(function () {
  if (window.__guardianInitialized) return;
  window.__guardianInitialized = true;

  // ── EXTRACT PAGE DATA ──────────────────────────────────────

  function extractASIN() {
    const url = window.location.href;
    const dpMatch = url.match(/\/dp\/([A-Z0-9]{10})/);
    const gpMatch = url.match(/\/gp\/product\/([A-Z0-9]{10})/);
    return dpMatch?.[1] || gpMatch?.[1] ||
      document.querySelector("[data-asin]")?.getAttribute("data-asin") ||
      "UNKNOWN";
  }

  function extractTitle() {
    return document.querySelector("#productTitle")?.textContent?.trim() ||
      document.querySelector("h1.a-size-large")?.textContent?.trim() ||
      document.querySelector('meta[name="title"]')?.content ||
      document.title;
  }

  function extractMarketplace() {
    const host = window.location.hostname;
    if (host.includes(".co.uk")) return "UK";
    if (host.includes(".com.au")) return "AU";
    if (host.includes(".ca")) return "CA";
    if (host.includes(".de")) return "DE";
    if (host.includes(".fr")) return "FR";
    if (host.includes(".in")) return "IN";
    if (host.includes(".co.jp")) return "JP";
    return "US";
  }

  function extractImages() {
    const images = [];
    const seen = new Set();

    // Main image
    const mainImg = document.querySelector("#landingImage, #imgTagWrapperId img, #main-image");
    if (mainImg) {
      const src = cleanImageUrl(mainImg.src || mainImg.getAttribute("data-old-hires") || parseDataDynamic(mainImg));
      if (src && !seen.has(src)) {
        seen.add(src);
        images.push({ url: src, type: "MAIN", index: 0 });
      }
    }

    // Thumbnail gallery
    const thumbs = document.querySelectorAll("#altImages .item img, #imageBlock img, .imageThumbnail img");
    thumbs.forEach((img, i) => {
      let src = img.src || img.getAttribute("data-src");
      if (!src) return;
      src = cleanImageUrl(src);
      if (!src || seen.has(src) || isIconUrl(src)) return;
      seen.add(src);
      images.push({ url: src, type: "SECONDARY", index: i + 1 });
    });

    // A+ content images
    const aplusImgs = document.querySelectorAll("#aplus img, #aplusbody img, .aplus-module img");
    aplusImgs.forEach((img) => {
      let src = img.src;
      if (!src) return;
      src = cleanImageUrl(src);
      if (!src || seen.has(src) || isIconUrl(src)) return;
      seen.add(src);
      images.push({ url: src, type: "APLUS", index: images.length });
    });

    return images;
  }

  function parseDataDynamic(img) {
    const attr = img.getAttribute("data-a-dynamic-image");
    if (!attr) return null;
    try {
      const obj = JSON.parse(attr);
      const urls = Object.keys(obj);
      return urls.length > 0 ? urls[urls.length - 1] : null;
    } catch { return null; }
  }

  function cleanImageUrl(url) {
    if (!url) return null;
    return url
      .replace(/\._AC_S[XY]\d+_/g, "")
      .replace(/\._AC_UL\d+_/g, "")
      .replace(/\._CR\d+,\d+,\d+,\d+_/g, "")
      .replace(/\._SL\d+_/g, "._SL1500_")
      .split("?")[0];
  }

  function isIconUrl(url) {
    const blocked = ["icon", "logo", "button", "zoom", "magnify", "spinner", "play", "star", "pixel", "sprite", "transparent", "nav_", "arrow", "checkmark"];
    return blocked.some(b => url.toLowerCase().includes(b));
  }

  function extractBullets() {
    const bullets = [];
    document.querySelectorAll("#feature-bullets li span.a-list-item").forEach(el => {
      const text = el.textContent?.trim();
      if (text && text.length > 5) bullets.push(text);
    });
    return bullets;
  }

  function extractPrice() {
    return document.querySelector(".a-price .a-offscreen")?.textContent?.trim() ||
      document.querySelector("#priceblock_ourprice")?.textContent?.trim() || "";
  }

  function getPageData() {
    const asin = extractASIN();
    const title = extractTitle();
    const marketplace = extractMarketplace();
    const images = extractImages();
    const bullets = extractBullets();
    const price = extractPrice();
    const mainImageUrl = images.find(i => i.type === "MAIN")?.url || images[0]?.url || null;
    return { asin, title, marketplace, images, bullets, price, mainImageUrl };
  }

  // ── IMAGE TO BASE64 ────────────────────────────────────────

  async function imageUrlToBase64(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext("2d").drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/jpeg", 0.9).split(",")[1]);
      };
      img.onerror = () => reject(new Error("Failed to load: " + url));
      img.src = url;
    });
  }

  // ── CACHE ───────────────────────────────────────────────────

  function getCachedAudit(asin) {
    try {
      const cache = JSON.parse(localStorage.getItem("guardian-cache") || "{}");
      const entry = cache[asin];
      if (!entry) return null;
      if (Date.now() - entry.timestamp > 86400000) return null; // 24h
      return entry.result;
    } catch { return null; }
  }

  function cacheAudit(asin, result) {
    try {
      const cache = JSON.parse(localStorage.getItem("guardian-cache") || "{}");
      cache[asin] = { result, timestamp: Date.now() };
      const keys = Object.keys(cache);
      if (keys.length > 50) delete cache[keys[0]];
      localStorage.setItem("guardian-cache", JSON.stringify(cache));
    } catch { /* noop */ }
  }

  // ── MESSAGE LISTENER (from popup/background) ───────────────

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.type) {
      case "GET_PAGE_DATA":
        sendResponse(getPageData());
        return true;

      case "GET_CACHED_AUDIT":
        sendResponse(getCachedAudit(request.asin));
        return true;

      case "EXTRACT_FULL_DATA":
        (async () => {
          const data = getPageData();
          const imagesWithBase64 = [];
          for (const img of data.images.slice(0, 9)) {
            try {
              const base64 = await imageUrlToBase64(img.url);
              imagesWithBase64.push({ ...img, base64 });
            } catch (e) {
              console.warn("Guardian: skipping image", img.url, e.message);
            }
          }
          sendResponse({ ...data, images: imagesWithBase64 });
        })();
        return true;

      case "GET_MAIN_IMAGE_BASE64":
        (async () => {
          const data = getPageData();
          const mainUrl = data.images.find(i => i.type === "MAIN")?.url || data.images[0]?.url;
          if (!mainUrl) { sendResponse({ base64: null }); return; }
          try {
            const base64 = await imageUrlToBase64(mainUrl);
            sendResponse({ base64, url: mainUrl, title: data.title });
          } catch (e) {
            sendResponse({ base64: null, error: e.message });
          }
        })();
        return true;
    }
  });

  // ── FLOATING BADGE ──────────────────────────────────────────

  function injectFloatingBadge() {
    if (document.getElementById("guardian-badge")) return;

    const badge = document.createElement("div");
    badge.id = "guardian-badge";
    badge.innerHTML = `
      <div class="guardian-badge-inner">
        <button class="guardian-dismiss" id="guardian-dismiss" title="Close">&times;</button>
        <div class="guardian-logo">🛡️</div>
        <div class="guardian-badge-text">Guardian AI</div>
        <div class="guardian-score-ring" id="guardian-score-ring">
          <span id="guardian-score-text">—</span>
        </div>
        <button class="guardian-audit-btn" id="guardian-quick-audit">Audit Now</button>
        <button class="guardian-panel-btn" id="guardian-open-panel">Full Report ›</button>
      </div>
    `;
    document.body.appendChild(badge);

    document.getElementById("guardian-quick-audit").addEventListener("click", runQuickAudit);
    document.getElementById("guardian-open-panel").addEventListener("click", openSidePanel);
    document.getElementById("guardian-dismiss").addEventListener("click", () => badge.remove());

    // Check cache
    const cached = getCachedAudit(extractASIN());
    if (cached) updateBadgeScore(cached.overall_score, cached.status);
  }

  function updateBadgeScore(score, status) {
    const ring = document.getElementById("guardian-score-ring");
    const text = document.getElementById("guardian-score-text");
    if (!ring || !text) return;
    text.textContent = score;
    ring.className = "guardian-score-ring";
    if (score >= 85) ring.classList.add("score-pass");
    else if (score >= 70) ring.classList.add("score-warning");
    else ring.classList.add("score-fail");
  }

  async function runQuickAudit() {
    const btn = document.getElementById("guardian-quick-audit");
    const pageData = getPageData();
    if (pageData.images.length === 0) {
      showBadgeMessage("No images found");
      return;
    }

    btn.textContent = "Analyzing...";
    btn.disabled = true;

    try {
      const mainImage = pageData.images.find(i => i.type === "MAIN") || pageData.images[0];
      const base64 = await imageUrlToBase64(mainImage.url);

      const response = await chrome.runtime.sendMessage({
        type: "ANALYZE_IMAGES",
        data: {
          images: [{ ...mainImage, base64 }],
          title: pageData.title,
          asin: pageData.asin,
          marketplace: pageData.marketplace
        }
      });

      if (response.success) {
        updateBadgeScore(response.data.overall_score, response.data.status);
        cacheAudit(pageData.asin, response.data);
        window.__guardianLastAudit = { pageData, result: response.data };
        btn.textContent = "View Details";
        btn.removeEventListener("click", runQuickAudit);
        btn.addEventListener("click", openSidePanel);
      } else {
        showBadgeMessage(response.error || "Audit failed");
        btn.textContent = "Retry";
        btn.disabled = false;
      }
    } catch (e) {
      showBadgeMessage("Error: " + e.message);
      btn.textContent = "Retry";
      btn.disabled = false;
    }
  }

  function showBadgeMessage(msg) {
    const text = document.getElementById("guardian-score-text");
    if (text) text.textContent = "!";
    console.log("Guardian AI:", msg);
  }

  function openSidePanel() {
    if (window.__guardianLastAudit) {
      chrome.storage.session.set({ guardianPanelData: window.__guardianLastAudit });
    }
    chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" });
  }

  // ── INITIALIZE ──────────────────────────────────────────────

  if (window.location.href.match(/\/dp\/|\/gp\/product\//)) {
    if (document.readyState === "complete") {
      injectFloatingBadge();
    } else {
      window.addEventListener("load", injectFloatingBadge);
    }
  }
})();
