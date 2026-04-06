export const MODELS = {
  analysis: "gemini-3.1-pro-preview",
  imageGen: "google/gemini-3-pro-image-preview",
  imageEdit: "google/gemini-3.1-flash-image-preview",
  verification: "gemini-3.1-pro-preview"
} as const;

export const IMAGE_CONFIG = {
  aspectRatio: "1:1",
  imageSize: "2K"
} as const;

export const THINKING_CONFIG = {
  thinkingLevel: "High"
} as const;

export const RATE_LIMITS = {
  delayBetweenRequests: 10000,
  batchCooldownEvery: 3,
  batchCooldownDuration: 20000,
  retryDelayBase: 10000,
  maxRetries: 3,
  verificationThreshold: 85
} as const;
