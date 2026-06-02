import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { graphqlRequest, setBearerToken, getBearerToken } from "../lib/graphql.js";

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

export const tools: Tool[] = [
  {
    name: "login",
    description:
      "Authenticate against the accounting API. Stores the bearer token for all subsequent requests. Credentials can be overridden via parameters; defaults use the configured service account.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "User email address", default: "dsnnkosi@gmail.com" },
        password: { type: "string", description: "User password", default: "12345678" },
        device_name: { type: "string", description: "Device / client identifier", default: "mcp-client" },
      },
      required: [],
    },
  },
  {
    name: "get_auth_status",
    description:
      "Check whether the MCP server currently holds a valid bearer token (i.e. whether login has been called).",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
];

export async function handle(
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult | null> {
  if (name === "login") {
    const email = (args.email as string | undefined) ?? "dsnnkosi@gmail.com";
    const password = (args.password as string | undefined) ?? "12345678";
    const device_name = (args.device_name as string | undefined) ?? "mcp-client";

    const query = `
      mutation Login($email: String!, $password: String!, $device_name: String!) {
        login(input: { email: $email, password: $password, device_name: $device_name }) {
          token
          user { id name email }
        }
      }
    `;

    const data = (await graphqlRequest(query, { email, password, device_name }, false)) as {
      login: { token: string; user: { id: string; name: string; email: string } };
    };

    setBearerToken(data.login.token);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { success: true, message: "Login successful. Bearer token stored.", user: data.login.user },
            null,
            2
          ),
        },
      ],
    };
  }

  if (name === "get_auth_status") {
    const authenticated = getBearerToken() !== null;
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              authenticated,
              message: authenticated
                ? "Bearer token is present. Ready to make authenticated requests."
                : "No bearer token. Please run the login tool.",
            },
            null,
            2
          ),
        },
      ],
    };
  }

  return null;
}
