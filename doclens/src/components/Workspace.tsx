"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { toCsv } from "@/lib/csv";
import type { Anchor, Job } from "@/lib/types";

import { DocumentViewer } from "./DocumentViewer";
import { Dropzone } from "./Dropzone";
import { ResultsTable } from "./ResultsTable";

const POLL_INTERVAL_MS = 1500;

export function Workspace() {
  const [job, setJob] = useState<Job | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [activeField, setActiveField] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  const upload = useCallback(async (files: File[]) => {
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      files.forEach((file) => body.append("files", file));

      const response = await fetch("/api/jobs", { method: "POST", body });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Upload failed.");

      setJob(payload as Job);
      setSelectedDocId((payload as Job).documents[0]?.id ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }, []);

  // Poll until every document has settled.
  useEffect(() => {
    if (!job || job.status === "done" || job.status === "error") return;

    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${job.id}`);
        if (response.ok) setJob((await response.json()) as Job);
      } catch {
        // Transient; the next tick will retry.
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [job]);

  const selected = useMemo(
    () => job?.documents.find((doc) => doc.id === selectedDocId) ?? null,
    [job, selectedDocId],
  );

  // Clear the highlight when switching documents.
  useEffect(() => {
    setAnchor(null);
    setActiveField(null);
  }, [selectedDocId]);

  function exportCsv() {
    if (!job) return;
    const blob = new Blob([toCsv(job.documents)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "doclens-export.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const hasResults = job?.documents.some((doc) => doc.result) ?? false;

  return (
    <div className="app">
      <header className="masthead">
        <h1>DocLens</h1>
        <span className="tagline">
          書類を構造化データに — すべての値に出典つき
        </span>
        <span className="spacer" />
        {job && (
          <>
            <button className="btn" onClick={() => setJob(null)}>
              新しい書類
            </button>
            <button className="btn" onClick={exportCsv} disabled={!hasResults}>
              CSV 出力
            </button>
          </>
        )}
      </header>

      {!job ? (
        <>
          {error && (
            <p className="notice error" style={{ margin: "20px 20px 0" }}>
              {error}
            </p>
          )}
          <Dropzone onFiles={upload} disabled={uploading} />
        </>
      ) : (
        <div className="split">
          {selected?.result ? (
            <DocumentViewer
              src={`/api/jobs/${job.id}/files/${selected.id}`}
              mimeType={selected.result.mimeType}
              anchor={anchor}
            />
          ) : (
            <div className="pane">
              <div className="pane-header">Source</div>
              <div className="pane-body">
                <p className="notice">
                  {selected?.status === "error"
                    ? selected.error
                    : "解析中です…"}
                </p>
              </div>
            </div>
          )}

          <div className="pane">
            <div className="pane-header">抽出結果</div>
            <div className="pane-body">
              <ul className="doc-list">
                {job.documents.map((doc) => (
                  <li key={doc.id}>
                    <button
                      className={`doc-chip${doc.id === selectedDocId ? " selected" : ""}`}
                      onClick={() => setSelectedDocId(doc.id)}
                      title={doc.fileName}
                    >
                      <span className={`status-dot ${doc.status}`} />
                      {doc.fileName}
                    </button>
                  </li>
                ))}
              </ul>

              {selected?.result ? (
                <ResultsTable
                  result={selected.result}
                  activeField={activeField}
                  onSelect={(field, next) => {
                    setActiveField(field);
                    setAnchor(next);
                  }}
                />
              ) : (
                <p className="notice">
                  {selected?.status === "error"
                    ? `解析に失敗しました: ${selected.error}`
                    : "解析中です。完了した書類から順に表示されます。"}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
