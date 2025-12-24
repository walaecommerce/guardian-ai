// Asset Types
export type AssetType = 'MAIN' | 'SECONDARY';

export interface ImageAsset {
  id: string;
  file: File;
  preview: string;
  type: AssetType;
  name: string;
  analysisResult?: AnalysisResult;
  fixedImage?: string;
  isAnalyzing?: boolean;
  isGeneratingFix?: boolean;
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
}

export interface AnalysisResult {
  overallScore: number;
  status: 'PASS' | 'FAIL';
  mainImageAnalysis?: MainImageAnalysis;
  contentConsistency?: ContentConsistency;
  violations: Violation[];
  fixRecommendations: string[];
  generativePrompt?: string;
}

// Verification Types
export interface ComponentScores {
  identity: number;
  compliance: number;
  quality: number;
  noNewIssues: number;
}

export interface VerificationResult {
  score: number;
  isSatisfactory: boolean;
  productMatch: boolean;
  componentScores?: ComponentScores;
  critique: string;
  improvements: string[];
  passedChecks: string[];
  failedChecks: string[];
  thinkingSteps?: string[]; // AI's step-by-step reasoning for live display
}

// Fix Generation Types
export interface FixAttempt {
  attempt: number;
  generatedImage: string;
  verification?: VerificationResult;
  status: 'generating' | 'verifying' | 'passed' | 'failed' | 'error';
  logs?: LogEntry[]; // Logs specific to this attempt
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
}

// Mode for optimize modal
export type OptimizeMode = 'fix' | 'enhance';

// Scraping Types
// Content-based categories (not position-based)
// PRODUCT_SHOT = clean product on white background (what Amazon requires for first position)
export type ImageCategory = 'PRODUCT_SHOT' | 'INFOGRAPHIC' | 'LIFESTYLE' | 'PRODUCT_IN_USE' | 'SIZE_CHART' | 'COMPARISON' | 'PACKAGING' | 'DETAIL' | 'UNKNOWN';

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
}
