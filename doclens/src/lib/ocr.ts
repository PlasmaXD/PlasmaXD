import "server-only";

import { findAnchors } from "./anchor";
import { env, limits } from "./env";
import { mistral } from "./mistral";
import { EXTRACTION_PROMPT, InvoiceFields, invoiceJsonSchema } from "./schema";
import type { Box, DocumentResult, OcrBlock, PageInfo } from "./types";

/**
 * Shape of the block objects the OCR endpoint returns. The SDK types these as a
 * discriminated union of a dozen block kinds; all we need is the rectangle and
 * whatever text the block carries, so we read them structurally.
 */
type RawBlock = {
  type?: string;
  topLeftX?: number;
  topLeftY?: number;
  bottomRightX?: number;
  bottomRightY?: number;
  content?: unknown;
};

function toBox(
  block: RawBlock,
  pageWidth: number,
  pageHeight: number,
): Box | null {
  const { topLeftX, topLeftY, bottomRightX, bottomRightY } = block;
  if (
    typeof topLeftX !== "number" ||
    typeof topLeftY !== "number" ||
    typeof bottomRightX !== "number" ||
    typeof bottomRightY !== "number" ||
    pageWidth <= 0 ||
    pageHeight <= 0
  ) {
    return null;
  }

  const x = topLeftX / pageWidth;
  const y = topLeftY / pageHeight;
  const w = (bottomRightX - topLeftX) / pageWidth;
  const h = (bottomRightY - topLeftY) / pageHeight;
  if (w <= 0 || h <= 0) return null;

  return { x, y, w, h };
}

/**
 * Parses the JSON string returned in `documentAnnotation`.
 *
 * A model can return syntactically valid JSON that is semantically wrong, so the
 * result goes through the same Zod schema the request was generated from. On
 * failure we surface empty fields rather than half-parsed garbage — a visibly
 * empty table is recoverable, silently wrong numbers are not.
 */
function parseFields(annotation: string | null | undefined): InvoiceFields {
  const empty: InvoiceFields = {
    issueDate: null,
    vendor: null,
    invoiceNumber: null,
    subtotal: null,
    tax: null,
    total: null,
    currency: null,
    lineItems: [],
  };
  if (!annotation) return empty;

  try {
    const parsed = InvoiceFields.safeParse(JSON.parse(annotation));
    return parsed.success ? parsed.data : empty;
  } catch {
    return empty;
  }
}

/**
 * Runs a single document through OCR + structured extraction.
 *
 * Both happen in one API call: `documentAnnotationFormat` makes the OCR endpoint
 * return the structured fields alongside the page content, which is cheaper and
 * a round-trip faster than OCR-then-chat.
 */
export async function processDocument(
  id: string,
  fileName: string,
  mimeType: string,
  bytes: Uint8Array,
): Promise<DocumentResult> {
  const client = mistral();

  const uploaded = await client.files.upload({
    purpose: "ocr",
    file: { fileName, content: bytes },
  });

  try {
    const response = await client.ocr.process({
      model: env.ocrModel,
      document: { type: "file", fileId: uploaded.id },
      pages: Array.from({ length: limits.maxPagesPerFile }, (_, i) => i),
      includeBlocks: true,
      documentAnnotationFormat: {
        type: "json_schema",
        jsonSchema: {
          name: "invoice_fields",
          schemaDefinition: invoiceJsonSchema(),
          strict: true,
        },
      },
      documentAnnotationPrompt: EXTRACTION_PROMPT,
    });

    const pages: PageInfo[] = [];
    const blocks: OcrBlock[] = [];

    for (const page of response.pages) {
      // Without dimensions there is no pixel space to normalise against, so the
      // page still renders and its text is still searchable — only the
      // highlight overlay is unavailable.
      const width = page.dimensions?.width ?? 0;
      const height = page.dimensions?.height ?? 0;
      pages.push({ index: page.index, width, height });

      for (const raw of (page.blocks ?? []) as RawBlock[]) {
        const box = toBox(raw, width, height);
        if (!box) continue;
        const content = typeof raw.content === "string" ? raw.content : "";
        if (!content.trim()) continue;
        blocks.push({
          page: page.index,
          box,
          content,
          type: raw.type ?? "text",
        });
      }
    }

    const fields = parseFields(response.documentAnnotation);

    return {
      id,
      fileName,
      mimeType,
      pages,
      blocks,
      fields,
      anchors: findAnchors(fields, blocks),
      pagesProcessed: response.usageInfo?.pagesProcessed ?? pages.length,
    };
  } finally {
    // Uploaded documents are user data; don't leave them sitting in the
    // workspace after we've extracted what we need.
    await client.files.delete({ fileId: uploaded.id }).catch(() => undefined);
  }
}
