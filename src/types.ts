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
export interface VerificationResult {
  score: number;
  isSatisfactory: boolean;
  productMatch: boolean;
  critique: string;
  improvements: string[];
  passedChecks: string[];
  failedChecks: string[];
}

// Fix Generation Types
export interface FixAttempt {
  attempt: number;
  generatedImage: string;
  verification?: VerificationResult;
  status: 'generating' | 'verifying' | 'passed' | 'failed' | 'error';
}

// Scraping Types
export interface ScrapedProduct {
  asin: string;
  title: string;
  images: string[];
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
