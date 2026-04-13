// Asset Types
export type AssetType = 'MAIN' | 'SECONDARY';

// Product Identity Card — extracted from MAIN image for cross-image consistency
export interface ProductIdentityCard {
  brandName: string;
  productName: string;
  dominantColors: string[];  // hex values
  packagingType: string;
  shapeDescription: string;
  labelText: string[];
  keyVisualFeatures: string[];
  productDescriptor: string; // paragraph for prompt injection
}

// Fix method used to generate the fixed image
export type FixMethod = 'bg-segmentation' | 'full-regeneration' | 'surgical-edit' | 'enhancement';

// Fix strategy selected by the fix plan engine
export type FixStrategy = 'bg-cleanup' | 'crop-reframe' | 'overlay-removal' | 'inpaint-edit' | 'full-regeneration' | 'skip';

// Structured fix plan produced before generation
export interface FixPlan {
  strategy: FixStrategy;
  targetRuleIds: string[];
  category: string;
  imageType: 'MAIN' | 'SECONDARY';
  preserve: string[];
  permitted: string[];
  remove: string[];
  prohibited: string[];
  categoryConstraints: string[];
}

export interface ImageAsset {
  id: string;
  file: File;
  preview: string;
  type: AssetType;
  name: string;
  sourceUrl?: string;      // Original Amazon image URL
  contentHash?: string;    // SHA-256 hash for deduplication
  analysisResult?: AnalysisResult;
  analysisError?: string;  // Error message when analysis fails
  fixedImage?: string;
  fixMethod?: FixMethod;   // Which AI pattern was used to fix
  isAnalyzing?: boolean;
  isGeneratingFix?: boolean;
  // Persisted fix review data — survives after fixProgress is cleared
  fixAttempts?: FixAttempt[];
  bestAttemptSelection?: BestAttemptSelection;
  selectedAttemptIndex?: number;
  fixStopReason?: string;
  lastFixStrategy?: FixStrategy;
  /** Batch fix queue status for UI rendering */
  batchFixStatus?: 'pending' | 'processing' | 'fixed' | 'failed' | 'skipped';
  /** Why this asset was skipped in batch fix */
  batchSkipReason?: string;
  /** Fixability classification tier from fixability layer */
  fixabilityTier?: 'auto_fixable' | 'warn_only' | 'manual_review';
  /** Recommended next action for skipped/manual-review images */
  manualReviewAction?: string;
}

// Analysis Types
export interface BackgroundCheck {
  isCompliant: boolean;
  detectedColor: string;
  message: string;
}

export interface TextOverlayCheck {
  isCompliant: boolean;
  detectedText: string[];
  message: string;
}

export interface ProductOccupancy {
  percentage: number;
  isCompliant: boolean;
  message: string;
}

export interface ImageQuality {
  score: number;
  issues: string[];
  message: string;
}

export interface MainImageAnalysis {
  backgroundCheck: BackgroundCheck;
  textOverlayCheck: TextOverlayCheck;
  productOccupancy: ProductOccupancy;
  imageQuality: ImageQuality;
}

export interface ContentConsistency {
  packagingTextDetected: string;
  discrepancies: string[];
  isConsistent: boolean;
}

export interface Violation {
  severity: 'critical' | 'warning' | 'info';
  category: string;
  message: string;
  recommendation: string;
  affectedZone?: string; // ID of the affected spatial zone
  rule_id?: string;      // Policy rule that triggered this
  evidence?: {
    rule_id: string;
    source: string;
    why_triggered: string;
    measured_value: string | number;
    threshold: string | number;
    bounding_box?: { top: number; left: number; width: number; height: number };
    ocr_snippet?: string;
  };
}

