import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { requireAuth, isAuthError } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth guard — returns the authenticated user's claims
    const authResult = await requireAuth(req, corsHeaders);
    if (isAuthError(authResult)) return authResult;

    // Extract user ID from auth
    const authHeader = req.headers.get('Authorization') || '';
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claimsData } = await supabaseAuth.auth.getClaims(authHeader.replace('Bearer ', ''));
    const userId = claimsData?.claims?.sub as string;
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { type, title, status, score, violations, images, criticalCount, topViolation, oldScore, newScore } = body;

    // Look up the user's stored webhook URL server-side
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: prefs, error: prefsError } = await adminClient
      .from('notification_preferences')
      .select('slack_webhook_url')
      .eq('user_id', userId)
      .maybeSingle();

    if (prefsError) {
      console.error('Failed to load notification preferences:', prefsError);
    }

    const webhookUrl = prefs?.slack_webhook_url;
    if (!webhookUrl) {
      return new Response(JSON.stringify({ error: 'No Slack webhook URL configured. Add one in Settings → Notifications.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let blocks: unknown[];

    if (type === 'score_dropped') {
      blocks = [
        { type: "header", text: { type: "plain_text", text: "⚠️ Guardian AI — Score Dropped", emoji: true } },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Product:*\n${title || 'Unknown'}` },
            { type: "mrkdwn", text: `*Previous Score:*\n${oldScore ?? '—'}` },
            { type: "mrkdwn", text: `*New Score:*\n${newScore ?? '—'}` },
            { type: "mrkdwn", text: `*Drop:*\n${(oldScore ?? 0) - (newScore ?? 0)} points` },
          ],
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: "Amazon may have updated requirements or the listing was changed. Audit now." },
        },
      ];
    } else if (type === 'critical_violation') {
      blocks = [
        { type: "header", text: { type: "plain_text", text: "🚨 Guardian AI — Critical Violation", emoji: true } },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Product:*\n${title || 'Unknown'}` },
            { type: "mrkdwn", text: `*Critical Issues:*\n${criticalCount || 1}` },
          ],
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: `*Top Violation:*\n${topViolation || 'Critical compliance issue detected'}` },
        },
      ];
    } else if (type === 'fix_generated') {
      blocks = [
        { type: "header", text: { type: "plain_text", text: "🔧 Guardian AI — Fix Generated", emoji: true } },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Product:*\n${title || 'Unknown'}` },
            { type: "mrkdwn", text: `*Status:*\nFix applied` },
          ],
        },
      ];
    } else {
      // audit_complete or test
      blocks = [
        { type: "header", text: { type: "plain_text", text: "🛡️ Guardian AI — Audit Complete", emoji: true } },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Product:*\n${title || 'Unknown'}` },
            { type: "mrkdwn", text: `*Status:*\n${status || '—'}` },
            { type: "mrkdwn", text: `*Score:*\n${score ?? '—'}/100` },
            { type: "mrkdwn", text: `*Violations:*\n${violations ?? 0} found` },
            { type: "mrkdwn", text: `*Images:*\n${images ?? 0} audited` },
            { type: "mrkdwn", text: `*Critical Issues:*\n${criticalCount ?? 0}` },
          ],
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: `*Top Violation:*\n${topViolation || 'None'}` },
        },
      ];
    }

    const slackPayload = { blocks };

    const slackRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackPayload),
    });

    if (!slackRes.ok) {
      const errorText = await slackRes.text();
      throw new Error(`Slack responded ${slackRes.status}: ${errorText}`);
    }

    // Consume body
    await slackRes.text();

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Slack notification error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
