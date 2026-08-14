"use client";

import type { Anchor, DocumentResult } from "@/lib/types";

const LABELS: Record<string, string> = {
  issueDate: "発行日",
  vendor: "取引先",
  invoiceNumber: "請求番号",
  subtotal: "小計（税抜）",
  tax: "消費税",
  total: "合計",
  currency: "通貨",
};

const ROWS = [
  "issueDate",
  "vendor",
  "invoiceNumber",
  "subtotal",
  "tax",
  "total",
  "currency",
] as const;

type Props = {
  result: DocumentResult;
  activeField: string | null;
  onSelect: (field: string, anchor: Anchor | null) => void;
};

function format(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value.toLocaleString("ja-JP");
  return String(value);
}

export function ResultsTable({ result, activeField, onSelect }: Props) {
  const fields = result.fields as unknown as Record<string, unknown>;

  return (
    <>
      <table className="fields">
        <tbody>
          {ROWS.map((key) => {
            const anchor = result.anchors[key] ?? null;
            const display = format(fields[key]);
            const linked = Boolean(anchor?.box);

            return (
              <tr
                key={key}
                className={[
                  linked ? "linked" : "",
                  activeField === key ? "active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => linked && onSelect(key, anchor)}
              >
                <th scope="row">{LABELS[key] ?? key}</th>
                <td className="value">
                  {display ?? <span className="empty-value">見つかりません</span>}
                  <div className={`trace${linked ? "" : " missing"}`}>
                    {linked
                      ? `p.${(anchor as Anchor).page + 1} — クリックで該当箇所へ`
                      : display
                        ? "出典を特定できませんでした（値は要確認）"
                        : ""}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {result.fields.lineItems.length > 0 && (
        <>
          <h3 className="section-title">明細</h3>
          <table className="lineitems">
            <thead>
              <tr>
                <th>品目</th>
                <th>数量</th>
                <th>単価</th>
                <th>金額</th>
              </tr>
            </thead>
            <tbody>
              {result.fields.lineItems.map((item, index) => (
                <tr key={index}>
                  <td>{item.description ?? "—"}</td>
                  <td className="num">{format(item.quantity) ?? "—"}</td>
                  <td className="num">{format(item.unitPrice) ?? "—"}</td>
                  <td className="num">{format(item.amount) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
