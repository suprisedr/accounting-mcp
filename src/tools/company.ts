import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { graphqlRequest } from "../lib/graphql.js";

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

export const tools: Tool[] = [
  {
    name: "get_company",
    description:
      "Fetch company details by ID. Returns registration info, industry, location, and banking details. Requires prior login.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The company ID to retrieve." },
      },
      required: ["id"],
    },
  },
];

export async function handle(
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult | null> {
  if (name !== "get_company") return null;

  const data = (await graphqlRequest(
    `query {
      company(id: "${args.id}") {
        id registered_name slug company_type vat_number
        industry city province bank_name created_at
      }
    }`,
    undefined,
    true
  )) as { company: unknown };

  return { content: [{ type: "text", text: JSON.stringify(data.company, null, 2) }] };
}
