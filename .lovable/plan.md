

# Product Identity Card Display Panel

## Overview
Add a collapsible card in the left sidebar (below ComplianceReportCard, above PolicySidebar) that shows the extracted product identity — brand, colors, shape, label text, and key features. Only visible after identity extraction completes.

## New Component: `src/components/ProductIdentityPanel.tsx`

A card component that receives `ProductIdentityCard | null` and renders:
- **Header**: "Product Identity" with a fingerprint icon and collapse toggle
- **Brand & Product**: Bold brand name, product name below
- **Color Swatches**: Row of circular swatches from `dominantColors` hex values with hex labels on hover
- **Packaging Type**: Badge showing packagingType
- **Shape**: Short text from shapeDescription
- **Label Text**: Scrollable list of detected label text items as small badges
- **Key Features**: Bullet list of keyVisualFeatures
- Collapsed by default after first view; uses the existing Collapsible UI component

Styling: Uses `glass-card` pattern with primary accent border matching existing sidebar cards.

## Index.tsx Update

Add the panel between the `ComplianceReportCard` and `PolicySidebar` blocks (~line 1419), passing `productIdentity` state:

```tsx
{productIdentity && (
  <ProductIdentityPanel identity={productIdentity} />
)}
```

## Files Changed

| File | Change |
|---|---|
| `src/components/ProductIdentityPanel.tsx` | New component |
| `src/pages/Index.tsx` | Import + render in left sidebar |

