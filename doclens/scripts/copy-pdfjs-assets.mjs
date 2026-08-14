/**
 * Copies pdf.js runtime assets into /public.
 *
 * pdf.js loads these over HTTP at render time rather than bundling them. Without
 * standard_fonts, any PDF using the 14 base fonts renders as a blank page;
 * without cmaps, Japanese PDFs with CID-keyed fonts lose their text. Neither
 * failure throws — the page just comes out empty — so this runs before dev and
 * build rather than being left to a README instruction.
 */

import { cp, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pdfjsRoot = dirname(require.resolve("pdfjs-dist/package.json"));
const target = join(process.cwd(), "public", "pdfjs");

await mkdir(target, { recursive: true });

for (const asset of ["standard_fonts", "cmaps"]) {
  await cp(join(pdfjsRoot, asset), join(target, asset), { recursive: true });
  console.log(`copied ${asset} -> public/pdfjs/${asset}`);
}
