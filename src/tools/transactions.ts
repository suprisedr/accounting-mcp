import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { graphqlRequest } from "../lib/graphql.js";

/**
 * Appended to every tool that may surface compliance issues, flags, or
 * recommended follow-up actions. Instructs the model to call create_action
 * rather than leaving findings only in its text response.
 */
const FLAG_RULE =
  "\n\nACTION FLAGGING (mandatory): After completing this operation, if you identify ANY of the following, " +
  "you MUST call create_action for EACH one — do not leave them only in your text reply:\n" +
  "  • Missing or uncertain source documents\n" +
  "  • Unreconciled or unusual balances\n" +
  "  • Missing VAT registration or incorrect VAT treatment\n" +
  "  • IAS 12 deferred tax accounts that need to be created\n" +
  "  • PPE assets without a PPE class or SARS wear & tear life\n" +
  "  • Transactions that appear to be misclassified (e.g. capital vs revenue)\n" +
  "  • Compliance gaps (IFRS, SARS, or other regulatory concerns)\n" +
  "  • Any other issue that requires follow-up by the accountant\n" +
  "Use priority 'high' for compliance/audit risk, 'medium' for accounting estimate or disclosure issues, 'low' for housekeeping. " +
  "Set related_type and related_id to link the action to the relevant record where possible.";

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

