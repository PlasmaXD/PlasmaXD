import { z } from "zod";

/**
 * The extraction target for the MVP: invoices and receipts.
 *
 * Every field is nullable rather than optional. "Not present in the document"
 * is a real answer we want the model to be able to give, and a strict JSON
 * schema requires every property to be present anyway — so nullable models the
 * domain and satisfies the API at the same time.
 */
export const LineItem = z.object({
  description: z.string().nullable(),
  quantity: z.number().nullable(),
  unitPrice: z.number().nullable(),
  amount: z.number().nullable(),
});

export const InvoiceFields = z.object({
  issueDate: z
    .string()
    .nullable()
    .describe("Issue date in YYYY-MM-DD format. Null if not stated."),
  vendor: z.string().nullable().describe("The issuing company or store name."),
  invoiceNumber: z.string().nullable(),
  subtotal: z.number().nullable().describe("Amount before tax."),
  tax: z.number().nullable().describe("Tax amount."),
  total: z.number().nullable().describe("Total amount payable, including tax."),
  currency: z
    .string()
    .nullable()
    .describe("ISO 4217 code, e.g. JPY, USD, EUR."),
  lineItems: z.array(LineItem),
});

export type InvoiceFields = z.infer<typeof InvoiceFields>;

/** The six fields the MVP's accuracy target is measured against. */
export const SCORED_FIELDS = [
  "issueDate",
  "vendor",
  "subtotal",
  "tax",
  "total",
  "currency",
] as const satisfies readonly (keyof InvoiceFields)[];

/**
 * Strict structured output requires every object to close itself off and list
 * all of its properties as required. Zod emits neither guarantee consistently,
 * so we walk the generated schema and enforce both.
 */
function enforceStrict(node: unknown): void {
  if (Array.isArray(node)) {
    node.forEach(enforceStrict);
    return;
  }
  if (typeof node !== "object" || node === null) return;

  const obj = node as Record<string, unknown>;
  if (obj.type === "object" && typeof obj.properties === "object") {
    const properties = obj.properties as Record<string, unknown>;
    obj.additionalProperties = false;
    obj.required = Object.keys(properties);
  }
  Object.values(obj).forEach(enforceStrict);
}

/**
 * JSON Schema handed to the OCR endpoint's `document_annotation_format`.
 * Generated from the Zod schema so the two can never drift apart.
 */
export function invoiceJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(InvoiceFields, {
    target: "draft-7",
    io: "input",
  }) as Record<string, unknown>;
  enforceStrict(schema);
  return schema;
}

export const EXTRACTION_PROMPT = [
  "Extract the billing details from this document.",
  "Copy values verbatim as they appear in the document — do not reformat numbers,",
  "do not add thousands separators, and do not convert currencies.",
  "The one exception is issueDate, which must be normalised to YYYY-MM-DD.",
  "Japanese documents may write amounts as 金額 / 合計 / 小計 / 消費税 and dates in",
  "Japanese era format (令和6年5月1日 → 2024-05-01).",
  "If a field is not present in the document, return null for it.",
].join(" ");
