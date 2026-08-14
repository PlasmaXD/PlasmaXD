"use client";

import { useRef, useState } from "react";

type Props = {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
};

export function Dropzone({ onFiles, disabled }: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handle(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (files.length > 0) onFiles(files);
  }

  return (
    <div
      className={`dropzone${dragging ? " dragging" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (!disabled) handle(event.dataTransfer.files);
      }}
    >
      <h2>請求書・領収書をドロップ</h2>
      <p>
        PDF / PNG / JPEG に対応。1 回あたり 10 ファイル、1 ファイル 20 MB
        まで。抽出結果は各値がどこから読み取られたかを保持します。
      </p>
      <button
        className="btn"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        ファイルを選択
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="application/pdf,image/png,image/jpeg,image/webp"
        onChange={(event) => {
          handle(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}
