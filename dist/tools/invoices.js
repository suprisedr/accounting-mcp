import { graphqlRequest } from "../lib/graphql.js";
const FLAG_RULE = "\n\nACTION FLAGGING (mandatory): If reviewing results reveals any issues " +
    "(overdue invoices, unusually large or mismatched amounts, missing details, or concerns requiring follow-up), " +
    "you MUST call create_action for each one — do not leave findings only in your text reply. " +
    "Use related_type='invoice' and related_id to link the action to the relevant record.";
const INVOICE_FIELDS = `
  id invoice_number customer_name customer_email customer_address
  invoice_date due_date status notes subtotal tax_total total
  items {
    id description quantity unit_price tax_rate line_total
    inventory_item { id name sku }
  }
`;
export const tools = [
    {
        name: "invoices",
        description: "Search invoices for a company. At least one filter must be provided. Requires prior login.\n" +
            "\n" +
            "INVOICE NUMBER FORMAT: INV-YYMMDD### (2-digit year, month, day, 3-digit sequence).\n" +
            "Examples: INV-260403001 = first invoice on 2026-04-03; INV-2604 = all invoices from April 2026.\n" +
            "Convert natural-language dates to YYYY-MM-DD before passing to the 'date' filter.\n" +
            "\n" +
            "Filters (all optional — supply at least one):\n" +
            "• invoice_number — exact number OR a prefix (e.g. INV-260403 returns all invoices issued on 2026-04-03)\n" +
            "• customer_name  — partial, case-insensitive customer name match\n" +
            "• date           — exact invoice date as YYYY-MM-DD\n" +
            "• status         — DRAFT | PENDING | PARTIALLY_PAID | PAID | OVERDUE | VOIDED | WRITE_OFF\n" +
            "• total_min      — minimum invoice total (inclusive)\n" +
            "• total_max      — maximum invoice total (inclusive)" +
            FLAG_RULE,
        inputSchema: {
            type: "object",
            properties: {
                company_id: { type: "string", description: "Company ID. Required." },
                invoice_number: { type: "string", description: "Full number (INV-260403001) or prefix (INV-260403) to match all invoices on that date." },
                customer_name: { type: "string", description: "Partial customer name — case-insensitive." },
                date: { type: "string", description: "Exact invoice date in YYYY-MM-DD format." },
                status: { type: "string", enum: ["DRAFT", "PENDING", "PARTIALLY_PAID", "PAID", "OVERDUE", "VOIDED", "WRITE_OFF"], description: "Invoice status." },
                total_min: { type: "number", description: "Minimum invoice total (inclusive)." },
                total_max: { type: "number", description: "Maximum invoice total (inclusive)." },
            },
            required: ["company_id"],
        },
    },
];
export async function handle(name, args) {
    if (name !== "invoices")
        return null;
    const { company_id, invoice_number, customer_name, date, status, total_min, total_max } = args;
    const hasFilter = invoice_number || customer_name || date || status || total_min != null || total_max != null;
    if (!hasFilter) {
        return {
            content: [{ type: "text", text: JSON.stringify({ error: "At least one filter (invoice_number, customer_name, date, status, total_min, total_max) must be provided." }, null, 2) }],
            isError: true,
        };
    }
    const data = (await graphqlRequest(`query SearchInvoices(
      $companyId: ID!
      $invoiceNumber: String
      $customerName: String
      $date: Date
      $status: InvoiceStatus
      $totalMin: Float
      $totalMax: Float
    ) {
      searchInvoices(
        company_id: $companyId
        invoice_number: $invoiceNumber
        customer_name: $customerName
        date: $date
        status: $status
        total_min: $totalMin
        total_max: $totalMax
      ) { ${INVOICE_FIELDS} }
    }`, {
        companyId: company_id,
        invoiceNumber: invoice_number ?? null,
        customerName: customer_name ?? null,
        date: date ?? null,
        status: status ?? null,
        totalMin: total_min ?? null,
        totalMax: total_max ?? null,
    }, true));
    const results = data.searchInvoices ?? [];
    if (results.length === 0) {
        return { content: [{ type: "text", text: JSON.stringify({ found: false, message: "No invoices matched the given filters." }, null, 2) }] };
    }
    return { content: [{ type: "text", text: JSON.stringify({ count: results.length, invoices: results }, null, 2) }] };
}
