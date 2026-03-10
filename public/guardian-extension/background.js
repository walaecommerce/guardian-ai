// Guardian AI — Background Service Worker
// Handles API calls to avoid CORS, manages side panel

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta";

// ── MESSAGE ROUTER ────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    case "ANALYZE_IMAGES":
      handleAnalysis(request.data).then(sendResponse);
      return true;
    case "FIX_IMAGE":
      handleFix(request.data).then(sendResponse);
      return true;
    case "SAVE_TO_GUARDIAN":
      saveToGuardian(request.data).then(sendResponse);
      return true;
    case "GET_SETTINGS":
      chrome.storage.sync.get(["geminiApiKey", "guardianUrl"], sendResponse);
      return true;
    case "OPEN_SIDE_PANEL":
      if (sender.tab) {
        chrome.sidePanel.open({ tabId: sender.tab.id }).catch(console.error);
      }
      sendResponse({ success: true });
      return true;
  }
});

// ── ANALYSIS HANDLER ──────────────────────────────────────────

async function handleAnalysis({ images, title, asin, marketplace }) {
  const settings = await chrome.storage.sync.get(["geminiApiKey", "guardianUrl"]);

  // Try Guardian API first
  if (settings.guardianUrl) {
    try {
      for (const img of images) {
        const response = await fetch(`${settings.guardianUrl}/functions/v1/analyze-image`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.guardianAnonKey || ""}`
          },
          body: JSON.stringify({
            imageBase64: img.base64,
            imageType: img.type || "MAIN",
            listingTitle: title,
            source: "chrome-extension"
          }),
          signal: AbortSignal.timeout(45000)
        });
        if (response.ok) {
          const data = await response.json();
          img.analysis = data;
        }
      }
      const analyzed = images.filter(i => i.analysis);
      if (analyzed.length > 0) {
        const scores = analyzed.map(i => i.analysis.overallScore || i.analysis.overall_score || 0);
        const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
        const allViolations = analyzed.flatMap(i => i.analysis.violations || []);
        return {
          success: true,
          source: "guardian",
          data: {
            overall_score: avgScore,
            status: avgScore >= 85 ? "PASS" : "FAIL",
            violations: allViolations,
            images: analyzed,
            fix_recommendations: analyzed.flatMap(i => i.analysis.fixRecommendations || i.analysis.fix_recommendations || [])
          }
        };
      }
    } catch (e) {
      console.log("Guardian API unavailable, falling back to direct Gemini:", e.message);
    }
  }

  // Fallback: Call Gemini directly
  if (settings.geminiApiKey) {
    try {
      const result = await callGeminiDirect(images, title, settings.geminiApiKey);
      return { success: true, source: "gemini-direct", data: result };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  return {
    success: false,
    error: "No API configured. Open Guardian AI settings and add your Gemini API key or Guardian URL."
  };
}

// ── DIRECT GEMINI CALL ────────────────────────────────────────

async function callGeminiDirect(images, title, apiKey) {
  const SYSTEM_PROMPT = `You are Guardian AI, an Amazon FBA compliance officer with forensic image analysis capabilities. Analyze this product image for Amazon compliance violations. Return ONLY valid JSON.`;

  const results = [];

  for (const img of images) {
    const isMain = img.type === "MAIN";
    const rules = isMain
      ? `MAIN IMAGE RULES (strict):
- Background: MUST be pure white RGB(255,255,255). Any shadow, gradient, or off-white = CRITICAL
- Text overlays: ZERO tolerance. No badges, watermarks, promotional text = CRITICAL
- Product occupancy: must fill 85%+ of frame. Under 70% = HIGH
- Quality: must be sharp, high-res, professionally lit. Blur = MEDIUM
- Props: only if they clarify product use. Lifestyle props = HIGH`
      : `SECONDARY IMAGE RULES (relaxed):
- Background: lifestyle/textured backgrounds ALLOWED
- Text: infographic text and callouts ALLOWED
- Prohibited: Best Seller badges, Amazon's Choice badges, competitor logos = CRITICAL
- Quality: must be readable and clear`;

    const response = await fetch(
      `${GEMINI_API_URL}/models/gemini-3.1-pro-preview:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: `${SYSTEM_PROMPT}\n\n${rules}` },
              { inline_data: { mime_type: "image/jpeg", data: img.base64 } },
              { text: `Analyze this image. Listing title: "${title}". Return JSON: { "overall_score": number, "status": "PASS"|"FAIL", "severity": "NONE"|"LOW"|"MEDIUM"|"HIGH"|"CRITICAL", "violations": [{ "rule": string, "severity": string, "description": string, "recommendation": string }], "fix_recommendations": string[], "generative_prompt": string }` }
            ]
          }],
          generationConfig: {
            responseMimeType: "application/json",
            thinkingConfig: { thinkingLevel: "High" }
          }
        }),
        signal: AbortSignal.timeout(45000)
      }
    );

    const data = await response.json();

    if (data.error) {
      console.error("Gemini error:", data.error);
      continue;
    }

    const text = data.candidates[0].content.parts
      .filter(p => !p.thought && p.text)
      .map(p => p.text)
      .join("");
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    img.analysis = parsed;
    results.push(parsed);

    // Rate limit: 2s between calls
    if (images.indexOf(img) < images.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  if (results.length === 0) {
    throw new Error("No images could be analyzed");
  }

  const scores = results.map(r => r.overall_score || 0);
  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const allViolations = results.flatMap(r => r.violations || []);

  return {
    overall_score: avgScore,
    status: avgScore >= 85 ? "PASS" : "FAIL",
    violations: allViolations,
    images,
    fix_recommendations: results.flatMap(r => r.fix_recommendations || []),
    generative_prompt: results[0]?.generative_prompt || ""
  };
}

