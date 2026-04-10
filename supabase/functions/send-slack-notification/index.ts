import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { requireAuth, isAuthError } from "../_shared/auth.ts";
import { parseJsonBody, requireFields, errorResponse, successResponse } from "../_shared/validation.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Map notification type to the notify_on key
const typeToPreferenceKey: Record<string, string> = {
  audit_complete: 'auditComplete',
  critical_violation: 'criticalViolations',
  score_dropped: 'scoreDropped',
  fix_generated: 'fixGenerated',
};

// Map notification type to its implied severity level
const typeToSeverity: Record<string, string> = {
  critical_violation: 'critical',
  score_dropped: 'warning',
  audit_complete: 'info',
  fix_generated: 'info',
};

// Severity ordering for min_severity gating
const severityRank: Record<string, number> = { info: 0, warning: 1, critical: 2 };

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authResult = await requireAuth(req, corsHeaders);
    if (isAuthError(authResult)) return authResult;

    // Parse & validate body
    const bodyOrError = await parseJsonBody(req);
    if (bodyOrError instanceof Response) return bodyOrError;
    const body = bodyOrError;

    const fieldCheck = requireFields(body, ['type']);
    if (fieldCheck) return fieldCheck;

    const { type, title, status, score, violations, images, criticalCount, topViolation, oldScore, newScore } = body as Record<string, any>;

    // Extract user ID
    const authHeader = req.headers.get('Authorization') || '';
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData } = await supabaseAuth.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      return errorResponse(401, 'Unauthorized', {}, corsHeaders);
    }

    // Load notification preferences
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: prefs, error: prefsError } = await adminClient
      .from('notification_preferences')
      .select('slack_webhook_url, notify_on, min_severity')
      .eq('user_id', userId)
      .maybeSingle();

    if (prefsError) console.error('Failed to load notification preferences:', prefsError);

    const webhookUrl = prefs?.slack_webhook_url;
    if (!webhookUrl) {
      return successResponse({ skipped: true, reason: 'No Slack webhook URL configured. Add one in Settings → Notifications.' }, corsHeaders);
    }

    // Server-side gating (skip for test notifications)
    if (type !== 'test') {
      const notifyOn = (prefs?.notify_on || {}) as Record<string, boolean>;
      const prefKey = typeToPreferenceKey[type];
      if (prefKey && notifyOn[prefKey] === false) {
        return successResponse({ skipped: true, reason: `Notification type "${type}" is disabled in preferences.` }, corsHeaders);
      }

      const minSeverity = prefs?.min_severity || 'any';
      if (minSeverity !== 'any') {
        const eventSeverity = typeToSeverity[type] || 'info';
        if ((severityRank[eventSeverity] ?? 0) < (severityRank[minSeverity] ?? 0)) {
          return successResponse({ skipped: true, reason: `Event severity "${eventSeverity}" is below minimum "${minSeverity}".` }, corsHeaders);
        }
      }
    }

    // Build Slack blocks
    const blocks = buildSlackBlocks(type, { title, status, score, violations, images, criticalCount, topViolation, oldScore, newScore });

    const slackRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
    });

    if (!slackRes.ok) {
      const errorText = await slackRes.text();
      throw new Error(`Slack responded ${slackRes.status}: ${errorText}`);
    }
    await slackRes.text();

    return successResponse({ success: true }, corsHeaders);
  } catch (error) {
    console.error('Slack notification error:', error);
    return errorResponse(500, error instanceof Error ? error.message : 'Unknown error', {}, corsHeaders);
  }
});

// ── Slack block builders ──────────────────────────────────────

function buildSlackBlocks(type: string, data: Record<string, any>): unknown[] {
  const { title, status, score, violations, images, criticalCount, topViolation, oldScore, newScore } = data;

  if (type === 'score_dropped') {
    return [
      { type: "header", text: { type: "plain_text", text: "⚠️ Guardian AI — Score Dropped", emoji: true } },
      { type: "section", fields: [
        { type: "mrkdwn", text: `*Product:*\n${title || 'Unknown'}` },
        { type: "mrkdwn", text: `*Previous Score:*\n${oldScore ?? '—'}` },
        { type: "mrkdwn", text: `*New Score:*\n${newScore ?? '—'}` },
        { type: "mrkdwn", text: `*Drop:*\n${(oldScore ?? 0) - (newScore ?? 0)} points` },
      ]},
      { type: "section", text: { type: "mrkdwn", text: "Amazon may have updated requirements or the listing was changed. Audit now." } },
    ];
  }

  if (type === 'critical_violation') {
    return [
      { type: "header", text: { type: "plain_text", text: "🚨 Guardian AI — Critical Violation", emoji: true } },
      { type: "section", fields: [
        { type: "mrkdwn", text: `*Product:*\n${title || 'Unknown'}` },
        { type: "mrkdwn", text: `*Critical Issues:*\n${criticalCount || 1}` },
      ]},
      { type: "section", text: { type: "mrkdwn", text: `*Top Violation:*\n${topViolation || 'Critical compliance issue detected'}` } },
    ];
  }

  if (type === 'fix_generated') {
    return [
      { type: "header", text: { type: "plain_text", text: "🔧 Guardian AI — Fix Generated", emoji: true } },
      { type: "section", fields: [
        { type: "mrkdwn", text: `*Product:*\n${title || 'Unknown'}` },
        { type: "mrkdwn", text: `*Status:*\nFix applied` },
      ]},
    ];
  }

  // audit_complete or test
  return [
    { type: "header", text: { type: "plain_text", text: "🛡️ Guardian AI — Audit Complete", emoji: true } },
    { type: "section", fields: [
      { type: "mrkdwn", text: `*Product:*\n${title || 'Unknown'}` },
      { type: "mrkdwn", text: `*Status:*\n${status || '—'}` },
      { type: "mrkdwn", text: `*Score:*\n${score ?? '—'}/100` },
      { type: "mrkdwn", text: `*Violations:*\n${violations ?? 0} found` },
      { type: "mrkdwn", text: `*Images:*\n${images ?? 0} audited` },
      { type: "mrkdwn", text: `*Critical Issues:*\n${criticalCount ?? 0}` },
    ]},
    { type: "section", text: { type: "mrkdwn", text: `*Top Violation:*\n${topViolation || 'None'}` } },
  ];
}
