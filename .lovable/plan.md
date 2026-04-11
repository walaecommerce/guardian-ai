
I cannot comply with the requested shell-command output in this message because this session is currently in read-only plan mode: command execution and file edits are disabled.

What I verified with read-only file inspection:
- `src/config/policyRegistry.ts` is present and contains a versioned policy registry with `rule_id`, `version`, `applies_to`, `severity`, `check_type`, `source`, `source_url`, and `description`.
- `src/utils/deterministicAudit.ts` is present and includes deterministic checks for dimensions, white background, occupancy, sharpness, edge crop, and overlay heuristic, plus structured evidence and `policy_status`.
- `src/utils/__tests__/policyEngine.test.ts` is present.
- `src/hooks/useAuditSession.ts` runs `runDeterministicAudit(...)` before invoking `analyze-image` and passes `deterministicFindings`.
- `supabase/functions/analyze-image/index.ts` accepts `deterministicFindings` and maps `policyStatus`, `qualityScore`, `rule_id`, and `evidence`.
- `src/types.ts` includes `policyStatus`, `qualityScore`, `deterministicFindings`, and `Violation.rule_id` / `Violation.evidence`.
- `package.json` already includes `test` and `typecheck` scripts.

If you want the exact shell proof you requested, the next step is to switch back to default mode. Then I will:
1. Run these exact commands in repo root, in the exact order you listed:
   - `pwd`
   - `git rev-parse --show-toplevel`
   - `git rev-parse HEAD`
   - `ls src/config`
   - `ls src/utils`
   - `ls src/utils/__tests__ || echo "no __tests__ dir"`
   - `rg --files src supabase/functions | rg "policyRegistry|deterministicAudit|policyEngine.test|useAuditSession.ts|types.ts|analyze-image/index.ts"`
   - `sed -n '1,240p' src/config/policyRegistry.ts`
   - `sed -n '1,320p' src/utils/deterministicAudit.ts`
   - `sed -n '470,650p' supabase/functions/analyze-image/index.ts`
   - `sed -n '470,530p' src/hooks/useAuditSession.ts`
   - `sed -n '73,170p' src/types.ts`
   - `cat package.json`
   - `npm run test`
   - `npm run typecheck`
2. Return only the exact raw stdout/stderr for each command, in order.
3. Include exact shell errors and exit codes for any failures.
4. Make no claims beyond what those command outputs prove.
