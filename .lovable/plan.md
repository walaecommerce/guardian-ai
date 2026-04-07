

## Add Analyzing Progress Indicator

### What changes
Add an "Analyzing 3/8..." progress banner to `AuditStep.tsx` that appears during the audit run, showing how many images have been analyzed so far.

### Files to modify

**`src/components/audit/AuditStep.tsx`**

Add a progress banner between the image gallery and the scorecard that renders when `isAnalyzing` is true:

- Shows: `Analyzing {analyzedAssets.length}/{assets.length}...` with a spinning loader icon
- Includes a `<Progress>` bar showing percentage complete (`analyzedAssets.length / assets.length * 100`)
- Renders inside the existing `isAnalyzing && analyzedAssets.length < assets.length` block, just above the image grid
- Uses existing `Loader2` icon (already imported) and `Progress` component from UI library

This is a single-component, ~10 line addition. No prop or hook changes needed — `analyzedAssets.length` and `assets.length` are already computed.

