

## Usability Polish Plan — Launch-Ready Pass

### What's already good
Dashboard, ImportStep, FixStep, ReviewStep, Campaign, Studio, Tracker, and Session all have reasonable copy, empty states, and completion CTAs from prior phases. The remaining gaps are small but add up.

### Changes

**1. Tracker empty state — add "what to expect" guidance (src/pages/Tracker.tsx)**
- The Tracker empty state says "Paste an Amazon product URL above to start monitoring" but doesn't explain the value. Add a brief line: "You'll see compliance scores, trend charts, and alerts when scores drop."
- When detail view has no audits, improve "No audits yet." to be more action-oriented.

**2. Campaign Audit — improve paused/completion copy (src/pages/CampaignAudit.tsx)**
- Paused state copy says `Paused — N of M products done` but the "Clear & Start Over" button label is vague about data loss. Change to "Discard & Start Over".
- In the summary view, the "Start New Campaign" button should confirm intent: rename to "New Campaign" and keep consistent with Dashboard language.
- The summary "needs fixes" guidance says "Open each product in the Single Audit tool" — clarify this to "Open each product URL in a New Audit to apply AI fixes."

**3. Studio results empty state — improve guidance (src/pages/Studio.tsx)**
- Current empty: "No images yet / Fill in the product details and click Generate..." — good but could mention the compliance check happens automatically.
- Update to: "No images yet. Fill in the product details and hit Generate — each image is automatically checked for Amazon compliance."

**4. Session page — improve "no images" empty state (src/pages/Session.tsx)**
- Current: "No images in this session" with no next action. Add a CTA to go back home or to the audit page.
- Improve the non-Studio empty state from "No images found. The import may have failed — try again from the home page." to include a button.

**5. ComplianceHistory — improve "Load" button label (src/components/ComplianceHistory.tsx)**
- The "Load" button on each row is vague. Change to "Review" to match the Review step language.
- Add a small tooltip or description to the empty state to explain what saved reports contain.

**6. CommandBar — polish the "Run Audit" label for re-runs (src/components/CommandBar.tsx)**
- When assets already have results, the CommandBar still shows "Run Audit". Add logic: if `analyzedCount > 0`, show "Re-run Audit" to match Session page behavior.

**7. Session page — completion action improvement (src/pages/Session.tsx)**
- When all images are analyzed and none failed, the Session Actions panel doesn't show a clear "done" indicator. Add a small success message: "All images passed — save or export your report."
- When all failed images are fixed, add "All issues fixed" line before the "Save to History" button.

### Files to change
1. `src/pages/Tracker.tsx` — empty state & detail copy
2. `src/pages/CampaignAudit.tsx` — paused/completion copy
3. `src/pages/Studio.tsx` — results empty state
4. `src/pages/Session.tsx` — empty state + completion messaging
5. `src/components/ComplianceHistory.tsx` — "Load" → "Review"
6. `src/components/CommandBar.tsx` — "Re-run Audit" when results exist

### Technical details
- All changes are copy/label updates — no new components, hooks, or database changes.
- No new dependencies.
- Existing tests should remain unaffected (only user-facing strings change).

