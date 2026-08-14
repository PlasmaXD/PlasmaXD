import { SCORED_FIELDS } from "./schema";
import type { JobDocument } from "./types";

const COLUMNS = [
  "fileName",
  "issueDate",
  "vendor",
  "invoiceNumber",
  "subtotal",
  "tax",
  "total",
  "currency",
] as const;

function escape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Flattens completed documents into one row each.
 *
 * Prefixed with a UTF-8 BOM because the main consumer is Excel, which otherwise
 * renders Japanese vendor names as mojibake.
 */
export function toCsv(documents: readonly JobDocument[]): string {
  const rows = [COLUMNS.join(",")];

  for (const doc of documents) {
    if (!doc.result) continue;
    const fields = doc.result.fields as Record<string, unknown>;
    rows.push(
      COLUMNS.map((column) =>
        escape(column === "fileName" ? doc.fileName : fields[column]),
      ).join(","),
    );
  }

  return `﻿${rows.join("\n")}\n`;
}

export { COLUMNS, SCORED_FIELDS };
