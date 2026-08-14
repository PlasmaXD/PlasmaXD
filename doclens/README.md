# DocLens

請求書・領収書の PDF / 画像を構造化データに変換する Web アプリ。抽出したすべての値が
**元の書類のどこから読み取られたか**を保持し、表のセルをクリックすると該当箇所が
ハイライトされます。

企画の背景と選定理由は [`../docs/mistral-app-plan.md`](../docs/mistral-app-plan.md) を参照してください。

## セットアップ

```bash
npm install
cp .env.example .env.local   # MISTRAL_API_KEY を記入
npm run dev                  # http://localhost:3000
```

API キーは [console.mistral.ai](https://console.mistral.ai/) で取得します。

## Phase 0: 検証スパイク

**新しい種類の書類を扱う前に必ず実行してください。** OCR の精度、bbox の座標系、
構造化抽出の結果を実物で確認するためのスクリプトです。

```bash
mkdir -p scripts/samples          # 実物の請求書を数枚置く（git 管理外）
npm run spike:ocr -- scripts/samples/invoice.pdf
```

ブロック数・座標・レイテンシ・抽出結果を出力し、生レスポンスを `scripts/out/` に保存します。

## 仕組み

```
アップロード → Files API → OCR 3 ─┬→ pages[].blocks[]  (bbox + テキスト)
                                  └→ documentAnnotation (構造化フィールド)
                                        ↓
                              値 ↔ ブロックの照合 (src/lib/anchor.ts)
                                        ↓
                              表のクリック → PDF 上をハイライト
```

### 設計上の要点

**OCR と構造化抽出を 1 コールで行う。** `documentAnnotationFormat` に JSON Schema を渡すと、
OCR エンドポイントがページ内容と一緒に構造化フィールドを返します。OCR → chat の 2 段構成より
安く、1 往復速くなります。

**JSON Schema は Zod から生成する。** `src/lib/schema.ts` の Zod スキーマが唯一の定義元で、
API に渡す JSON Schema はそこから生成され、レスポンスの検証にも同じスキーマを使います。
リクエストとレスポンスの型がずれることが原理的に起きません。

**出典の特定は LLM ではなく決定的な文字列照合で行う。** `src/lib/anchor.ts` が抽出値を
OCR ブロックと突き合わせます。追加コストがゼロで、出典を捏造することがなく、失敗したときは
ハイライトが出ないという形で**目に見えて**失敗します（間違った場所を指すことがない）。
全角数字・桁区切り・通貨記号の差、和暦や `2024年5月1日` 形式の日付にも対応しています。

**bbox は正規化して保存する。** API は描画解像度依存の絶対ピクセルを返すため、境界で 0..1 に
正規化します。ビューア側は DPI を一切知る必要がなく、リサイズ時の再計算も不要です。

## モデルの使い分け

| 用途 | モデル | 理由 |
|---|---|---|
| OCR + 構造化抽出 | `mistral-ocr-latest` | ページ課金で安い。bbox 付き |
| （拡張時）横断的な質問・突合 | Magistral Small | 推論が必要な場面だけに限定 |
| （拡張時）検索 | `mistral-embed` | |

## 既知の制約

- **ジョブストアがインメモリ。** プロセス再起動で消え、複数インスタンスでは動きません。
  MVP をキーだけで動かすための意図的な割り切りです。本番化する際に最初に置き換える箇所
  （Postgres + キュー + オブジェクトストレージ）。
- **1 ファイルあたり 50 ページまで。** 想定外の大きな PDF が課金を跳ね上げないための上限です
  （`src/lib/env.ts`）。
- **日本語 OCR の精度は未実測。** 手書きや感熱紙のレシートは Phase 0 で必ず確認してください。
- pdf.js は legacy ビルドを使用しています。既定ビルドは現行 Chromium が未実装の JS 機能に
  依存しており、**例外を投げずに白紙を描画する**ため。

## スクリプト

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー |
| `npm run build` | 本番ビルド |
| `npm run typecheck` | 型チェック |
| `npm run spike:ocr -- <file>` | Phase 0 検証スパイク |

`predev` / `prebuild` で pdf.js のフォント・CMap を `public/pdfjs/` にコピーします。
これが無いと標準フォントの PDF が白紙になり、日本語 PDF は文字が消えます。