// Spatial Analysis Types for zone-aware editing
export interface SpatialBounds {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface TextZone {
  id: string;
  location: string;
  bounds?: SpatialBounds;
  content: string;
  protection: 'CRITICAL' | 'HIGH' | 'MEDIUM';
}

export interface ProductZone {
  id: string;
  location: string;
  bounds?: SpatialBounds;
  coverage: number;
  type: 'packaged-product' | 'unpackaged-product' | 'lifestyle-shot' | 'demonstration';
}

export interface OverlayElement {
  id: string;
  type: 'logo' | 'watermark' | 'badge' | 'promotional-text';
  location: string;
  bounds?: SpatialBounds;
  isPartOfPackaging: boolean;
  action: 'remove' | 'preserve' | 'inpaint';
}

export interface ProtectedArea {
  id: string;
  reason: string;
  bounds?: SpatialBounds;
  description: string;
}

export interface SpatialAnalysis {
  textZones?: TextZone[];
  productZones?: ProductZone[];
  overlayElements?: OverlayElement[];
  protectedAreas?: ProtectedArea[];
}

export interface AnalysisResult {
  overallScore: number;
  status: 'PASS' | 'WARNING' | 'FAIL';
  policyStatus?: 'pass' | 'warning' | 'fail';
  qualityScore?: number;
  scoringRationale?: string;
  productCategory?: string;
  mainImageAnalysis?: MainImageAnalysis;
  contentConsistency?: ContentConsistency;
  spatialAnalysis?: SpatialAnalysis; // Zone mapping for AI editing
  violations: Violation[];
  fixRecommendations: string[];
  generativePrompt?: string;
  deterministicFindings?: DeterministicFindingSummary[];
}

/** Compact summary of a deterministic finding stored on AnalysisResult */
export interface DeterministicFindingSummary {
  rule_id: string;
  severity: 'critical' | 'warning' | 'info';
  passed: boolean;
  message: string;
  evidence?: {
    rule_id: string;
    source: string;
    why_triggered: string;
    measured_value: string | number;
    threshold: string | number;
  };
}

// Verification Types
export interface ComponentScores {
  identity: number;
  compliance: number;
  quality: number;
  noNewIssues: number;
  textLayout?: number; // Text/layout preservation score
  noAdditions?: number; // No new elements added score
  contextPreservation?: number; // Scene/context preservation (lifestyle, product-in-use)
  labelFidelity?: number; // Label/printed text preservation (packaging)
  layoutPreservation?: number; // Layout/text structure preservation (infographic)
}

export interface VerificationResult {
  score: number;
  isSatisfactory: boolean;
  productMatch: boolean;
  textPreserved?: boolean;
  noElementsAdded?: boolean;
  componentScores?: ComponentScores;
  critique: string;
  improvements: string[];
  passedChecks: string[];
  failedChecks: string[];
  textIssues?: string[];
  addedElements?: string[];
  thinkingSteps?: string[]; // AI's step-by-step reasoning for live display
}

// Fix Generation Types
export type FixTier = 'gemini-flash';

// Retry decision produced by the retry planner
export interface RetryDecision {
  shouldContinue: boolean;
  nextStrategy: FixStrategy;
  rationale: string;
  tightenedPreserve: string[];
  tightenedProhibited: string[];
  additionalInstructions: string[];
  stopReason?: string;
}

export interface FixAttempt {
  attempt: number;
  generatedImage: string;
  verification?: VerificationResult;
  status: 'generating' | 'verifying' | 'passed' | 'failed' | 'error';
  fixTier?: FixTier; // Which AI tier was used
  logs?: LogEntry[]; // Logs specific to this attempt
  retryDecision?: RetryDecision; // Retry planner output for this attempt
  strategyUsed?: FixStrategy; // Which strategy was used for this attempt
  isBestAttempt?: boolean; // Whether this was selected as the best attempt
}

// Best attempt selection result
export interface BestAttemptSelection {
  selectedAttemptIndex: number;
  selectedReason: string;
  selectionType: 'score-driven' | 'safety-driven';
}

// Fix Progress with intermediate state
export interface FixProgressState {
  attempt: number;
  maxAttempts: number;
  currentStep: 'generating' | 'verifying' | 'retrying' | 'complete' | 'error';
  intermediateImage?: string; // Show image immediately when generated
  attempts: FixAttempt[]; // History of all attempts
  thinkingSteps: string[]; // Live AI reasoning
  lastCritique?: string;
  customPrompt?: string; // User's custom prompt override
  bestAttemptSelection?: BestAttemptSelection; // Which attempt was chosen as best
  stopReason?: string; // Why retries stopped early
}

// Mode for optimize modal
export type OptimizeMode = 'fix' | 'enhance';

// Scraping Types
// Content-based categories (not position-based)
// PRODUCT_SHOT = clean product on white background (what Amazon requires for first position)
export type ImageCategory = 'PRODUCT_SHOT' | 'INFOGRAPHIC' | 'LIFESTYLE' | 'PRODUCT_IN_USE' | 'SIZE_CHART' | 'COMPARISON' | 'PACKAGING' | 'DETAIL' | 'APLUS' | 'UNKNOWN';

export interface ScrapedImage {
  url: string;
  category: ImageCategory;
  index: number;
  confidence?: number; // AI classification confidence 0-100
  reasoning?: string;  // AI reasoning for the classification
}

export interface ScrapedProduct {
  asin: string;
  title: string;
  images: ScrapedImage[];
  bullets?: string[];
}

// Activity Log Types
export type LogLevel = 'info' | 'success' | 'warning' | 'error' | 'processing';

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  message: string;
}

