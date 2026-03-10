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
    const { webhookUrl, type, title, status, score, violations, images, criticalCount, topViolation, oldScore, newScore } = await req.json();

    if (!webhookUrl) {
      return new Response(JSON.stringify({ error: 'Missing webhookUrl' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
