import { NextResponse } from "next/server";

import { limits } from "@/lib/env";
import { createJob, type UploadInput } from "@/lib/jobs";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected a multipart/form-data body." },
      { status: 400 },
    );
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: "No files uploaded." }, { status: 400 });
  }
  if (files.length > limits.maxFilesPerJob) {
    return NextResponse.json(
      { error: `Up to ${limits.maxFilesPerJob} files per upload.` },
      { status: 413 },
    );
  }

  const uploads: UploadInput[] = [];
  for (const file of files) {
    if (file.size > limits.maxFileBytes) {
      return NextResponse.json(
        {
          error: `${file.name} is larger than ${limits.maxFileBytes / 1024 / 1024} MB.`,
        },
        { status: 413 },
      );
    }
    if (!limits.acceptedTypes.includes(file.type as never)) {
      return NextResponse.json(
        { error: `${file.name}: unsupported type "${file.type || "unknown"}".` },
        { status: 415 },
      );
    }
    uploads.push({
      fileName: file.name,
      mimeType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
  }

  try {
    return NextResponse.json(createJob(uploads), { status: 202 });
  } catch (error) {
    // The most likely cause is a missing API key; surface it plainly.
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start job." },
      { status: 500 },
    );
  }
}
