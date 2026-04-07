export const MODELS = {
  analysis: "google/gemini-3.1-pro",
  imageGen: "google/gemini-3-flash-image",
  imageEdit: "google/gemini-3-flash-image",
  verification: "google/gemini-3.1-pro"
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
