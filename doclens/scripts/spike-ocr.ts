/**
 * Phase 0 spike — run before building anything on top of this.
 *
 * Answers the questions the whole design rests on:
 *   1. Does OCR read Japanese invoices well enough to be useful?
 *   2. Are block bounding boxes actually populated, and in what coordinate space?
 *   3. Does document_annotation return the fields we asked for?
 *   4. What does one page cost in latency?
 *
 * Usage:
 *   cp .env.example .env.local   # add your key
 *   mkdir -p scripts/samples     # drop a few real invoices in
 *   npm run spike:ocr -- scripts/samples/invoice.pdf
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

import { Mistral } from "@mistralai/mistralai";

import { EXTRACTION_PROMPT, InvoiceFields, invoiceJsonSchema } from "../src/lib/schema";

const OUT_DIR = join(process.cwd(), "scripts", "out");

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: npm run spike:ocr -- <path-to-pdf-or-image>");
    process.exit(1);
  }

  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    console.error("MISTRAL_API_KEY is not set (expected in .env.local).");
    process.exit(1);
  }

  const client = new Mistral({ apiKey });
  const bytes = new Uint8Array(await readFile(path));
  const fileName = basename(path);

  console.log(`file      : ${fileName} (${(bytes.byteLength / 1024).toFixed(0)} KB)`);

  const uploaded = await client.files.upload({
    purpose: "ocr",
    file: { fileName, content: bytes },
  });

  const startedAt = Date.now();
  const response = await client.ocr.process({
    model: process.env.MISTRAL_OCR_MODEL ?? "mistral-ocr-latest",
    document: { type: "file", fileId: uploaded.id },
    includeBlocks: true,
    confidenceScoresGranularity: "block",
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
  const elapsedMs = Date.now() - startedAt;

  await client.files.delete({ fileId: uploaded.id }).catch(() => undefined);

  // --- 1 & 4: throughput -------------------------------------------------
  const pageCount = response.pages.length;
  console.log(`model     : ${response.model}`);
  console.log(`pages     : ${pageCount} (billed: ${response.usageInfo?.pagesProcessed ?? "?"})`);
  console.log(`latency   : ${elapsedMs} ms total, ${Math.round(elapsedMs / Math.max(pageCount, 1))} ms/page`);

  // --- 2: bounding boxes -------------------------------------------------
  console.log("\n--- blocks ---");
  for (const page of response.pages) {
    const blocks = page.blocks ?? [];
    const dims = page.dimensions;
    console.log(
      `page ${page.index}: ${blocks.length} blocks, ` +
        `dimensions ${dims ? `${dims.width}x${dims.height} @ ${dims.dpi}dpi` : "MISSING"}`,
    );

    if (!dims) {
      console.log("  !! no dimensions — bbox cannot be normalised, highlights will not work");
    }

    for (const block of blocks.slice(0, 3) as Array<Record<string, unknown>>) {
      const content = typeof block.content === "string" ? block.content : "";
      console.log(
        `  [${String(block.type)}] ` +
          `(${block.topLeftX},${block.topLeftY})-(${block.bottomRightX},${block.bottomRightY}) ` +
          JSON.stringify(content.slice(0, 60)),
      );
    }
  }

  // --- 3: structured extraction -----------------------------------------
  console.log("\n--- document annotation ---");
  if (!response.documentAnnotation) {
    console.log("!! empty — structured extraction did not return anything");
  } else {
    const parsed = InvoiceFields.safeParse(JSON.parse(response.documentAnnotation));
    if (parsed.success) {
      console.log(JSON.stringify(parsed.data, null, 2));
    } else {
      console.log("!! failed schema validation:");
      console.log(response.documentAnnotation);
      console.log(parsed.error.issues);
    }
  }

  await mkdir(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, `${basename(path, extname(path))}.json`);
  await writeFile(outPath, JSON.stringify(response, null, 2));
  console.log(`\nfull response written to ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