export const tools: Tool[] = [
  {
    name: "create_transaction",
    description:
      "Create a double-entry journal transaction. Requires prior login. Each transaction must balance (total debits == total credits). " +
      "All journal entries must be IFRS compliant. " +
      "WORKFLOW: " +
      "(1) Always call get_chart_of_accounts first to retrieve valid account IDs. " +
      "NEVER post to a parent account — parent accounts are containers used to roll up their child accounts in reports, not posting accounts. " +
      "A parent account is any account whose `items` array is non-empty in the get_chart_of_accounts response. " +
      "Always select a leaf (child) account; if only a parent exists for what you need, create a suitable child account first via create_chart_of_account. " +
      "(2) Always call get_vat_registration_status to check whether the company is VAT-registered BEFORE deciding on journal lines. " +
      "ONLY include a VAT journal line if get_vat_registration_status returns is_active: true. " +
      "If is_active is false or the status is unavailable, do NOT add any VAT lines. " +
      "(3) If any transaction detail is unknown — such as the date, exact debit/credit account, or whether a purchase was cash or credit — ask the user to confirm before posting. " +
      "(4) If no suitable account exists in terms of IFRS for a line, call suggest_chart_of_account for suggestions of IFRS compliant accounts. " +
      "(5) IAS 16 — PROPERTY, PLANT & EQUIPMENT: If the transaction relates to the purchase, disposal, or depreciation of a PPE (IAS 16) asset, do NOT call create_transaction. " +
      "PPE entries are NEVER posted manually — they must flow through the asset register so the system generates IFRS-compliant journals automatically. " +
      "  • For a PPE acquisition/purchase: call create_asset with the IAS 16 recognition cost (purchase price net of trade discounts, import duties and non-refundable taxes, directly attributable costs of bringing the asset to its location and working condition, and the initial estimate of dismantling/restoration costs). The recognition journal is posted automatically by the queue. " +
      "  • For a PPE disposal (sale or scrapping): call dispose_asset with the disposal date and proceeds. The disposal journal (derecognition of cost and accumulated depreciation, gain/loss on disposal) is posted automatically. " +
      "  • For depreciation: do NOT post manually — the system posts monthly depreciation from the schedule. Use get_asset_depreciation_schedule to inspect or confirm. " +
      "  • For revisions of accounting estimates (useful life, residual value, depreciation method): call update_asset. " +
      "Refuse to post a create_transaction call for any PPE acquisition, disposal, or depreciation and redirect the user to the appropriate asset tool. " +
      "(6) Post the transaction only once all lines are confirmed, VAT handling is decided, and the transaction is confirmed not to be an IAS 16 PPE purchase, disposal or depreciation. " +
      "(7) SOURCE DOCUMENT & NOTES are mandatory. " +
      "Every transaction MUST be backed by a source document (e.g. 'bank statement', 'supplier invoice', 'sales receipt', 'petty cash voucher', 'credit note', 'payroll register'). " +
      "If the user has not stated what document the entry is taken from, ASK before posting — never invent or guess one. " +
      "Every transaction MUST also include a short explanatory note of NO MORE THAN 10 WORDS summarising why the entry is being posted (e.g. 'Fuel for delivery van, FNB account', 'Monthly office rent paid to landlord'). " +
      "Do not exceed 10 words — the server-side validation will reject longer notes." +
      FLAG_RULE,
    inputSchema: {
      type: "object",
      properties: {
        company_id: { type: "string", description: "The ID of the company to post the transaction to." },
        transaction_date: { type: "string", description: "Transaction date in YYYY-MM-DD format." },
        description: { type: "string", description: "Human-readable description of the transaction." },
        reference: { type: "string", description: "Reference number (e.g. JNL-0001)." },
        source_document: {
          type: "string",
          description:
            "The source document this entry is taken from (e.g. 'bank statement', 'supplier invoice', 'sales receipt', 'petty cash voucher'). Required.",
        },
        notes: {
          type: "string",
          description:
            "Short explanatory note — MAXIMUM 10 WORDS — describing why the entry is posted (e.g. 'Fuel for delivery van paid by card'). Required.",
        },
        lines: {
          type: "array",
          description:
            "Journal lines. Must balance — total DEBIT amounts must equal total CREDIT amounts.",
          items: {
            type: "object",
            properties: {
              chart_of_account_id: {
                type: "string",
                description: "Chart of account ID for this line. Must be a valid ID returned by get_chart_of_accounts.",
              },
              type: { type: "string", enum: ["DEBIT", "CREDIT"], description: "Whether this line is a debit or credit." },
              amount: { type: "number", description: "Monetary amount for this line." },
            },
            required: ["chart_of_account_id", "type", "amount"],
          },
          minItems: 2,
        },
      },
      required: ["company_id", "transaction_date", "description", "reference", "source_document", "notes", "lines"],
    },
  },
  {
    name: "get_vat_registration_status",
    description:
      "Check whether a company is VAT-registered. Call this BEFORE creating any transaction to determine whether VAT journal lines are required. " +
      "If is_active is true, include VAT lines (Output Tax for sales, Input Tax for purchases). " +
      "If is_active is false or this query returns no record, do NOT add VAT lines.",
    inputSchema: {
      type: "object",
      properties: {
        company_id: { type: "string", description: "The company ID to check VAT status for." },
      },
      required: ["company_id"],
    },
  },
  {
    name: "get_chart_of_accounts",
    description:
      "Fetch chart of accounts for a given company. Returns accounts with nested child accounts (items) and optional parent info. Set only_parents to true to return only top-level parent accounts with their children. Requires prior login.",
    inputSchema: {
      type: "object",
      properties: {
        company_id: { type: "string", description: "The ID of the company whose chart of accounts to retrieve." },
        only_parents: {
          type: "boolean",
          description:
            "When true, returns only parent (top-level) accounts with their nested child accounts. Defaults to false (returns all accounts).",
        },
      },
      required: ["company_id"],
    },
  },
  {
    name: "get_transaction_by_reference",
    description:
      "Fetch a single posted transaction by its reference (e.g. JNL-0001) for a given company. " +
      "Returns the full transaction with all journal lines, including the chart of account, debit/credit type, amount, and any VAT details. " +
      "Requires prior login.",
    inputSchema: {
      type: "object",
      properties: {
        company_id: { type: "string", description: "The ID of the company that owns the transaction." },
        reference: { type: "string", description: "The transaction reference to look up (e.g. JNL-0001)." },
      },
      required: ["company_id", "reference"],
    },
  },
  {
    name: "create_chart_of_account",
    description:
      "Create a new chart of account entry for a company. " +
      "Use this to add a parent account (e.g. 'Marketing & Advertising' with expense_class OPERATING) " +
      "or a child account by supplying a parent_id. " +
      "Account codes are auto-assigned by the server. " +
      "After creating an account call get_chart_of_accounts to retrieve the new account ID before posting transactions. " +
      "Requires prior login.",
    inputSchema: {
      type: "object",
      properties: {
        company_id: { type: "string", description: "The ID of the company this account belongs to." },
        account_name: { type: "string", description: "Human-readable name for the account (e.g. 'Digital Advertising')." },
        account_type: {
          type: "string",
          enum: ["assets", "liabilities", "equity", "revenue", "expenses"],
          description: "The account type.",
        },
        expense_class: {
          type: "string",
          enum: ["OPERATING", "NON_OPERATING", "COST_OF_SALES"],
          description: "Required for top-level expense accounts. Omit for child accounts or non-expense types.",
        },
        parent_id: {
          type: "string",
          description: "ID of the parent account. Supply this to create a child account; omit to create a parent account.",
        },
        description: {
          type: "string",
          description: "Optional description of what this account is used for.",
        },
      },
      required: ["company_id", "account_name", "account_type"],
    },
  },
  {
    name: "search_transactions",
    description:
      "Semantic (vector) search over posted transactions. Use this when the user describes what they're looking for in natural language " +
      "(e.g. 'fuel purchases last month', 'payments to ACME suppliers', 'office rent'). " +
      "Returns the most semantically similar transactions with similarity scores and full journal line detail. " +
      "Requires prior login." +
      FLAG_RULE,
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Natural-language description of the transactions to find (e.g. 'fuel expenses for delivery vehicles').",
        },
        limit: {
          type: "number",
          description: "Maximum number of matching transactions to return. Defaults to 10 if omitted.",
        },
        company_id: {
          type: "string",
          description: "Optional company ID to scope the search to a single company. Omit to search across all companies the user has access to.",
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "search_documents",
    description:
      "Semantic (vector) search across both transactions AND invoices in a single call. Use this when the user wants to find financial documents " +
      "by natural-language description and doesn't care whether the match comes from a journal transaction or a customer invoice " +
      "(e.g. 'anything to do with ACME Ltd last quarter', 'recent fuel-related entries'). " +
      "Each result includes a 'kind' field (TRANSACTION or INVOICE) so you can branch on the document type. " +
      "Prefer search_transactions when the user specifically wants posted journal entries only. " +
      "Requires prior login.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Natural-language description of the documents to find.",
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "suggest_chart_of_account",
    description:
      "Suggests industry-appropriate, IFRS-compliant chart of account entries to add when no suitable account exists for a transaction line. Call this before blocking a transaction — present the returned suggestions to the user and ask whether they want to add one or proceed with an existing account.",
    inputSchema: {
      type: "object",
      properties: {
        purpose: {
          type: "string",
          description: "What the account is needed for (e.g. 'vehicle fuel expenses', 'software subscription costs', 'room booking revenue').",
        },
        industry: {
          type: "string",
          description:
            "The industry the business operates in (e.g. 'retail', 'construction', 'healthcare', 'hospitality', 'manufacturing', 'technology', 'services', 'agriculture').",
        },
        account_type: {
          type: "string",
          enum: ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"],
          description: "The account type needed for the transaction line.",
        },
      },
      required: ["purpose", "industry", "account_type"],
    },
  },
];

