/**
 * Shared validation and error response helpers for edge functions.
 * Provides consistent request parsing, field validation, and error shapes.
 */

export interface ErrorPayload {
  error: string;
  errorType?: string;
  missingFields?: string[];
  details?: unknown;
  status: number;
}

/**
 * Safely parse JSON body from a request.
 * Returns the parsed body or a 400 Response.
 */
export async function parseJsonBody(req: Request): Promise<Record<string, unknown> | Response> {
  try {
    const body = await req.json();
    if (typeof body !== 'object' || body === null) {
      return errorResponse(400, 'Request body must be a JSON object');
    }
    return body as Record<string, unknown>;
  } catch {
    return errorResponse(400, 'Malformed JSON in request body');
  }
}

/**
 * Validate that required fields are present and non-empty.
 * Returns null if valid, or a 400 Response listing missing fields.
 */
export function requireFields(
  body: Record<string, unknown>,
  fields: string[],
): Response | null {
  const missing = fields.filter(f => {
    const val = body[f];
    return val === undefined || val === null || val === '';
  });
  if (missing.length === 0) return null;
  return errorResponse(400, `Missing required fields: ${missing.join(', ')}`, {
    missingFields: missing,
  });
}

/**
 * Standard error response with consistent shape.
 */
export function errorResponse(
  status: number,
  message: string,
  extra: Partial<Omit<ErrorPayload, 'error' | 'status'>> = {},
  corsHeaders: Record<string, string> = defaultCorsHeaders,
): Response {
  return new Response(
    JSON.stringify({ error: message, status, ...extra }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  );
}

/**
 * Standard success response wrapper.
 */
export function successResponse(
  data: unknown,
  corsHeaders: Record<string, string> = defaultCorsHeaders,
): Response {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const defaultCorsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
