/**
 * Amazon title rules based on the January 21, 2025 rule set.
 * Each rule has a deterministic check function and structured guidance.
 */

export interface TitleRule {
  id: string;
  name: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
  reference: string;
  guidance: string;
  check: (title: string, category?: string) => TitleRuleResult;
}

export interface TitleRuleResult {
  passed: boolean;
  message: string;
}

// Characters prohibited in Amazon titles (Jan 2025 update)
const PROHIBITED_CHARS = /[~!$?_{}^¬¦<>]/;

// Promotional phrases prohibited in titles
const PROMOTIONAL_PHRASES = [
  'best seller', 'bestseller', '#1', 'number one', 'hot item', 'top rated',
  'top-rated', 'limited time', 'sale', 'free shipping', 'buy now',
  'deal of the day', 'lowest price', 'guaranteed', 'save now',
  'discount', 'clearance', 'hurry', 'act now', 'order now',
];

// Subjective/unverifiable claims
const SUBJECTIVE_CLAIMS = [
  'amazing', 'best quality', 'perfect', 'incredible', 'unbelievable',
  'world\'s best', 'the best', 'most popular', 'must have', 'must-have',
  'revolutionary', 'game changer', 'game-changer', 'miracle',
];

export const TITLE_RULES: TitleRule[] = [
  {
    id: 'char_limit',
    name: 'Character Limit',
    description: '200-character maximum for most categories',
    severity: 'critical',
    reference: 'Amazon Title Requirements (Jan 21, 2025)',
    guidance: 'Shorten your title to 200 characters or fewer. Remove filler words and redundant descriptors.',
    check: (title, _category) => {
      const limit = 200;
      const len = title.length;
      if (len <= limit) return { passed: true, message: `Title is ${len} characters (within ${limit} limit)` };
      return { passed: false, message: `Title is ${len} characters — exceeds the ${limit}-character limit by ${len - limit}` };
    },
  },
  {
    id: 'all_caps',
    name: 'No ALL CAPS Words',
    description: 'Words should not be in all capitals unless they are brand names, acronyms, or standard abbreviations',
    severity: 'warning',
    reference: 'Amazon Title Requirements (Jan 21, 2025)',
    guidance: 'Use title case or sentence case. Only brand names, acronyms (USB, LED, SPF), and standard abbreviations may be capitalized.',
    check: (title) => {
      const words = title.split(/\s+/);
      // Allow short acronyms (<=4 chars) and common units
      const commonAcronyms = new Set(['USB', 'LED', 'SPF', 'UV', 'AC', 'DC', 'HD', 'UK', 'US', 'EU', 'XL', 'XXL', 'CBD', 'THC', 'FDA', 'EPA', 'BPA', 'GMO', 'OZ', 'ML', 'MG', 'LB', 'KG', 'PC', 'PCS', 'CT', 'PK', 'QTY']);
      const capsWords = words.filter(w => {
        const clean = w.replace(/[^A-Za-z]/g, '');
        if (clean.length <= 1) return false;
        if (clean.length <= 4 && commonAcronyms.has(clean)) return false;
        return clean === clean.toUpperCase() && clean.length > 1;
      });
      if (capsWords.length === 0) return { passed: true, message: 'No ALL CAPS violations found' };
      return { passed: false, message: `ALL CAPS words found: ${capsWords.slice(0, 5).join(', ')}. Use title case instead.` };
    },
  },
  {
    id: 'special_chars',
    name: 'No Prohibited Special Characters',
    description: 'Characters like ~, !, $, ?, _, {, }, ^, ¬, ¦ are not allowed',
    severity: 'warning',
    reference: 'Amazon Title Requirements (Jan 21, 2025)',
    guidance: 'Remove special characters. Use only letters, numbers, hyphens, commas, periods, ampersands, and parentheses.',
    check: (title) => {
      const matches = title.match(PROHIBITED_CHARS);
      if (!matches) return { passed: true, message: 'No prohibited special characters found' };
      const found = [...new Set(title.split('').filter(c => PROHIBITED_CHARS.test(c)))];
      return { passed: false, message: `Prohibited characters found: ${found.join(' ')}` };
    },
  },
  {
    id: 'promotional_language',
    name: 'No Promotional Language',
    description: 'Titles must not contain promotional phrases like "Best Seller", "Hot Item", "#1", "Limited Time"',
    severity: 'critical',
    reference: 'Amazon Title Requirements (Jan 21, 2025)',
    guidance: 'Remove all promotional language. Focus on descriptive product attributes instead.',
    check: (title) => {
      const lower = title.toLowerCase();
      const found = PROMOTIONAL_PHRASES.filter(p => lower.includes(p));
      if (found.length === 0) return { passed: true, message: 'No promotional language detected' };
      return { passed: false, message: `Promotional language found: "${found.join('", "')}"` };
    },
  },
  {
    id: 'subjective_claims',
    name: 'No Subjective Claims',
    description: 'Avoid unverifiable superlatives like "Amazing", "Best Quality", "Perfect"',
    severity: 'warning',
    reference: 'Amazon Title Requirements (Jan 21, 2025)',
    guidance: 'Replace subjective claims with specific, measurable attributes (e.g., "FDA-Approved" instead of "Best Quality").',
    check: (title) => {
      const lower = title.toLowerCase();
      const found = SUBJECTIVE_CLAIMS.filter(p => lower.includes(p));
      if (found.length === 0) return { passed: true, message: 'No subjective claims detected' };
      return { passed: false, message: `Subjective claims found: "${found.join('", "')}"` };
    },
  },
  {
    id: 'keyword_stuffing',
    name: 'No Keyword Stuffing',
    description: 'Same word should not appear 3+ times in the title',
    severity: 'warning',
    reference: 'Amazon Title Requirements (Jan 21, 2025)',
    guidance: 'Remove repeated keywords. Use each important keyword once in a natural reading order.',
    check: (title) => {
      const words = title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
      const counts: Record<string, number> = {};
      for (const w of words) counts[w] = (counts[w] || 0) + 1;
      const repeated = Object.entries(counts).filter(([_, c]) => c >= 3).map(([w, c]) => `"${w}" (${c}×)`);
      if (repeated.length === 0) return { passed: true, message: 'No keyword stuffing detected' };
      return { passed: false, message: `Repeated keywords: ${repeated.join(', ')}` };
    },
  },
  {
    id: 'brand_first',
    name: 'Brand Name First',
    description: 'Title should start with the brand name',
    severity: 'info',
    reference: 'Amazon Title Best Practices (Jan 21, 2025)',
    guidance: 'Place the brand name at the beginning of the title for better search visibility and brand recognition.',
    check: (title) => {
      // Heuristic: first word/phrase before a separator is likely the brand
      const firstSegment = title.split(/[-–—,|]/)[0].trim();
      if (firstSegment.length > 0 && firstSegment.length < title.length * 0.4) {
        return { passed: true, message: `Title starts with "${firstSegment}" (likely brand)` };
      }
      return { passed: false, message: 'Could not identify a clear brand at the start of the title. Consider starting with your brand name.' };
    },
  },
];

export function getCharLimitForCategory(category?: string): number {
  // Most categories use 200; can be extended per-category in future
  if (category === 'BOOKS') return 200;
  return 200;
}