// ─── Handlers ─────────────────────────────────────────────────────────────────

export async function handle(
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult | null> {
  switch (name) {
    case "get_chart_of_accounts":
      return handleGetChartOfAccounts(args);
    case "get_vat_registration_status":
      return handleGetVatRegistrationStatus(args);
    case "create_transaction":
      return handleCreateTransaction(args);
    case "get_transaction_by_reference":
      return handleGetTransactionByReference(args);
    case "create_chart_of_account":
      return handleCreateChartOfAccount(args);
    case "suggest_chart_of_account":
      return handleSuggestChartOfAccount(args);
    case "search_transactions":
      return handleSearchTransactions(args);
    case "search_documents":
      return handleSearchDocuments(args);
    default:
      return null;
  }
}

async function handleGetChartOfAccounts(args: Record<string, unknown>): Promise<ToolResult> {
  const company_id = args.company_id as string;
  const only_parents = args.only_parents as boolean | undefined;
  const onlyParentsArg = only_parents ? `, only_parents: true` : "";

  const query = `
    query {
      chartOfAccounts(company_id: "${company_id}"${onlyParentsArg}) {
        id account_code account_name account_type parent_id category description
        opening_balance is_active
        items { id account_code account_name opening_balance }
        parent { id account_code account_name }
      }
    }
  `;

  const data = (await graphqlRequest(query, undefined, true)) as { chartOfAccounts: unknown[] };
  return { content: [{ type: "text", text: JSON.stringify(data.chartOfAccounts, null, 2) }] };
}

async function handleGetVatRegistrationStatus(args: Record<string, unknown>): Promise<ToolResult> {
  type VatStatus = {
    id: string;
    vat_number: string;
    registered_at: string;
    deregistered_at: string | null;
    is_active: boolean;
  } | null;

  const data = (await graphqlRequest(
    `query { vatRegistrationStatus(company_id: "${args.company_id}") { id vat_number registered_at deregistered_at is_active } }`,
    undefined,
    true
  )) as { vatRegistrationStatus: VatStatus };

  const status = data.vatRegistrationStatus;

  if (!status || !status.is_active) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { vat_registered: false, message: "Company is NOT VAT-registered. Do not include any VAT journal lines." },
            null,
            2
          ),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            vat_registered: true,
            vat_number: status.vat_number,
            registered_at: status.registered_at,
            message:
              "Company IS VAT-registered. Include a VAT journal line: CR VAT Output Tax for sales/revenue, DR VAT Input Tax for expenses/purchases.",
          },
          null,
          2
        ),
      },
    ],
  };
}

