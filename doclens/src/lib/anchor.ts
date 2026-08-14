import type { Anchor, OcrBlock } from "./types";

/**
 * Links extracted field values back to the OCR block they came from, so the UI
 * can highlight the source when a user clicks a cell.
 *
 * This is deliberately deterministic string matching rather than a second LLM
 * call: it costs nothing, it cannot hallucinate a citation, and when it fails it
 * fails visibly (no highlight) instead of pointing at the wrong place.
 */

/** Full-width digits and punctuation are common in Japanese documents. */
function toHalfWidth(input: string): string {
  return input.replace(/[！-～]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0),
  );
}

/** Strips everything that varies between "the value" and "how it was printed". */
function normalise(input: string): string {
  return toHalfWidth(input)
    .toLowerCase()
    .replace(/[\s　]/g, "")
    .replace(/[,，]/g, "")
    .replace(/[¥$€£円]/g, "");
}

/**
 * Candidate strings a value might have been printed as.
 * Dates are the interesting case: we normalise them to YYYY-MM-DD during
 * extraction, but the document may show 2024/5/1 or 令和6年5月1日.
 */
function candidates(value: string | number): string[] {
  if (typeof value === "number") {
    const out = [String(value)];
    if (Number.isInteger(value)) out.push(value.toLocaleString("en-US"));
    else out.push(value.toFixed(2));
    return out;
  }

  const out = [value];
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) {
    const [, y, m, d] = iso;
    const mn = String(Number(m));
    const dn = String(Number(d));
    out.push(
      `${y}/${m}/${d}`,
      `${y}/${mn}/${dn}`,
      `${y}.${m}.${d}`,
      `${y}年${mn}月${dn}日`,
      `${y}年${m}月${d}日`,
      `${mn}/${dn}/${y}`,
      `${dn}/${mn}/${y}`,
    );
  }
  return out;
}

/** Area of a box, used to prefer the tightest block containing the value. */
function area(block: OcrBlock): number {
  return block.box.w * block.box.h;
}

/**
 * Finds the smallest block containing the value. Returns null when the value
 * cannot be traced — the caller shows the field without a highlight rather than
 * guessing.
 */
export function findAnchor(
  value: string | number | null,
  blocks: readonly OcrBlock[],
): Anchor | null {
  if (value === null || value === "") return null;

  const needles = candidates(value)
    .map(normalise)
    .filter((n) => n.length > 0);
  if (needles.length === 0) return null;

  let best: OcrBlock | undefined;
  for (const block of blocks) {
    const haystack = normalise(block.content);
    if (!needles.some((n) => haystack.includes(n))) continue;
    if (!best || area(block) < area(best)) best = block;
  }

  if (!best) return null;
  return {
    page: best.page,
    box: best.box,
    snippet: best.content.slice(0, 200),
  };
}

/** Resolves anchors for every scalar field of an extraction result. */
export function findAnchors(
  fields: Record<string, unknown>,
  blocks: readonly OcrBlock[],
): Record<string, Anchor> {
  const anchors: Record<string, Anchor> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value !== "string" && typeof value !== "number") continue;
    const anchor = findAnchor(value, blocks);
    if (anchor) anchors[key] = anchor;
  }
  return anchors;
}