// Application State
export interface AppState {
  assets: ImageAsset[];
  listingTitle: string;
  amazonUrl: string;
  isImporting: boolean;
  isAnalyzing: boolean;
  logs: LogEntry[];
  selectedAssetId: string | null;
  showFixModal: boolean;
  productIdentity?: ProductIdentityCard; // Extracted from MAIN image
  identityProfile?: import('@/utils/identityProfile').MultiImageIdentityProfile;
}

// Failed Download Types
export interface FailedDownload {
  url: string;
  reason: string;
  timestamp: Date;
}

// Enhancement Analysis Types
export interface ProductVisibilityAnalysis {
  score: number;
  isProductClearlyVisible: boolean;
  productBounds: SpatialBounds | null;
  issues: string[];
}

export interface MainImageComparison {
  sameProductDetected: boolean;
  productMatchScore: number;
  missingElements: string[];
}

export interface ContentQualityAnalysis {
  lifestyleContextAppropriate: boolean;
  infographicTextReadable: boolean;
  featureHighlightsPresent: boolean;
  callToActionStrength: number;
  overallQuality: number;
}

export interface EnhancementSuggestion {
  id: string;
  type: string;
  priority: 'high' | 'medium' | 'low';
  description: string;
  expectedImprovement: string;
}

export interface EnhancementAnalysis {
  imageCategory: ImageCategory;
  productVisibility: ProductVisibilityAnalysis;
  comparisonWithMain: MainImageComparison;
  contentQuality: ContentQualityAnalysis;
  enhancementOpportunities: EnhancementSuggestion[];
  recommendedPresets: string[];
}

// Enhancement Request Types
export interface EnhancementRequest {
  originalImage: string;
  mainProductImage: string;
  imageCategory: ImageCategory;
  enhancementType: string;
  targetImprovements: string[];
  preserveElements: string[];
  customPrompt?: string;
}

export interface EnhancementResult {
  enhancedImage: string;
  enhancementApplied: string[];
  qualityScoreBefore: number;
  qualityScoreAfter: number;
  productConsistency: boolean;
}

// Style Consistency Analysis
export interface StyleDimensionScore {
  score: number;
  assessment: string;
  issues: string[];
}

export interface StyleConsistencyResult {
  overallScore: number;
  verdict: string;
  dimensions: {
    colorPalette: StyleDimensionScore;
    lighting: StyleDimensionScore;
    typography: StyleDimensionScore;
    productAngle: StyleDimensionScore;
    background: StyleDimensionScore;
    brandIdentity: StyleDimensionScore;
  };
  recommendations: string[];
  weakestPairs: Array<{ imageA: number; imageB: number; reason: string }>;
}
