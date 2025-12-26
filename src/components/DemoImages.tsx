// Demo images with intentional violations for hackathon demo
// These are pre-prepared "bad" images that showcase the Guardian's capabilities

export interface DemoImage {
  id: string;
  name: string;
  description: string;
  violations: string[];
  // Base64 placeholder - in production these would be actual images
  // For demo, we'll use URLs that can be easily replaced
  imageUrl: string;
}

// Demo product info
export const DEMO_PRODUCT = {
  asin: 'B08DEMO123',
  title: 'Premium Stainless Steel Water Bottle - 32oz Vacuum Insulated',
  url: 'https://amazon.com/dp/B08DEMO123'
};

// Demo images with known violations
// These showcase different types of issues Guardian can detect
export const DEMO_IMAGES: DemoImage[] = [
  {
    id: 'demo_main_1',
    name: 'MAIN_product_gray_bg.jpg',
    description: 'Main image with non-white background',
    violations: ['Gray background instead of pure white', 'Product only fills 60% of frame'],
    imageUrl: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=800&auto=format&fit=crop&q=80'
  },
  {
    id: 'demo_main_2', 
    name: 'MAIN_product_badge.jpg',
    description: 'Main image with "Best Seller" badge',
    violations: ['Unauthorized "Best Seller" promotional badge', 'Text overlay on main image'],
    imageUrl: 'https://images.unsplash.com/photo-1523362628745-0c100150b504?w=800&auto=format&fit=crop&q=80'
  },
  {
    id: 'demo_lifestyle_1',
    name: 'LIFESTYLE_kitchen_scene.jpg',
    description: 'Lifestyle image with watermark',
    violations: ['Stock photo watermark visible', 'Brand logo overlay'],
    imageUrl: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&auto=format&fit=crop&q=80'
  },
  {
    id: 'demo_infographic_1',
    name: 'INFOGRAPHIC_features.jpg',
    description: 'Infographic with Amazon Choice badge',
    violations: ['Unauthorized "Amazon\'s Choice" badge', 'Star rating overlay'],
    imageUrl: 'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=800&auto=format&fit=crop&q=80'
  }
];

// Function to load demo images as Files for the app
export async function loadDemoImages(): Promise<{ files: File[], product: typeof DEMO_PRODUCT }> {
  const files: File[] = [];
  
  for (const demo of DEMO_IMAGES) {
    try {
      const response = await fetch(demo.imageUrl);
      const blob = await response.blob();
      const file = new File([blob], demo.name, { type: 'image/jpeg' });
      files.push(file);
    } catch (error) {
      console.error(`Failed to load demo image: ${demo.name}`, error);
    }
  }
  
  return { files, product: DEMO_PRODUCT };
}

// Quick info about demo violations for display
export function getDemoViolationsSummary(): string[] {
  return [
    '🎯 Non-white backgrounds (violates Main Image policy)',
    '🏷️ Promotional badges like "Best Seller" (prohibited)',
    '💧 Watermarks and stock photo marks',
    '⭐ Star ratings and "Amazon\'s Choice" overlays',
    '📐 Incorrect product framing (< 85% occupancy)'
  ];
}
