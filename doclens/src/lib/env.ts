import "server-only";

/**
 * Server-side configuration. The API key is read here and nowhere else, so it
 * can never be pulled into a client bundle by accident.
 */
export const env = {
  get apiKey(): string {
    const key = process.env.MISTRAL_API_KEY;
    if (!key) {
      throw new Error(
        "MISTRAL_API_KEY is not set. Copy .env.example to .env.local and fill it in.",
      );
    }
    return key;
  },
  ocrModel: process.env.MISTRAL_OCR_MODEL ?? "mistral-ocr-latest",
};

/** Upload limits, enforced before anything is sent to Mistral. */
export const limits = {
  maxFileBytes: 20 * 1024 * 1024,
  maxFilesPerJob: 10,
  /** Guards against a 500-page PDF quietly costing 100x what the user expects. */
  maxPagesPerFile: 50,
  acceptedTypes: [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/avif",
  ],
} as const;
