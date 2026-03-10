# Guardian AI Chrome Extension — Installation

## Quick Install

1. Open Chrome and go to: `chrome://extensions`
2. Enable **"Developer mode"** toggle (top right)
3. Click **"Load unpacked"**
4. Select the `guardian-extension` folder
5. The Guardian AI shield icon 🛡️ appears in your toolbar

## First Time Setup

1. Click the **Guardian AI** icon in your toolbar
2. Go to the **Settings** tab
3. Enter your **Gemini API Key** (from [aistudio.google.com](https://aistudio.google.com))
4. *(Optional)* Enter your **Guardian AI URL** (from your Lovable project)
5. Click **Save Settings**
6. Click **Test Connection** to verify

## How to Use

1. Go to any Amazon product page (e.g., `amazon.com/dp/B08xxxxx`)
2. The **Guardian AI badge** appears in the bottom-right corner
3. Click **"Audit Now"** for an instant compliance score
4. Click **"Full Report ›"** for detailed analysis in the side panel
5. Click the **extension icon** for popup controls and image fixing
6. Go to the **Fix Image** tab to generate compliant replacements with AI

## Features

- 🔍 **Instant Audit** — One-click compliance scoring on any product page
- 🛡️ **Floating Badge** — Always-visible score indicator on Amazon pages
- 📊 **Full Report Panel** — Detailed violations, recommendations, and image grid
- ✨ **AI Image Fix** — Generate compliant main images with Gemini 3.1
- 💾 **Save to Guardian** — Sync audit results to your Guardian AI web app
- 📄 **Export Reports** — Download full JSON compliance reports
- 🔄 **24h Cache** — Previous audit results cached for instant recall
- 🌍 **Multi-Marketplace** — Works on US, UK, AU, CA, DE, FR, IN, JP Amazon sites

## Supported Marketplaces

| Marketplace | Domain |
|-------------|--------|
| 🇺🇸 US | amazon.com |
| 🇬🇧 UK | amazon.co.uk |
| 🇦🇺 Australia | amazon.com.au |
| 🇨🇦 Canada | amazon.ca |
| 🇩🇪 Germany | amazon.de |
| 🇫🇷 France | amazon.fr |
| 🇮🇳 India | amazon.in |
| 🇯🇵 Japan | amazon.co.jp |

## API Configuration

The extension supports two modes:

### Mode 1: Guardian AI (Recommended)
Connect to your Guardian AI web app for full-featured analysis with the rewritten edge functions.

### Mode 2: Direct Gemini (Fallback)
Use your own Gemini API key for standalone operation without the web app.

If both are configured, the extension tries Guardian AI first and falls back to direct Gemini if unavailable.

## Architecture

```
popup.html/js     → Extension popup UI (audit, fix, settings)
content.js/css    → Injected into Amazon pages (data extraction, floating badge)
background.js     → Service worker (API calls, side panel management)
sidepanel.html/js → Full report panel with detailed analysis
```

## Troubleshooting

- **Badge not appearing?** — Make sure you're on a product detail page (`/dp/` or `/gp/product/`)
- **"No API configured" error?** — Add your Gemini API key in Settings
- **Images not loading?** — Some Amazon images block cross-origin access; the extension handles this gracefully
- **Audit taking too long?** — Large listings with many images may take 30-60 seconds
