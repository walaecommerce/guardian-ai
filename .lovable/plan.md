

# Add Keyboard Shortcut Tooltips to Command Bar Buttons

## What Changes

Wrap the three command bar action buttons (Import, Run Audit, Fix All) with `Tooltip` components that show their keyboard shortcut on hover.

## Files to Edit

**`src/components/CommandBar.tsx`**

1. Import `Tooltip, TooltipTrigger, TooltipContent, TooltipProvider` from `@/components/ui/tooltip`
2. Wrap the entire command bar return in `<TooltipProvider delayDuration={300}>`
3. Wrap each desktop action button in a `Tooltip` + `TooltipTrigger`/`TooltipContent`:
   - **Import button** → tooltip: `⌘I`
   - **Run Audit button** → tooltip: `⌘A`
   - **Fix All button** → tooltip: `⌘F`
   - **Save button** → no shortcut, skip tooltip
4. Tooltip content styled with a small `<kbd>` element for the shortcut key, e.g. `<kbd className="...">⌘A</kbd>`

No changes to mobile dropdown items (tooltips don't apply on touch).