async function handleCreateTransaction(args: Record<string, unknown>): Promise<ToolResult> {
  const { company_id, transaction_date, description, reference, source_document, notes, lines } = args as {
    company_id: string;
    transaction_date: string;
    description: string;
    reference: string;
    source_document: string;
    notes: string;
    lines: Array<{ chart_of_account_id: string; type: "DEBIT" | "CREDIT"; amount: number }>;
  };

  if (!source_document || !source_document.trim()) {
    throw new Error(
      "source_document is required. Specify the document this entry is taken from (e.g. 'bank statement', 'supplier invoice')."
    );
  }

  if (!notes || !notes.trim()) {
    throw new Error("notes is required. Provide a short explanatory note (max 10 words).");
  }

  const wordCount = notes.trim().split(/\s+/).length;
  if (wordCount > 10) {
    throw new Error(
      `notes must be 10 words or fewer (got ${wordCount}). Shorten the explanatory note before posting.`
    );
  }

  const totalDebit = lines.filter((l) => l.type === "DEBIT").reduce((s, l) => s + l.amount, 0);
  const totalCredit = lines.filter((l) => l.type === "CREDIT").reduce((s, l) => s + l.amount, 0);

  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new Error(
      `Transaction does not balance. Debits: ${totalDebit}, Credits: ${totalCredit}.`
    );
  }

  const coaData = (await graphqlRequest(
    `query { chartOfAccounts(company_id: "${company_id}") { id account_code account_name items { id } } }`,
    undefined,
    true
  )) as {
    chartOfAccounts: Array<{
      id: string;
      account_code: string;
      account_name: string;
      items: Array<{ id: string }>;
    }>;
  };

  const parentAccounts = new Map<string, { account_code: string; account_name: string }>();
  for (const acc of coaData.chartOfAccounts) {
    if (acc.items && acc.items.length > 0) {
      parentAccounts.set(acc.id, { account_code: acc.account_code, account_name: acc.account_name });
    }
  }

  const offendingLines = lines
    .map((l, idx) => ({ idx, id: l.chart_of_account_id, parent: parentAccounts.get(l.chart_of_account_id) }))
    .filter((l) => l.parent);

  if (offendingLines.length > 0) {
    const details = offendingLines
      .map((l) => `line ${l.idx + 1} -> ${l.parent!.account_code} ${l.parent!.account_name}`)
      .join("; ")
    throw new Error(
      `Cannot post to parent account(s): ${details}. Parent accounts are roll-up containers, not posting accounts. ` +
        `Select a leaf (child) account from the parent's items, or create a new child account via create_chart_of_account.`
    );
  }

  const mutation = `
    mutation CreateTransaction($input: CreateTransactionInput!) {
      createTransaction(input: $input) {
        id description status
        journal_lines {
          type amount
          account { account_code account_name }
        }
      }
    }
  `;

  const data = (await graphqlRequest(
    mutation,
    { input: { company_id, transaction_date, description, reference, source_document, notes, lines } },
    true
  )) as { createTransaction: unknown };

  return {
    content: [{ type: "text", text: JSON.stringify({ success: true, transaction: data.createTransaction }, null, 2) }],
  };
}

