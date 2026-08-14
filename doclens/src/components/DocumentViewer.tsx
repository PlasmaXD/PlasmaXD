"use client";

import { useEffect, useRef, useState } from "react";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from "pdfjs-dist";

import type { Anchor } from "@/lib/types";

type Props = {
  src: string;
  mimeType: string;
  /** Page to show and box to highlight; null clears the highlight. */
  anchor: Anchor | null;
};

/**
 * Renders the source document and draws the highlight box on top of it.
 *
 * Boxes arrive in normalised coordinates, so the overlay is positioned in
 * percentages and stays correct at any render scale or window size — no
 * recomputation on resize.
 */
export function DocumentViewer({ src, mimeType, anchor }: Props) {
  const isPdf = mimeType === "application/pdf";
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Held in state, not a ref: the render effect has to re-run when the document
  // finishes loading, and a ref assignment would not trigger it.
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);

  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Teardown lives on the loading task, not the document proxy.
  const loadingRef = useRef<PDFDocumentLoadingTask | null>(null);

  // Following a citation means jumping to the page it was found on.
  useEffect(() => {
    if (anchor) setPage(anchor.page);
  }, [anchor]);

  useEffect(() => {
    if (!isPdf) return;
    let cancelled = false;

    setPage(0);
    setError(null);
    setDoc(null);

    (async () => {
      try {
        // The default build uses JS features (Map.getOrInsertComputed) that
        // current Chromium does not implement yet, which throws at render time
        // and leaves a blank page. The legacy build is transpiled down and
        // behaves identically otherwise.
        const pdfjs: typeof import("pdfjs-dist") = await import(
          "pdfjs-dist/legacy/build/pdf.mjs"
        );
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const loadingTask = pdfjs.getDocument({
          url: src,
          // Without these, PDFs using the 14 standard fonts render blank, and
          // Japanese PDFs with CID fonts lose their text entirely. The assets
          // are copied into /public by scripts/copy-pdfjs-assets.mjs.
          standardFontDataUrl: "/pdfjs/standard_fonts/",
          cMapUrl: "/pdfjs/cmaps/",
          cMapPacked: true,
        });
        loadingRef.current = loadingTask;

        const loaded = await loadingTask.promise;
        if (cancelled) {
          void loadingTask.destroy();
          return;
        }
        setDoc(loaded);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Failed to load.");
        }
      }
    })();

    return () => {
      cancelled = true;
      void loadingRef.current?.destroy();
      loadingRef.current = null;
    };
  }, [src, isPdf]);

  // Draw the current page whenever it or the loaded document changes.
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    let task: RenderTask | null = null;

    (async () => {
      const canvas = canvasRef.current;
      const frame = frameRef.current;
      if (!canvas || !frame) return;

      const pdfPage = await doc.getPage(page + 1);
      if (cancelled) return;

      // Render at the frame's CSS width times the device pixel ratio, so text
      // stays sharp on retina displays without blowing up memory.
      const base = pdfPage.getViewport({ scale: 1 });
      const cssWidth = frame.clientWidth || 800;
      const scale = (cssWidth / base.width) * Math.min(devicePixelRatio, 2);
      const viewport = pdfPage.getViewport({ scale });

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      const context = canvas.getContext("2d");
      if (!context) return;

      task = pdfPage.render({ canvasContext: context, viewport, canvas });
      try {
        await task.promise;
      } catch {
        // Superseded by a newer render; nothing to report.
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page]);

  const pageCount = doc?.numPages ?? 1;
  const box = anchor?.box && anchor.page === page ? anchor.box : null;

  return (
    <div className="pane">
      <div className="pane-header">
        <span>Source</span>
      </div>

      <div className="pane-body">
        {error ? (
          <p className="notice error">{error}</p>
        ) : (
          <div className="page-frame" ref={frameRef}>
            {isPdf ? (
              <canvas ref={canvasRef} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt="Uploaded document" />
            )}
            {box && (
              <div
                className="highlight"
                // Re-mounting on box change restarts the pulse animation.
                key={`${page}:${box.x}:${box.y}`}
                style={{
                  left: `${box.x * 100}%`,
                  top: `${box.y * 100}%`,
                  width: `${box.w * 100}%`,
                  height: `${box.h * 100}%`,
                }}
              />
            )}
          </div>
        )}
      </div>

      {isPdf && pageCount > 1 && (
        <div className="pager">
          <button
            className="btn"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            ←
          </button>
          <span>
            {page + 1} / {pageCount}
          </span>
          <button
            className="btn"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={page >= pageCount - 1}
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
