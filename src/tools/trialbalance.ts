import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { graphqlRequest } from "../lib/graphql.js";

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

const FLAG_RULE =
  "\n\nACTION FLAGGING (mandatory): After reviewing the trial balance, if you identify ANY of the following " +
  "you MUST call create_action for each — do not leave findings only in your text reply:\n" +
  "  • Accounts with unexpected debit/credit balances (e.g. asset with credit closing balance)\n" +
  "  • Suspense or unclassified accounts with balances\n" +
  "  • Retained earnings or equity balances that look materially incorrect\n" +
  "  • VAT control account balance that should be nil but isn't\n" +
  "  • Deferred tax account missing entirely when PPE assets exist\n" +
  "  • Any account balance that is unexpectedly zero or unexpectedly large\n" +
  "  • Trial balance that does not balance (total debits ≠ total credits)\n" +
  "Use priority 'high' for material misstatements, 'medium' for classification issues, 'low' for housekeeping.";

export const tools: Tool[] = [
  {
    name: "trial_balance",
    description:
      "Fetch the trial balance for a company over a given date range. " +
      "Returns each chart-of-account row with opening balance, period debits, period credits, and closing balance. " +
      "Requires prior login." +
      FLAG_RULE,
    inputSchema: {
      type: "object",
      properties: {
        company_id: { type: "string", description: "The ID of the company." },
        start_date: { type: "string", description: "Period start date in YYYY-MM-DD format." },
        end_date: { type: "string", description: "Period end date in YYYY-MM-DD format." },
      },
      required: ["company_id", "start_date", "end_date"],
    },
  },
];

export async function handle(
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult | null> {
  if (name !== "trial_balance") return null;

  const { company_id, start_date, end_date } = args as {
    company_id: string;
    start_date: string;
    end_date: string;
  };

  const query = `
    query TrialBalance($companyId: ID!, $startDate: Date!, $endDate: Date!) {
      trialBalance(company_id: $companyId, start_date: $startDate, end_date: $endDate) {
        id
        account_code
        account_name
        account_type
        opening_balance
        posted_debits
        posted_credits
      }
    }
  `;

  const data = (await graphqlRequest(
    query,
    { companyId: company_id, startDate: start_date, endDate: end_date },
    true
  )) as { trialBalance: Array<{
    id: string;
    account_code: string;
    account_name: string;
    account_type: string;
    opening_balance: number;
    posted_debits: number;
    posted_credits: number;
  }> };

  const rows = data.trialBalance ?? [];

  // Annotate each row with a computed closing balance
  const annotated = rows.map((row) => {
    const isDebitNormal = ["assets", "expenses"].includes(row.account_type);
    const closing = isDebitNormal
      ? row.opening_balance + row.posted_debits - row.posted_credits
      : row.opening_balance + row.posted_credits - row.posted_debits;
    return { ...row, closing_balance: closing };
  });

  return {
    content: [{ type: "text", text: JSON.stringify({ count: annotated.length, rows: annotated }, null, 2) }],
  };
}