// ── FIX HANDLER ───────────────────────────────────────────────

async function handleFix({ imageBase64, analysisResult, imageType }) {
  const settings = await chrome.storage.sync.get(["geminiApiKey", "guardianUrl"]);

  // Try Guardian API first
  if (settings.guardianUrl) {
    try {
      const response = await fetch(`${settings.guardianUrl}/functions/v1/generate-fix`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${settings.guardianAnonKey || ""}`
        },
        body: JSON.stringify({
          imageBase64,
          analysisResult,
          imageType: imageType || "MAIN",
          listingTitle: analysisResult?.listing_title || ""
        }),
        signal: AbortSignal.timeout(90000)
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) return data;
      }
    } catch (e) {
      console.log("Guardian fix API unavailable:", e.message);
    }
  }

  // Fallback: Direct Gemini image generation
  if (settings.geminiApiKey) {
    try {
      const prompt = imageType === "MAIN"
        ? `Generate a product photograph. Requirements:
- Pure white background RGB(255,255,255) — no shadows, gradients, or tints
- Remove ALL text overlays, badges, watermarks, promotional elements
- Preserve exact product identity: same label design, colors, shape, size proportions
- Product must fill 85% of the frame
- Professional studio lighting, sharp focus, high resolution
- Amazon main image compliant`
        : `Edit this product image with MINIMAL targeted changes only:
- REMOVE: "Best Seller" badges, "Amazon's Choice" badges, competitor logos, unreadable text
- PRESERVE EVERYTHING ELSE: lifestyle setting, background scene, people, props, infographic text
- Do NOT change the background
- Make the smallest possible edit to achieve compliance`;

      const parts = [{ text: prompt }];
      if (imageBase64) {
        parts.push({ inline_data: { mime_type: "image/jpeg", data: imageBase64 } });
      }

      const response = await fetch(
        `${GEMINI_API_URL}/models/gemini-3.1-flash-image-preview:generateContent?key=${settings.geminiApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              responseModalities: ["TEXT", "IMAGE"],
              imageConfig: { aspectRatio: "1:1", imageSize: "2K" },
              thinkingConfig: { thinkingLevel: "High" }
            }
          }),
          signal: AbortSignal.timeout(90000)
        }
      );

      const data = await response.json();

      if (data.error) {
        return { success: false, error: data.error.message };
      }

      const imagePart = data.candidates[0].content.parts
        .find(p => !p.thought && p.inlineData);

      if (imagePart) {
        return {
          success: true,
          fixedImageBase64: imagePart.inlineData.data,
          mimeType: imagePart.inlineData.mimeType || "image/png"
        };
      }

      return { success: false, error: "No image generated by model" };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  return { success: false, error: "No API configured for image generation" };
}

// ── SAVE TO GUARDIAN ──────────────────────────────────────────

async function saveToGuardian(auditData) {
  const settings = await chrome.storage.sync.get(["guardianUrl", "guardianAnonKey"]);
  if (!settings.guardianUrl) {
    return { success: false, error: "Guardian URL not configured in settings" };
  }

  try {
    const response = await fetch(`${settings.guardianUrl}/functions/v1/save-audit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${settings.guardianAnonKey || ""}`
      },
      body: JSON.stringify(auditData),
      signal: AbortSignal.timeout(15000)
    });
    return await response.json();
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── SIDE PANEL OPENER ─────────────────────────────────────────

chrome.action.onClicked?.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id }).catch(console.error);
});
