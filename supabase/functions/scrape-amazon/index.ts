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
      
      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          formats: ['html'],
          waitFor: 3000,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Firecrawl error:', data);
        return new Response(
          JSON.stringify({ success: false, error: data.error || 'Scraping failed' }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Firecrawl scrape successful');
      return new Response(
        JSON.stringify({ 
          success: true, 
          html: data.data?.html || data.html,
          markdown: data.data?.markdown || data.markdown
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
