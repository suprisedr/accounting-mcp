import { graphqlRequest } from "../lib/graphql.js";
// Fields returned for every Invoice response
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
        description: "Manage invoices. Use the 'action' field to select the operation. Requires prior login.\n" +
            "• list   — list all invoices for a company (requires: company_id)\n" +
            "• get    — fetch a single invoice (requires: id)\n" +
            "• create — create a new invoice (requires: company_id, customer_name, invoice_date, due_date, items)\n" +
            "• update_status — change invoice status (requires: id, status)",
        inputSchema: {
            type: "object",
            properties: {
                action: {
                    type: "string",
                    enum: ["list", "get", "create", "update_status"],
                    description: "Operation to perform.",
                },
                company_id: { type: "string", description: "Company ID. Required for: list, create." },
                id: { type: "string", description: "Invoice ID. Required for: get, update_status." },
                status: {
                    type: "string",
                    enum: ["DRAFT", "SENT", "PAID", "OVERDUE", "CANCELLED"],
                    description: "Invoice status. Required for: update_status. Optional for: create (defaults to DRAFT).",
                },
                customer_name: { type: "string", description: "Customer name. Required for: create." },
                customer_email: { type: "string", description: "Customer email. Optional for: create." },
                customer_address: { type: "string", description: "Customer address. Optional for: create." },
                invoice_date: { type: "string", description: "Invoice date (YYYY-MM-DD). Required for: create." },
                due_date: { type: "string", description: "Due date (YYYY-MM-DD). Required for: create." },
                items: {
                    type: "array",
                    description: "Invoice line items. Required for: create. Each item references an inventory item by ID.",
                    items: {
                        type: "object",
                        properties: {
                            inventory_item_id: { type: "string", description: "ID of the inventory item to add." },
                            quantity: { type: "number", description: "Quantity of the item." },
                        },
                        required: ["inventory_item_id", "quantity"],
                    },
                },
                notes: { type: "string", description: "Optional notes." },
            },
            required: ["action"],
        },
    },
];
export async function handle(name, args) {
    if (name !== "invoices")
        return null;
    switch (args.action) {
        case "list": {
            const data = (await graphqlRequest(`query { invoices(company_id: "${args.company_id}") { ${INVOICE_FIELDS} } }`, undefined, true));
            return { content: [{ type: "text", text: JSON.stringify(data.invoices, null, 2) }] };
        }
        case "get": {
            const data = (await graphqlRequest(`query { invoice(id: "${args.id}") { ${INVOICE_FIELDS} } }`, undefined, true));
            return { content: [{ type: "text", text: JSON.stringify(data.invoice, null, 2) }] };
        }
        case "create": {
            const input = {
                company_id: args.company_id,
                customer_name: args.customer_name,
                invoice_date: args.invoice_date,
                due_date: args.due_date,
                items: args.items,
            };
            if (args.customer_email)
                input.customer_email = args.customer_email;
            if (args.customer_address)
                input.customer_address = args.customer_address;
            if (args.status)
                input.status = args.status;
            if (args.notes)
                input.notes = args.notes;
            const data = (await graphqlRequest(`mutation CreateInvoice($input: CreateInvoiceInput!) {
          createInvoice(input: $input) { ${INVOICE_FIELDS} }
        }`, { input }, true));
            return {
                content: [
                    { type: "text", text: JSON.stringify({ success: true, invoice: data.createInvoice }, null, 2) },
                ],
            };
        }
        case "update_status": {
            const data = (await graphqlRequest(`mutation UpdateInvoiceStatus($id: ID!, $status: InvoiceStatus!) {
          updateInvoiceStatus(id: $id, status: $status) { ${INVOICE_FIELDS} }
        }`, { id: args.id, status: args.status }, true));
            return {
                content: [
                    { type: "text", text: JSON.stringify({ success: true, invoice: data.updateInvoiceStatus }, null, 2) },
                ],
            };
        }
        default:
            throw new Error(`Unknown invoice action: ${args.action}`);
    }
}
