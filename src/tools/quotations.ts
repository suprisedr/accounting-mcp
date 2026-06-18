import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { graphqlRequest } from "../lib/graphql.js";

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

const QUOTATION_FIELDS = `
  id quotation_number customer_name customer_email customer_address
  quotation_date expiry_date status notes converted_invoice_id
  subtotal tax_total total
  items {
    id description quantity unit_price tax_rate line_total
    inventory_item { id name sku }
  }
`;

export const tools: Tool[] = [
  {
    name: "quotations",
    description:
      "Search quotations for a company. At least one filter must be provided. Requires prior login.\n" +
      "\n" +
      "QUOTATION NUMBER FORMAT: QOU-YYMMDD### (2-digit year, month, day, 3-digit sequence).\n" +
      "Examples: QOU-260403001 = first quotation on 2026-04-03; QOU-2604 = all quotations from April 2026.\n" +
      "Convert natural-language dates to YYYY-MM-DD before passing to the 'date' filter.\n" +
      "\n" +
      "Filters (all optional — supply at least one):\n" +
      "• quotation_number — exact number OR a prefix (e.g. QOU-260403 returns all quotations issued on 2026-04-03)\n" +
      "• customer_name   — partial, case-insensitive customer name match\n" +
      "• date            — exact quotation date as YYYY-MM-DD\n" +
      "• status          — DRAFT | SENT | ACCEPTED | DECLINED | EXPIRED\n" +
      "• total_min       — minimum quotation total (inclusive)\n" +
      "• total_max       — maximum quotation total (inclusive)",
    inputSchema: {
      type: "object",
      properties: {
        company_id:        { type: "string", description: "Company ID. Required." },
        quotation_number:  { type: "string", description: "Full number (QOU-260403001) or prefix (QOU-260403) to match all quotations on that date." },
        customer_name:     { type: "string", description: "Partial customer name — case-insensitive." },
        date:              { type: "string", description: "Exact quotation date in YYYY-MM-DD format." },
        status:            { type: "string", enum: ["DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED"], description: "Quotation status." },
        total_min:         { type: "number", description: "Minimum quotation total (inclusive)." },
        total_max:         { type: "number", description: "Maximum quotation total (inclusive)." },
      },
      required: ["company_id"],
    },
  },
];

export async function handle(
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult | null> {
  if (name !== "quotations") return null;

  const { company_id, quotation_number, customer_name, date, status, total_min, total_max } = args as {
    company_id: string;
    quotation_number?: string;
    customer_name?: string;
    date?: string;
    status?: string;
    total_min?: number;
    total_max?: number;
  };

  const hasFilter = quotation_number || customer_name || date || status || total_min != null || total_max != null;
  if (!hasFilter) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: "At least one filter (quotation_number, customer_name, date, status, total_min, total_max) must be provided." }, null, 2) }],
      isError: true,
    };
  }

  const data = (await graphqlRequest(
    `query SearchQuotations(
      $companyId: ID!
      $quotationNumber: String
      $customerName: String
      $date: Date
      $status: QuotationStatus
      $totalMin: Float
      $totalMax: Float
    ) {
      searchQuotations(
        company_id: $companyId
        quotation_number: $quotationNumber
        customer_name: $customerName
        date: $date
        status: $status
        total_min: $totalMin
        total_max: $totalMax
      ) { ${QUOTATION_FIELDS} }
    }`,
    {
      companyId: company_id,
      quotationNumber: quotation_number ?? null,
      customerName: customer_name ?? null,
      date: date ?? null,
      status: status ?? null,
      totalMin: total_min ?? null,
      totalMax: total_max ?? null,
    },
    true
  )) as { searchQuotations: unknown[] };

  const results = data.searchQuotations ?? [];

  if (results.length === 0) {
    return { content: [{ type: "text", text: JSON.stringify({ found: false, message: "No quotations matched the given filters." }, null, 2) }] };
  }

  return { content: [{ type: "text", text: JSON.stringify({ count: results.length, quotations: results }, null, 2) }] };
}
