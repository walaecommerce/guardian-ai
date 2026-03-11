import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if Firecrawl is available
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    
    if (firecrawlKey) {
      console.log('Using Firecrawl to scrape Amazon...');
      
      // Stealth-oriented scraping strategies to bypass Amazon bot detection
      const strategies = [
        {
          waitFor: 10000,
          timeout: 45000,
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
          waitFor: 12000,
          timeout: 45000,
          headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
          },
        },
        {
          waitFor: 15000,
          timeout: 60000,
          location: { country: 'GB', languages: ['en'] },
          headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-GB,en;q=0.9',
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
          },
        },
      ];

      let html: string | null = null;
      let lastError: string | null = null;

      for (const strategy of strategies) {
        console.log(`[scrape-amazon] Trying strategy: waitFor=${strategy.waitFor}, location=${strategy.location?.country || 'default'}, UA=${strategy.headers['User-Agent']?.slice(-20)}`);
        
        const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url,
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
          console.error('[scrape-amazon] Firecrawl error:', data);
          lastError = data.error || `Scraping failed (${response.status})`;
          continue;
        }

        const rawHtml = data.data?.rawHtml || data.rawHtml || data.data?.html || data.html;
        console.log(`[scrape-amazon] Received HTML: ${rawHtml?.length || 0} chars`);

        // Check if Amazon returned a real product page (>10KB typical) or a CAPTCHA (<5KB)
        if (rawHtml && rawHtml.length > 5000) {
          // Verify it contains product image data
          const hasImageData = rawHtml.includes('colorImages') || 
                              rawHtml.includes('imageGalleryData') || 
                              rawHtml.includes('landingImage') ||
                              rawHtml.includes('media-amazon.com/images/I/');
          
          if (hasImageData) {
            console.log('[scrape-amazon] ✅ Valid product page with image data');
            html = rawHtml;
            return new Response(
              JSON.stringify({ 
                success: true, 
                html: rawHtml,
                markdown: data.data?.markdown || data.markdown
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          } else {
            console.log('[scrape-amazon] ⚠️ HTML received but no image data found (possible CAPTCHA or error page)');
            lastError = 'Amazon returned a page without product images (possible bot detection)';
          }
        } else {
          console.log(`[scrape-amazon] ⚠️ HTML too short (${rawHtml?.length || 0} chars) — likely CAPTCHA`);
          lastError = 'Amazon returned a CAPTCHA page. Please try again or use manual upload.';
        }
      }

      // All strategies failed
      console.error('[scrape-amazon] All scraping strategies failed');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: lastError || 'Amazon blocked the scraping request. Please use manual upload instead.' 
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // No Firecrawl key available
    console.log('Firecrawl not configured');
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Amazon scraping requires Firecrawl. Please use manual image upload instead.' 
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
