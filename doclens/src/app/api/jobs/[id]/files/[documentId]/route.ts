import { NextResponse } from "next/server";

import { getFile } from "@/lib/jobs";

export const runtime = "nodejs";

/** Serves the original upload back so the viewer can render the source document. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; documentId: string }> },
) {
  const { id, documentId } = await params;
  const file = getFile(id, documentId);

  if (!file) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  return new NextResponse(file.bytes as unknown as BodyInit, {
    headers: {
      "content-type": file.mimeType || "application/octet-stream",
      "content-length": String(file.bytes.byteLength),
      // User documents: keep them out of shared caches.
      "cache-control": "private, no-store",
      "content-disposition": "inline",
    },
  });
}
