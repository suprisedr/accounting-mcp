import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { graphqlRequest } from "../lib/graphql.js";

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

// Fields returned for every InventoryItem response
const ITEM_FIELDS = `
  id name description sku unit_price tax_rate is_active
`;

export const tools: Tool[] = [
  {
    name: "inventory",
    description:
      "Manage inventory items. Use the 'action' field to select the operation. Requires prior login.\n" +
      "• list   — list items for a company (requires: company_id; optional: only_active)\n" +
      "• create — create a new item (requires: company_id, name, unit_price)\n" +
      "• update — update an existing item (requires: id; provide only fields to change)\n" +
      "• delete — delete an item (requires: id)",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "create", "update", "delete"],
          description: "Operation to perform.",
        },
        company_id: { type: "string", description: "Company ID. Required for: list, create." },
        only_active: { type: "boolean", description: "Filter to active items only. Optional for: list." },
        id: { type: "string", description: "Item ID. Required for: update, delete." },
        name: { type: "string", description: "Item name. Required for: create." },
        sku: { type: "string", description: "Stock-keeping unit code." },
        description: { type: "string", description: "Item description." },
        unit_price: { type: "number", description: "Price per unit. Required for: create." },
        tax_rate: { type: "number", description: "Tax rate percentage (e.g. 15 for 15%)." },
        is_active: { type: "boolean", description: "Whether the item is active. Optional for: update." },
      },
      required: ["action"],
    },
  },
];

export async function handle(
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult | null> {
  if (name !== "inventory") return null;

  switch (args.action as string) {
    case "list": {
      const onlyActiveArg =
        args.only_active !== undefined ? `, only_active: ${args.only_active}` : "";
      const data = (await graphqlRequest(
        `query { inventoryItems(company_id: "${args.company_id}"${onlyActiveArg}) { ${ITEM_FIELDS} } }`,
        undefined,
        true
      )) as { inventoryItems: unknown[] };
      return { content: [{ type: "text", text: JSON.stringify(data.inventoryItems, null, 2) }] };
    }

    case "create": {
      const { action: _a, id: _id, only_active: _oa, ...inputFields } = args;
      const data = (await graphqlRequest(
        `mutation CreateInventoryItem($input: CreateInventoryItemInput!) {
          createInventoryItem(input: $input) { ${ITEM_FIELDS} }
        }`,
        { input: inputFields },
        true
      )) as { createInventoryItem: unknown };
      return {
        content: [
          { type: "text", text: JSON.stringify({ success: true, item: data.createInventoryItem }, null, 2) },
        ],
      };
    }

    case "update": {
      const { action: _a, id, company_id: _c, only_active: _oa, ...inputFields } = args;
      const data = (await graphqlRequest(
        `mutation UpdateInventoryItem($id: ID!, $input: UpdateInventoryItemInput!) {
          updateInventoryItem(id: $id, input: $input) { ${ITEM_FIELDS} }
        }`,
        { id, input: inputFields },
        true
      )) as { updateInventoryItem: unknown };
      return {
        content: [
          { type: "text", text: JSON.stringify({ success: true, item: data.updateInventoryItem }, null, 2) },
        ],
      };
    }

    case "delete": {
      const data = (await graphqlRequest(
        `mutation DeleteInventoryItem($id: ID!) {
          deleteInventoryItem(id: $id) { success message }
        }`,
        { id: args.id },
        true
      )) as { deleteInventoryItem: unknown };
      return {
        content: [
          { type: "text", text: JSON.stringify({ success: true, result: data.deleteInventoryItem }, null, 2) },
        ],
      };
    }

    default:
      throw new Error(`Unknown inventory action: ${args.action}`);
  }
}