async function handleGetTransactionByReference(args: Record<string, unknown>): Promise<ToolResult> {
  const { company_id, reference } = args as { company_id: string; reference: string };

  const query = `
    query GetTransactionByReference($companyId: ID!, $reference: String!) {
      transactionByReference(company_id: $companyId, reference: $reference) {
        id
        transaction_date
        description
        reference
        status
        notes
        source_document
        created_at
        updated_at
        journal_lines {
          id
          type
          amount
          description
          is_vat_line
          vat_rate
          account {
            id
            account_code
            account_name
          }
        }
      }
    }
  `;

  const data = (await graphqlRequest(
    query,
    { companyId: company_id, reference },
    true
  )) as { transactionByReference: unknown };

  if (!data.transactionByReference) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { found: false, message: `No transaction found with reference "${reference}" for company ${company_id}.` },
            null,
            2
          ),
        },
      ],
    };
  }

  return {
    content: [{ type: "text", text: JSON.stringify(data.transactionByReference, null, 2) }],
  };
}

async function handleSearchTransactions(args: Record<string, unknown>): Promise<ToolResult> {
  const { prompt, limit, company_id } = args as {
    prompt: string;
    limit?: number;
    company_id?: string;
  };

  const query = `
    query SearchTransactions($prompt: String!, $limit: Int, $companyId: ID) {
      semanticSearchTransactions(
        prompt: $prompt
        limit: $limit
        min_similarity: 0.5
        company_id: $companyId
      ) {
        transaction_id
        similarity
        amount
        currency
        counterparty
        reference
        tx_date
        transaction {
          description
          status
          company {
            id
            registered_name
          }
          journal_lines {
            type
            amount
            account { account_code account_name }
          }
        }
      }
    }
  `;

  const data = (await graphqlRequest(
    query,
    { prompt, limit: limit ?? 10, companyId: company_id ?? null },
    true
  )) as { semanticSearchTransactions: unknown[] };

  const results = data.semanticSearchTransactions ?? [];

  if (results.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { found: false, message: `No transactions matched "${prompt}" with similarity >= 0.5.` },
            null,
            2
          ),
        },
      ],
    };
  }

  return {
    content: [{ type: "text", text: JSON.stringify({ count: results.length, results }, null, 2) }],
  };
}

async function handleSearchDocuments(args: Record<string, unknown>): Promise<ToolResult> {
  const { prompt } = args as { prompt: string };

  const query = `
    query Search($p: String!) {
      semanticSearchDocuments(prompt: $p, limit: 10, kinds: [TRANSACTION, INVOICE]) {
        kind
        similarity
        amount
        currency
        counterparty
        reference
        doc_date
        transaction { description company { registered_name } }
        invoice     { invoice_number customer_name customer_email }
      }
    }
  `;

  const data = (await graphqlRequest(query, { p: prompt }, true)) as {
    semanticSearchDocuments: unknown[];
  };

  const results = data.semanticSearchDocuments ?? [];

  if (results.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { found: false, message: `No documents matched "${prompt}".` },
            null,
            2
          ),
        },
      ],
    };
  }

  return {
    content: [{ type: "text", text: JSON.stringify({ count: results.length, results }, null, 2) }],
  };
}

async function handleCreateChartOfAccount(args: Record<string, unknown>): Promise<ToolResult> {
  const { company_id, account_name, account_type, expense_class, parent_id, description } = args as {
    company_id: string;
    account_name: string;
    account_type: string;
    expense_class?: string;
    parent_id?: string;
    description?: string;
  };

  const mutation = `
    mutation CreateChartOfAccount($input: CreateChartOfAccountInput!) {
      createChartOfAccount(input: $input) {
        id
        account_code
        account_name
        account_type
        parent_id
        parent_code
        description
        is_active
      }
    }
  `;

  const input: Record<string, unknown> = { company_id, account_name, account_type };
  if (expense_class) input.expense_class = expense_class;
  if (parent_id) input.parent_id = parent_id;
  if (description) input.description = description;

  const data = (await graphqlRequest(mutation, { input }, true)) as { createChartOfAccount: unknown };

  return {
    content: [{ type: "text", text: JSON.stringify({ success: true, account: data.createChartOfAccount }, null, 2) }],
  };
}

// ─── suggest_chart_of_account — static knowledge, no API call ─────────────────

type AccountSuggestion = { account_name: string; suggested_code: string; rationale: string };
type IndustryMap = Partial<Record<string, AccountSuggestion[]>>;

