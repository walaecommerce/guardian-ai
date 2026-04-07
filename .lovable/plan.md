

# Dashboard UX Redesign Plan

## Current State Analysis

The dashboard has grown organically with many features spread across disconnected pages and overlapping UI layers:

```text
┌─────────────────────────────────────────────────────────┐
│  Header (48px) — sidebar trigger + notifications        │
├──────┬──────────────────────────────────────────────────┤
│      │  Policy Banner (conditional)                     │
│      │  Credit Warning Banner (conditional)             │
│      │  AI Credits Exhausted Banner (conditional)       │
│ Side │  Command Bar (sticky — stepper + actions)        │
│ bar  │  ┌──────────────────────────────────────────┐    │
│ 280px│  │  Step Content (Import/Audit/Fix/Review)  │    │
│      │  └──────────────────────────────────────────┘    │
│      │  Activity Panel (fixed bottom, overlapping)      │
│      │  ImageDetailDrawer (right sheet overlay)         │
│      │  FixModal (full modal overlay)                   │
└──────┴──────────────────────────────────────────────────┘
```

### Key Problems Identified

1. **Triple-stacked banners** — Policy, Credit Warning, and AI Exhausted banners can all appear simultaneously, pushing content down by 150px+
2. **Redundant navigation layers** — The Command Bar stepper duplicates sidebar navigation; the stepper controls only the single-audit flow but looks like global nav
3. **Activity Panel obscures content** — Fixed-bottom panel overlaps page content and has no margin awareness of sidebar width
4. **Two detail views for one image** — ImageDetailDrawer (sheet) AND FixModal (dialog) create a confusing 2-layer drill-down; users must "View Full Details" from drawer to reach modal
5. **Disconnected secondary pages** — Sessions, Media, Studio, Tracker, Campaign are siloed pages with no cross-linking or dashboard overview
6. **No home dashboard** — The root `/` route goes straight into the audit flow; there's no overview showing recent sessions, credit status, or quick actions
7. **Review step is overloaded** — Review has 3 sub-tabs (Audit, Fix & Compare, Reports) each containing multiple panels, making it the most complex view but accessed last
8. **Credits shown in sidebar only** — Credit state is critical for UX but only visible in the collapsible sidebar section; banners are the only other surface

---

## Proposed Architecture

```text
┌─────────────────────────────────────────────────────────┐
│  Header (48px) — logo + breadcrumb + credits pill + user│
├──────┬──────────────────────────────────────────────────┤
│      │                                                  │
│ Side │  Page Content (full height, no floating panels)  │
│ bar  │                                                  │
│ 56px │  "/" = Dashboard Home (new)                      │
│ icons│  "/audit" = Single Audit (stepper flow)          │
│ rail │  "/campaign" = Campaign                          │
│      │  "/studio" = Studio                              │
│      │  "/tracker" = Tracker                            │
│      │  "/sessions" = Sessions                          │
│      │  "/media" = Media                                │
│      │                                                  │
└──────┴──────────────────────────────────────────────────┘
```

### Changes

#### Phase 1: Layout & Navigation Cleanup (3 files)

**1.1 — New Dashboard Home page (`/`)**
Replace the current Index audit flow with a dashboard overview:
- **Quick Actions row**: "New Audit", "Campaign Audit", "Open Studio" cards
- **Recent Sessions**: Last 5 sessions with score, date, and resume link
- **Credits Summary**: Visual credit meters (scrape/analyze/fix) inline, not in sidebar
- **Active Alerts**: Consolidated single banner for policy updates + credit warnings (instead of 3 separate banners)

Move the current single-audit flow to `/audit`.

**1.2 — Consolidate header banners into one notification center**
Replace the 3 stacked banners (PolicyBanner, CreditWarningBanner, AICreditsExhaustedBanner) with a single notification icon in the header that opens a dropdown showing all active alerts. Critical alerts get a red dot indicator on the icon.

**1.3 — Simplify sidebar to icon rail**
The sidebar already collapses to icons. Make icon-rail the default state (56px) with expand-on-hover. Remove the credits section from the sidebar (moved to header pill + dashboard home). Keep navigation groups: Workspace (Home, Audit, Campaign, Sessions, Media) and Tools (Studio, Tracker).

#### Phase 2: Audit Flow Simplification (4 files)

**2.1 — Merge Command Bar into the page header**
Remove the separate sticky Command Bar. Move the stepper into the audit page content as a horizontal progress indicator at the top of the audit area. Move the contextual action button (Run Audit / Fix All / Save Report) into each step's own UI — they already exist there.

**2.2 — Unify ImageDetailDrawer and FixModal**
Replace the two-layer system (drawer then modal) with a single full-width slide-over panel. When you click an image:
- Panel opens from the right (480px wide)
- Shows image preview, violations, score, before/after slider, fix controls, and attempt history — all in one scrollable view
- No intermediate "View Full Details" step

**2.3 — Replace Activity Panel with inline status**
Remove the fixed-bottom Activity Panel. Replace with:
- A collapsible "Activity Log" section at the bottom of the audit page (not fixed-position)
- Toast notifications for key events (audit complete, fix applied)
- Progress indicators inline in each step's UI (already exist)

**2.4 — Flatten Review step**
Split the overloaded Review step into the audit flow more naturally:
- Move ComplianceReportCard and ListingScoreCard into the Audit step (shown after analysis completes)
- Move Recommendations into the Fix step
- Keep only Export/Reports and Competitor Analysis in Review

#### Phase 3: Information Architecture (2 files)

**3.1 — Add breadcrumb navigation**
Add a breadcrumb to the header: Home > Audit > [Product Name]. This replaces the stepper as the navigation context indicator and works across all pages.

**3.2 — Cross-link pages**
- Sessions page: Add "Re-audit" and "Open in Studio" actions per session
- Media page: Add "Run Audit on Selection" action
- Studio page: Add "Import from Session" to pull in existing product images

---

## Files Modified

| File | Change |
|------|--------|
| `src/pages/Dashboard.tsx` | New file — dashboard home page |
| `src/pages/Index.tsx` | Rename to audit flow, move to `/audit` route |
| `src/App.tsx` | Update routes: `/` = Dashboard, `/audit` = audit flow |
| `src/components/DashboardLayout.tsx` | Add breadcrumbs to header, consolidate banners into notification dropdown |
| `src/components/AppSidebar.tsx` | Default to icon rail, remove credits section, add Home nav item |
| `src/components/CommandBar.tsx` | Remove (inline stepper into audit page) |
| `src/components/ActivityPanel.tsx` | Convert from fixed-position to inline collapsible |
| `src/components/ImageDetailDrawer.tsx` | Expand to unified detail panel (absorb FixModal content) |
| `src/components/audit/AuditStep.tsx` | Add scorecard panels inline after audit completes |
| `src/components/audit/FixStep.tsx` | Add recommendations panel |
| `src/components/audit/ReviewStep.tsx` | Simplify to export + competitor only |
| `src/components/MobileBottomNav.tsx` | Add Home tab, update Audit route |
| `src/components/NotificationCenter.tsx` | New file — unified alert dropdown |

## Implementation Order

1. Phase 1 first (layout + nav) — biggest visual impact, lowest risk
2. Phase 2 second (audit flow) — requires careful state management
3. Phase 3 last (cross-linking) — incremental polish

Total: ~13 files touched, 2 new files, 1 file removed.

