import type { InvoiceFields } from "./schema";

/**
 * A rectangle in normalised page coordinates (0..1, origin top-left).
 *
 * The OCR API returns absolute pixels against the page-image it rendered, whose
 * size depends on DPI. Normalising at the boundary means the viewer never has to
 * know about DPI — it just multiplies by whatever size it rendered the page at.
 */
export type Box = { x: number; y: number; w: number; h: number };

/** Where a value came from in the source document. */
export type Anchor = {
  page: number;
  /** Null when the value could not be traced back to a block. */
  box: Box | null;
  /** The block text the value was matched against, for display. */
  snippet: string | null;
};

export type OcrBlock = {
  page: number;
  box: Box;
  content: string;
  type: string;
};

export type PageInfo = {
  index: number;
  /** Aspect ratio source; the viewer scales to its own width. */
  width: number;
  height: number;
};

export type DocumentResult = {
  id: string;
  fileName: string;
  mimeType: string;
  pages: PageInfo[];
  blocks: OcrBlock[];
  fields: InvoiceFields;
  /** Field name -> where it was found. Missing entry means "not located". */
  anchors: Record<string, Anchor>;
  pagesProcessed: number;
};

export type JobStatus = "queued" | "running" | "done" | "error";

export type JobDocument = {
  id: string;
  fileName: string;
  status: JobStatus;
  error?: string;
  result?: DocumentResult;
};

export type Job = {
  id: string;
  status: JobStatus;
  createdAt: number;
  documents: JobDocument[];
};

/** What the polling endpoint returns; excludes the raw file bytes. */
export type JobView = Job;
