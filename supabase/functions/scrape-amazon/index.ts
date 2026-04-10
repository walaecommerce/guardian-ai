import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { useCredit, getUserIdFromAuth, createAdminClient } from "../_shared/credits.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Extract ASIN from any Amazon URL */
function extractAsin(url: string): string | null {
  const patterns = [
    /\/dp\/([A-Z0-9]{10})/i,
    /\/gp\/product\/([A-Z0-9]{10})/i,
    /\/product\/([A-Z0-9]{10})/i,
    /asin=([A-Z0-9]{10})/i,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1].toUpperCase();
  }
  return null;
}

/** Build alternate Amazon URLs from an ASIN to diversify scrape attempts */
function buildUrlVariants(originalUrl: string, asin: string | null): string[] {
  const urls = [originalUrl];
  if (!asin) return urls;

  // Extract domain from original URL
  const domainMatch = originalUrl.match(/https?:\/\/(www\.)?amazon\.([a-z.]+)/i);
  const tld = domainMatch ? domainMatch[2] : 'com';

  const canonical = `https://www.amazon.${tld}/dp/${asin}`;
  const mobile = `https://www.amazon.${tld}/gp/aw/d/${asin}`;
  const ref = `https://www.amazon.${tld}/dp/${asin}?ref=nosim`;

  // Add variants that differ from the original
  for (const v of [canonical, mobile, ref]) {
    if (!urls.includes(v)) urls.push(v);
  }
  return urls;
}

/** Sleep helper */
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Check if HTML looks like a real product page */
function isValidProductPage(html: string): boolean {
  if (!html || html.length < 5000) return false;
  return (
    html.includes('colorImages') ||
    html.includes('imageGalleryData') ||
    html.includes('landingImage') ||
    html.includes('media-amazon.com/images/I/') ||
    html.includes('productTitle')
  );
}

/** Detect CAPTCHA / bot-block pages */
function isCaptchaPage(html: string): boolean {
  if (!html) return true;
  if (html.length < 5000) return true;
  const lower = html.toLowerCase();
  return (
    lower.includes('captcha') ||
    lower.includes('robot check') ||
    lower.includes('type the characters you see') ||
    lower.includes('sorry, we just need to make sure') ||
    (lower.includes('to discuss automated access') && !lower.includes('productTitle'))
  );
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Deduct scrape credit
    let userId: string;
    try {
      userId = await getUserIdFromAuth(req);
      const admin = createAdminClient();
      await useCredit(admin, userId, 'scrape');
    } catch (creditErr: any) {
      if (creditErr?.status === 402) {
        return new Response(
          JSON.stringify({ success: false, error: creditErr.message || 'No scrape credits remaining', errorType: 'payment_required' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (creditErr?.status === 401) {
        return new Response(
          JSON.stringify({ success: false, error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.warn('[scrape-amazon] Credit check failed, proceeding anyway:', creditErr);
    }

    const { url } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Amazon scraping requires Firecrawl. Please use manual image upload instead.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[scrape-amazon] Using Firecrawl to scrape Amazon...');

    const asin = extractAsin(url);
    const urlVariants = buildUrlVariants(url, asin);

    // Scraping strategies with different browser fingerprints
    const strategies = [
      {
        waitFor: 8000,
        timeout: 40000,
        location: { country: 'US', languages: ['en'] },
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'max-age=0',
          'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
      },
      {
        waitFor: 10000,
        timeout: 45000,
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
        },
      },
      {
        waitFor: 12000,
        timeout: 50000,
        location: { country: 'GB', languages: ['en'] },
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-GB,en;q=0.9',
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        },
      },
    ];

    let lastError = '';
    let attempt = 0;

    // Try each URL variant with rotating strategies and exponential backoff
    for (const targetUrl of urlVariants) {
      for (let si = 0; si < strategies.length; si++) {
        attempt++;
        const strategy = strategies[si];

        // Exponential backoff: 0s, 2s, 4s, 6s...
        if (attempt > 1) {
          const delay = Math.min((attempt - 1) * 2000, 8000);
          console.log(`[scrape-amazon] Backoff ${delay}ms before attempt ${attempt}`);
          await sleep(delay);
        }

        console.log(`[scrape-amazon] Attempt ${attempt}: url=${targetUrl.slice(-40)}, strategy=${si}, waitFor=${strategy.waitFor}`);

        try {
          const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${firecrawlKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              url: targetUrl,
              formats: ['rawHtml'],
              waitFor: strategy.waitFor,
              timeout: strategy.timeout,
              onlyMainContent: false,
              headers: strategy.headers,
              ...(strategy.location && { location: strategy.location }),
            }),
          });

          const data = await response.json();

          if (!response.ok) {
            console.error(`[scrape-amazon] Firecrawl error (${response.status}):`, data?.error);
            lastError = data?.error || `Scraping failed (${response.status})`;
            continue;
          }

          const rawHtml = data.data?.rawHtml || data.rawHtml || data.data?.html || data.html;
          console.log(`[scrape-amazon] Received HTML: ${rawHtml?.length || 0} chars`);

          if (isCaptchaPage(rawHtml)) {
            console.log(`[scrape-amazon] ⚠️ CAPTCHA detected (${rawHtml?.length || 0} chars)`);
            lastError = 'Amazon returned a CAPTCHA page';
            continue;
          }

          if (isValidProductPage(rawHtml)) {
            console.log(`[scrape-amazon] ✅ Valid product page on attempt ${attempt}`);
            return new Response(
              JSON.stringify({
                success: true,
                html: rawHtml,
                markdown: data.data?.markdown || data.markdown,
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          lastError = 'Amazon returned a page without product images (possible bot detection)';
          console.log(`[scrape-amazon] ⚠️ Page has no image data`);
        } catch (fetchErr: any) {
          console.error(`[scrape-amazon] Fetch error:`, fetchErr?.message);
          lastError = fetchErr?.message || 'Network error during scrape';
        }

        // Stop after 6 total attempts to avoid excessive Firecrawl usage
        if (attempt >= 6) break;
      }
      if (attempt >= 6) break;
    }

    // All attempts failed
    console.error(`[scrape-amazon] All ${attempt} scraping attempts failed`);
    return new Response(
      JSON.stringify({
        success: false,
        error: `Amazon blocked after ${attempt} attempts. ${lastError}. Please try again later or use manual upload.`,
        attempts: attempt,
      }),
      { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Scrape error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