const INDUSTRY_SUGGESTIONS: Record<string, IndustryMap> = {
  retail: {
    REVENUE: [
      { account_name: "Sales Revenue", suggested_code: "4000", rationale: "Primary revenue from product sales" },
      { account_name: "Online Sales Revenue", suggested_code: "4010", rationale: "Revenue from e-commerce channels" },
      { account_name: "Discounts & Returns", suggested_code: "4900", rationale: "Contra revenue for returns and discounts" },
    ],
    EXPENSE: [
      { account_name: "Cost of Goods Sold", suggested_code: "5000", rationale: "Direct cost of products sold" },
      { account_name: "Packaging & Supplies", suggested_code: "5100", rationale: "Packaging materials and shop supplies" },
      { account_name: "Shrinkage & Theft Loss", suggested_code: "5200", rationale: "Losses from shoplifting or inventory shrinkage" },
    ],
    ASSET: [
      { account_name: "Inventory", suggested_code: "1200", rationale: "Stock of goods held for sale" },
      { account_name: "Point of Sale Equipment", suggested_code: "1500", rationale: "POS terminals and cash registers" },
    ],
    LIABILITY: [
      { account_name: "Sales Tax Payable", suggested_code: "2100", rationale: "VAT/sales tax collected, not yet remitted" },
      { account_name: "Customer Deposits", suggested_code: "2200", rationale: "Advance payments from customers" },
    ],
  },
  construction: {
    REVENUE: [
      { account_name: "Contract Revenue", suggested_code: "4000", rationale: "Revenue from construction contracts" },
      { account_name: "Variation/Change Order Revenue", suggested_code: "4100", rationale: "Revenue from approved contract variations" },
    ],
    EXPENSE: [
      { account_name: "Materials & Supplies", suggested_code: "5000", rationale: "Raw materials used in construction" },
      { account_name: "Subcontractor Costs", suggested_code: "5100", rationale: "Payments to subcontractors" },
      { account_name: "Equipment Hire", suggested_code: "5200", rationale: "Cost of renting construction equipment" },
      { account_name: "Site Labour", suggested_code: "5300", rationale: "Direct labour costs on site" },
      { account_name: "Fuel & Machinery", suggested_code: "5400", rationale: "Fuel and running costs for machinery" },
    ],
    ASSET: [
      { account_name: "Work in Progress (WIP)", suggested_code: "1300", rationale: "Costs accumulated on incomplete projects" },
      { account_name: "Plant & Equipment", suggested_code: "1500", rationale: "Owned machinery and construction equipment" },
      { account_name: "Retention Receivable", suggested_code: "1250", rationale: "Amounts held back by clients until project completion" },
    ],
    LIABILITY: [
      { account_name: "Retention Payable", suggested_code: "2150", rationale: "Amounts withheld from subcontractors" },
      { account_name: "Contract Liabilities", suggested_code: "2200", rationale: "Billings in excess of work completed" },
    ],
  },
  healthcare: {
    REVENUE: [
      { account_name: "Patient Services Revenue", suggested_code: "4000", rationale: "Revenue from patient consultations and treatments" },
      { account_name: "Insurance Reimbursements", suggested_code: "4100", rationale: "Amounts reimbursed by health insurers" },
      { account_name: "Lab & Diagnostic Revenue", suggested_code: "4200", rationale: "Revenue from laboratory tests and diagnostics" },
    ],
    EXPENSE: [
      { account_name: "Medical Supplies", suggested_code: "5000", rationale: "Consumable medical supplies" },
      { account_name: "Pharmaceutical Expense", suggested_code: "5100", rationale: "Cost of drugs and medications dispensed" },
      { account_name: "Licensing & Accreditation Fees", suggested_code: "5200", rationale: "Professional licensing and regulatory fees" },
    ],
    ASSET: [
      { account_name: "Medical Equipment", suggested_code: "1500", rationale: "Diagnostic and treatment equipment" },
      { account_name: "Insurance Receivable", suggested_code: "1200", rationale: "Amounts due from insurers" },
    ],
    LIABILITY: [
      { account_name: "Patient Deposits", suggested_code: "2100", rationale: "Advance payments from patients" },
      { account_name: "NHIF/Insurance Payable", suggested_code: "2200", rationale: "Amounts due to insurance schemes" },
    ],
  },
  hospitality: {
    REVENUE: [
      { account_name: "Room Revenue", suggested_code: "4000", rationale: "Revenue from room bookings" },
      { account_name: "Food & Beverage Revenue", suggested_code: "4100", rationale: "Revenue from restaurant and bar" },
      { account_name: "Conference & Events Revenue", suggested_code: "4200", rationale: "Revenue from event hosting" },
      { account_name: "Spa & Leisure Revenue", suggested_code: "4300", rationale: "Revenue from spa and recreational services" },
    ],
    EXPENSE: [
      { account_name: "Food & Beverage Cost", suggested_code: "5000", rationale: "Cost of food and beverages sold" },
      { account_name: "Laundry & Housekeeping Supplies", suggested_code: "5100", rationale: "Housekeeping materials and laundry costs" },
      { account_name: "Guest Amenities", suggested_code: "5200", rationale: "In-room supplies and guest amenities" },
      { account_name: "Booking Platform Commissions", suggested_code: "5300", rationale: "Commissions paid to OTAs and booking platforms" },
    ],
    ASSET: [
      { account_name: "Food & Beverage Inventory", suggested_code: "1200", rationale: "Stock of food and beverages" },
      { account_name: "Furniture, Fixtures & Equipment", suggested_code: "1500", rationale: "Hotel FF&E assets" },
    ],
    LIABILITY: [
      { account_name: "Guest Deposits", suggested_code: "2100", rationale: "Advance deposits from bookings" },
      { account_name: "Tourism Levy Payable", suggested_code: "2200", rationale: "Tourism levies collected from guests" },
    ],
  },
  manufacturing: {
    REVENUE: [
      { account_name: "Product Sales Revenue", suggested_code: "4000", rationale: "Revenue from finished goods sold" },
      { account_name: "Export Revenue", suggested_code: "4100", rationale: "Revenue from international sales" },
    ],
    EXPENSE: [
      { account_name: "Raw Materials", suggested_code: "5000", rationale: "Direct materials used in production" },
      { account_name: "Direct Labour", suggested_code: "5100", rationale: "Labour directly involved in manufacturing" },
      { account_name: "Factory Overhead", suggested_code: "5200", rationale: "Indirect production costs" },
      { account_name: "Machine Maintenance", suggested_code: "5300", rationale: "Cost of maintaining production equipment" },
      { account_name: "Quality Control", suggested_code: "5400", rationale: "QC and testing costs" },
    ],
    ASSET: [
      { account_name: "Raw Materials Inventory", suggested_code: "1200", rationale: "Stock of raw materials" },
      { account_name: "Work in Progress", suggested_code: "1250", rationale: "Partially completed goods" },
      { account_name: "Finished Goods Inventory", suggested_code: "1300", rationale: "Completed goods awaiting sale" },
      { account_name: "Production Machinery", suggested_code: "1500", rationale: "Manufacturing plant and machinery" },
    ],
    LIABILITY: [
      { account_name: "Warranty Provisions", suggested_code: "2100", rationale: "Estimated future warranty costs" },
    ],
  },
  technology: {
    REVENUE: [
      { account_name: "Software License Revenue", suggested_code: "4000", rationale: "Revenue from software licenses" },
      { account_name: "SaaS Subscription Revenue", suggested_code: "4100", rationale: "Recurring subscription revenue" },
      { account_name: "Professional Services Revenue", suggested_code: "4200", rationale: "Revenue from implementation and consulting" },
      { account_name: "Support & Maintenance Revenue", suggested_code: "4300", rationale: "Revenue from support contracts" },
    ],
    EXPENSE: [
      { account_name: "Cloud Infrastructure Costs", suggested_code: "5000", rationale: "AWS, GCP, Azure or similar hosting costs" },
      { account_name: "Software Subscriptions", suggested_code: "5100", rationale: "Third-party SaaS tools used internally" },
      { account_name: "Research & Development", suggested_code: "5200", rationale: "Product development costs" },
      { account_name: "API & Integration Costs", suggested_code: "5300", rationale: "Costs for third-party APIs and integrations" },
    ],
    ASSET: [
      { account_name: "Capitalized Software Development", suggested_code: "1500", rationale: "Internally developed software costs capitalized" },
      { account_name: "Intellectual Property", suggested_code: "1600", rationale: "Patents, trademarks and IP assets" },
    ],
    LIABILITY: [
      { account_name: "Deferred Revenue", suggested_code: "2100", rationale: "Subscription payments received in advance" },
    ],
  },
  services: {
    REVENUE: [
      { account_name: "Service Revenue", suggested_code: "4000", rationale: "General revenue from services rendered" },
      { account_name: "Consulting Revenue", suggested_code: "4100", rationale: "Revenue from advisory and consulting work" },
      { account_name: "Retainer Revenue", suggested_code: "4200", rationale: "Revenue from ongoing retainer agreements" },
    ],
    EXPENSE: [
      { account_name: "Professional Fees", suggested_code: "5000", rationale: "Fees paid to external professionals" },
      { account_name: "Travel & Accommodation", suggested_code: "5100", rationale: "Business travel costs" },
      { account_name: "Subcontractor Fees", suggested_code: "5200", rationale: "Costs of outsourced service delivery" },
      { account_name: "Client Entertainment", suggested_code: "5300", rationale: "Business development entertainment costs" },
    ],
    ASSET: [
      { account_name: "Unbilled Revenue", suggested_code: "1200", rationale: "Work completed but not yet invoiced" },
      { account_name: "Prepaid Expenses", suggested_code: "1250", rationale: "Expenses paid in advance" },
    ],
    LIABILITY: [
      { account_name: "Deferred Revenue", suggested_code: "2100", rationale: "Payments received before service delivery" },
      { account_name: "Accrued Expenses", suggested_code: "2200", rationale: "Expenses incurred but not yet paid" },
    ],
  },
  agriculture: {
    REVENUE: [
      { account_name: "Crop Sales Revenue", suggested_code: "4000", rationale: "Revenue from sale of crops" },
      { account_name: "Livestock Sales Revenue", suggested_code: "4100", rationale: "Revenue from sale of livestock" },
      { account_name: "Government Subsidies", suggested_code: "4200", rationale: "Agricultural subsidies and grants received" },
    ],
    EXPENSE: [
      { account_name: "Seeds & Planting Materials", suggested_code: "5000", rationale: "Cost of seeds and planting stock" },
      { account_name: "Fertilizers & Pesticides", suggested_code: "5100", rationale: "Agricultural chemicals and inputs" },
      { account_name: "Irrigation Costs", suggested_code: "5200", rationale: "Water and irrigation expenses" },
      { account_name: "Harvesting Labour", suggested_code: "5300", rationale: "Seasonal labour for harvesting" },
      { account_name: "Veterinary & Animal Feed", suggested_code: "5400", rationale: "Livestock care costs" },
    ],
    ASSET: [
      { account_name: "Livestock (Biological Assets)", suggested_code: "1400", rationale: "Value of livestock held" },
      { account_name: "Standing Crops", suggested_code: "1350", rationale: "Value of crops not yet harvested" },
      { account_name: "Farm Equipment", suggested_code: "1500", rationale: "Tractors and farming machinery" },
    ],
    LIABILITY: [
      { account_name: "Agricultural Loans Payable", suggested_code: "2300", rationale: "Seasonal or term loans for farming operations" },
    ],
  },
};

