import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import * as auth from "./tools/auth.js";
import * as transactions from "./tools/transactions.js";
import * as invoices from "./tools/invoices.js";
import * as inventory from "./tools/inventory.js";
import * as company from "./tools/company.js";

// All tools registered with the server — ordered by domain
const allTools = [
  ...auth.tools,
  ...transactions.tools,
  ...invoices.tools,
  ...inventory.tools,
  ...company.tools,
];

// Domain handlers — each returns null when the tool name is not theirs
const handlers = [auth.handle, transactions.handle, invoices.handle, inventory.handle, company.handle];

// ─── Server setup ─────────────────────────────────────────────────────────────

const server = new Server(
  { name: "accounting-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: allTools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    for (const handler of handlers) {
      const result = await handler(name, (args ?? {}) as Record<string, unknown>);
      if (result !== null) return result;
    }
    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("Accounting MCP server running on stdio\n");
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});