async function handleSuggestChartOfAccount(args: Record<string, unknown>): Promise<ToolResult> {
  const purpose = (args.purpose as string).toLowerCase();
  const industry = (args.industry as string).toLowerCase();
  const account_type = args.account_type as string;

  const industryKey =
    Object.keys(INDUSTRY_SUGGESTIONS).find((k) => industry.includes(k)) ?? "services";
  const industrySuggestions = INDUSTRY_SUGGESTIONS[industryKey] ?? INDUSTRY_SUGGESTIONS["services"]!;
  const typeSuggestions: AccountSuggestion[] = industrySuggestions[account_type] ?? [];

  const purposeWords = purpose.split(/\W+/).filter((w) => w.length >= 3);
  const scored = typeSuggestions
    .map((s) => {
      const haystack = `${s.account_name} ${s.rationale}`.toLowerCase();
      const score = purposeWords.reduce((acc, word) => acc + (haystack.includes(word) ? 1 : 0), 0);
      return { ...s, score };
    })
    .sort((a, b) => b.score - a.score);

  const top = scored.slice(0, 3).map(({ score: _score, ...s }) => s);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            message: `No suitable account found for "${args.purpose}". Based on the ${industryKey} industry, here are suggested accounts to add:`,
            industry_detected: industryKey,
            account_type,
            suggestions: top,
            next_steps: [
              "Present these suggestions to the user and ask if they want to add one of these accounts first.",
              "If the user approves adding an account, they should create it in their accounting system, then call get_chart_of_accounts again to get the new account ID.",
              "If the user prefers to proceed without a new account, ask them to select the closest existing account from get_chart_of_accounts and confirm before posting.",
            ],
          },
          null,
          2
        ),
      },
    ],
  };
}
