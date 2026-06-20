import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getBearerToken } from "../lib/graphql.js";

const API_BASE = "http://localhost:8000/api";

async function apiPost(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const token = getBearerToken();
  if (!token) throw new Error("Not authenticated. Please run the login tool first.");
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const json = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error((json.message as string) ?? `HTTP ${response.status}`);
  return json;
}

async function apiGet(path: string): Promise<Record<string, unknown>> {
  const token = getBearerToken();
  if (!token) throw new Error("Not authenticated. Please run the login tool first.");
  const response = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  const json = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error((json.message as string) ?? `HTTP ${response.status}`);
  return json;
}

async function apiPatch(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const token = getBearerToken();
  if (!token) throw new Error("Not authenticated. Please run the login tool first.");
  const response = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const json = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error((json.message as string) ?? `HTTP ${response.status}`);
  return json;
}

const FLAG_RULE =
  "\n\nACTION FLAGGING (mandatory): After completing this operation, if you identify ANY issue, " +
  "compliance gap, missing information, or recommended follow-up, you MUST call create_action for EACH one — " +
  "do not leave findings only in your text reply. " +
  "Examples: intangible class missing accounting policy, indefinite-life intangible without annual impairment test logged, " +
  "goodwill flagged for revaluation (prohibited), missing useful life on a finite-life intangible. " +
  "Use priority 'high' for compliance/audit risk, 'medium' for accounting estimate issues, 'low' for housekeeping. " +
  "Set related_type='intangible_asset' and related_id to the intangible ID where applicable.";

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

export const tools: Tool[] = [
  {
    name: "get_intangibles",
    description:
      "Fetch IAS 38 intangible assets on the register for a company. " +
      "Returns each intangible with cost, residual value, useful life (or indefinite flag), amortisation method, status, " +
      "accumulated amortisation, accumulated impairment, and revaluation surplus. " +
      "Use this whenever the user asks about intangibles, software, patents, trademarks, goodwill, or licences. " +
      "Requires prior login.",
    inputSchema: {
      type: "object",
      properties: {
        company_id: { type: "string", description: "The ID of the company whose intangibles to list." },
        status: {
          type: "string",
          enum: ["active", "disposed", "all"],
          description: "Filter by status. Defaults to active.",
        },
      },
      required: ["company_id"],
    },
  },
  {
    name: "get_intangible_asset",
    description:
      "Fetch a single IAS 38 intangible by ID, including its current carrying amount, accumulated amortisation, " +
      "accumulated impairment, revaluation surplus, and posting transactions. " +
      "Requires prior login.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The intangible ID to fetch." },
      },
      required: ["id"],
    },
  },
  {
    name: "create_intangible_asset",
    description:
      "Register a new IAS 38 intangible asset (software, patent, trademark, goodwill, customer list, licence, etc.). " +
      "USE THIS — NOT create_transaction — for initial recognition of an intangible asset. " +
      "IMPORTANT: Calling create_intangible_asset is the ONLY step needed. Do NOT also call create_transaction — " +
      "the system records an acquisition event immediately and dispatches a background job that has the AI post the " +
      "acquisition journal (Dr Intangible Cost / Cr Bank or Payable) automatically. " +
      "If you call create_transaction for the same purchase, the entry will be DOUBLE-POSTED. " +
      "Per IAS 38.21, only recognise an intangible when it is identifiable, controlled, and probable to generate future " +
      "economic benefits, AND the cost can be measured reliably. Internally generated goodwill and most internally generated " +
      "intangibles (other than capitalised development costs under IAS 38.57) do NOT qualify for recognition — flag the user " +
      "and stop if they ask you to create one. " +
      "For indefinite-life intangibles (IAS 38.107) set useful_life_indefinite=true and omit useful_life_years; the system " +
      "will skip amortisation and only require annual impairment testing. " +
      "Always confirm cost components, useful life (or indefinite), residual value (usually zero for intangibles — IAS 38.100), " +
      "and amortisation method with the user before calling. " +
      "Requires prior login." +
      FLAG_RULE,
    inputSchema: {
      type: "object",
      properties: {
        company_id:             { type: "string", description: "The ID of the company that owns the intangible." },
        intangible_class_id:    { type: "string", description: "The intangible class (e.g. 'Software', 'Trademarks', 'Goodwill'). Optional but recommended." },
        name:                   { type: "string", description: "Human-readable intangible name (e.g. 'SAP ERP Licence', 'Coca-Cola Trademark')." },
        reference:              { type: "string", description: "Optional internal reference / asset tag." },
        category:               { type: "string", description: "Optional category (e.g. 'Software', 'Brand', 'Customer list')." },
        acquisition_date:       { type: "string", description: "Date the intangible was acquired, in YYYY-MM-DD format." },
        cost:                   { type: "number", description: "IAS 38.27 recognition cost: purchase price, import duties, non-refundable taxes, and directly attributable costs of preparing the asset for its intended use." },
        residual_value:         { type: "number", description: "Expected residual value at end of useful life. IAS 38.100: presumed zero unless there is a third-party commitment or active market. Optional, defaults to 0." },
        useful_life_years:      { type: "number", description: "Estimated useful life in years for finite-life intangibles. Omit if useful_life_indefinite=true." },
        useful_life_indefinite: { type: "boolean", description: "Set to true for indefinite-life intangibles (IAS 38.107). They are NOT amortised — only impairment-tested annually." },
        amortisation_method:    { type: "string", enum: ["straight_line", "reducing_balance"], description: "Amortisation method. Straight-line is the IAS 38.97 default. Ignored when useful_life_indefinite=true." },
        notes:                  { type: "string", description: "Optional notes about the intangible." },
      },
      required: ["company_id", "name", "acquisition_date", "cost"],
    },
  },
  {
    name: "update_intangible_asset",
    description:
      "Update mutable fields on an IAS 38 intangible (name, reference, category, residual_value, useful_life_years, " +
      "useful_life_indefinite, amortisation_method, notes). " +
      "Use this for revisions of accounting estimates under IAS 38 — e.g. changes to useful life, residual value, or " +
      "amortisation method. Per IAS 38.109, a change from indefinite to finite life is itself an indicator of impairment. " +
      "Changes to cost or acquisition date are NOT permitted via this tool. " +
      "Requires prior login." +
      FLAG_RULE,
    inputSchema: {
      type: "object",
      properties: {
        id:                     { type: "string", description: "The intangible ID to update." },
        name:                   { type: "string" },
        reference:              { type: "string" },
        category:               { type: "string" },
        residual_value:         { type: "number" },
        useful_life_years:      { type: "number" },
        useful_life_indefinite: { type: "boolean" },
        amortisation_method:    { type: "string", enum: ["straight_line", "reducing_balance"] },
        notes:                  { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "dispose_intangible_asset",
    description:
      "Dispose of an IAS 38 intangible asset (sale, retirement, abandonment). " +
      "USE THIS — NOT create_transaction — when an intangible is sold, retired, or derecognised (IAS 38.112). " +
      "The system records the disposal event immediately and dispatches the AI to post the disposal journal " +
      "(Dr Bank for proceeds, Dr accumulated amortisation, Dr accumulated impairment, Cr Intangible cost, " +
      "gain or loss on disposal to P&L). " +
      "Confirm the disposal date and any proceeds with the user before calling. " +
      "Requires prior login." +
      FLAG_RULE,
    inputSchema: {
      type: "object",
      properties: {
        id:                { type: "string", description: "The intangible ID being disposed." },
        disposal_date:     { type: "string", description: "Disposal date in YYYY-MM-DD format." },
        disposal_proceeds: { type: "number", description: "Cash/consideration received. Omit or pass 0 for retired/abandoned items." },
      },
      required: ["id", "disposal_date"],
    },
  },
  {
    name: "revalue_intangible_asset",
    description:
      "IAS 38.75 Revaluation Model — revalue an intangible whose class uses the revaluation model. " +
      "IMPORTANT: IAS 38.75 only permits revaluation where fair value is determinable by reference to an ACTIVE MARKET. " +
      "Most intangibles (goodwill, trademarks, patents, brands, customer lists, magazine titles) do NOT have an active market " +
      "and cannot be revalued. Confirm with the user that an active market exists before calling. Goodwill revaluation is " +
      "always prohibited and will be rejected. " +
      "The system records the event immediately and dispatches the AI to post the full revaluation journal:\n" +
      "  • Upward: eliminates accumulated amortisation, increases cost, credits Revaluation Surplus (OCI).\n" +
      "  • Downward: first exhausts any existing OCI surplus, then routes the excess to Impairment Loss (P&L).\n" +
      "Requires prior login." +
      FLAG_RULE,
    inputSchema: {
      type: "object",
      properties: {
        id:                  { type: "string", description: "The intangible ID to revalue." },
        new_carrying_amount: { type: "number", description: "The IFRS fair-value carrying amount after revaluation. Must be positive." },
        date:                { type: "string", description: "Effective date of the revaluation in YYYY-MM-DD format." },
      },
      required: ["id", "new_carrying_amount", "date"],
    },
  },
  {
    name: "impair_intangible_asset",
    description:
      "IAS 36 Impairment — recognise a write-down of an intangible when its recoverable amount falls below its carrying amount. " +
      "Goodwill and indefinite-life intangibles MUST be impairment-tested annually per IAS 36.10 (and on every triggering event). " +
      "Finite-life intangibles are tested only when there is an impairment indicator. " +
      "The system records the event immediately and dispatches the AI to post the impairment journal:\n" +
      "  • For revaluation-model intangibles: first exhausts any remaining OCI Revaluation Surplus, then routes the excess to P&L.\n" +
      "  • For cost-model intangibles: posts Dr Impairment Loss (P&L) / Cr Accumulated Impairment in full.\n" +
      "Confirm the recoverable amount (higher of FVLCTS and VIU) with the user before calling. " +
      "Requires prior login." +
      FLAG_RULE,
    inputSchema: {
      type: "object",
      properties: {
        id:                { type: "string", description: "The intangible ID to impair." },
        impairment_amount: { type: "number", description: "The impairment charge — difference between carrying amount and recoverable amount. Must be positive and not exceed the current carrying amount." },
        date:              { type: "string", description: "Impairment date in YYYY-MM-DD format." },
        reason:            { type: "string", description: "Brief reason (e.g. 'technological obsolescence', 'market exit', 'lost key customer')." },
      },
      required: ["id", "impairment_amount", "date"],
    },
  },
  {
    name: "reverse_intangible_impairment",
    description:
      "IAS 36.114 Impairment Reversal — reverse a previously recognised impairment when the recoverable amount has recovered. " +
      "The reversal is capped at the lesser of the cumulative impairment or the carrying amount the asset would have had without " +
      "the impairment (no write-up above amortised cost). " +
      "IMPORTANT: IAS 36.124 PROHIBITS reversal of goodwill impairments. The system blocks this automatically; do not call this " +
      "tool for goodwill intangibles. " +
      "Posts Dr Accumulated Impairment / Cr Impairment Reversal Income (P&L). " +
      "Requires prior login." +
      FLAG_RULE,
    inputSchema: {
      type: "object",
      properties: {
        id:              { type: "string", description: "The intangible ID whose impairment to partially or fully reverse." },
        reversal_amount: { type: "number", description: "The reversal amount. Capped automatically at accumulated impairment." },
        date:            { type: "string", description: "Reversal date in YYYY-MM-DD format." },
      },
      required: ["id", "reversal_amount", "date"],
    },
  },
  {
    name: "capitalise_intangible_subsequent_cost",
    description:
      "IAS 38.18/.20 Subsequent Expenditure — capitalise a subsequent cost that extends the future economic benefits of an " +
      "existing intangible. " +
      "IMPORTANT: IAS 38.20 requires MOST subsequent expenditure on intangibles to be EXPENSED (not capitalised). Capitalisation " +
      "is only appropriate for a major upgrade that materially extends the asset's useful life or capabilities (e.g. a major " +
      "version upgrade of capitalised software). Use create_transaction for routine maintenance, configuration changes, or fixes. " +
      "Posts Dr Intangible Cost / Cr Bank or Payable and increases the intangible's cost on the register. " +
      "Requires prior login." +
      FLAG_RULE,
    inputSchema: {
      type: "object",
      properties: {
        id:          { type: "string", description: "The intangible ID to which the subsequent cost is added." },
        amount:      { type: "number", description: "Amount to capitalise." },
        date:        { type: "string", description: "Date of the expenditure in YYYY-MM-DD format." },
        description: { type: "string", description: "Brief description (e.g. 'SAP S/4HANA major version upgrade')." },
      },
      required: ["id", "amount", "date"],
    },
  },
];

// ─── Handlers ─────────────────────────────────────────────────────────────────

export async function handle(
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult | null> {
  switch (name) {
    case "get_intangibles":                       return handleGetIntangibles(args);
    case "get_intangible_asset":                  return handleGetIntangible(args);
    case "create_intangible_asset":               return handleCreateIntangible(args);
    case "update_intangible_asset":               return handleUpdateIntangible(args);
    case "dispose_intangible_asset":              return handleDisposeIntangible(args);
    case "revalue_intangible_asset":              return handleRevalueIntangible(args);
    case "impair_intangible_asset":               return handleImpairIntangible(args);
    case "reverse_intangible_impairment":         return handleReverseIntangibleImpairment(args);
    case "capitalise_intangible_subsequent_cost": return handleCapitaliseIntangibleSubsequentCost(args);
    default: return null;
  }
}

async function handleGetIntangibles(args: Record<string, unknown>): Promise<ToolResult> {
  const { company_id, status } = args as { company_id: string; status?: "active" | "disposed" | "all" };
  const qs = new URLSearchParams({ company_id, status: status ?? "active" }).toString();
  const result = await apiGet(`/intangibles?${qs}`);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

async function handleGetIntangible(args: Record<string, unknown>): Promise<ToolResult> {
  const { id } = args as { id: string };
  const result = await apiGet(`/intangibles/${id}`);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

async function handleCreateIntangible(args: Record<string, unknown>): Promise<ToolResult> {
  const body: Record<string, unknown> = {
    company_id:       args.company_id,
    name:             args.name,
    acquisition_date: args.acquisition_date,
    cost:             args.cost,
  };
  for (const k of [
    "intangible_class_id",
    "reference",
    "category",
    "residual_value",
    "useful_life_years",
    "useful_life_indefinite",
    "amortisation_method",
    "notes",
  ] as const) {
    if (args[k] !== undefined) body[k] = args[k];
  }
  const result = await apiPost("/intangibles", body);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

async function handleUpdateIntangible(args: Record<string, unknown>): Promise<ToolResult> {
  const { id } = args as { id: string };
  const body: Record<string, unknown> = {};
  for (const k of [
    "name",
    "reference",
    "category",
    "residual_value",
    "useful_life_years",
    "useful_life_indefinite",
    "amortisation_method",
    "notes",
  ] as const) {
    if (args[k] !== undefined) body[k] = args[k];
  }
  if (Object.keys(body).length === 0) {
    throw new Error("update_intangible_asset requires at least one field to change.");
  }
  const result = await apiPatch(`/intangibles/${id}`, body);
  return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result }, null, 2) }] };
}

async function handleDisposeIntangible(args: Record<string, unknown>): Promise<ToolResult> {
  const { id, disposal_date, disposal_proceeds } = args as {
    id: string; disposal_date: string; disposal_proceeds?: number;
  };
  const body: Record<string, unknown> = { disposal_date };
  if (disposal_proceeds !== undefined) body.disposal_proceeds = disposal_proceeds;
  const result = await apiPost(`/intangibles/${id}/dispose`, body);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

async function handleRevalueIntangible(args: Record<string, unknown>): Promise<ToolResult> {
  const { id, new_carrying_amount, date } = args as {
    id: string; new_carrying_amount: number; date: string;
  };
  const result = await apiPost(`/intangibles/${id}/revalue`, { new_carrying_amount, date });
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

async function handleImpairIntangible(args: Record<string, unknown>): Promise<ToolResult> {
  const { id, impairment_amount, date, reason } = args as {
    id: string; impairment_amount: number; date: string; reason?: string;
  };
  const body: Record<string, unknown> = { impairment_amount, date };
  if (reason) body.reason = reason;
  const result = await apiPost(`/intangibles/${id}/impair`, body);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

async function handleReverseIntangibleImpairment(args: Record<string, unknown>): Promise<ToolResult> {
  const { id, reversal_amount, date } = args as {
    id: string; reversal_amount: number; date: string;
  };
  const result = await apiPost(`/intangibles/${id}/reverse-impairment`, { reversal_amount, date });
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

async function handleCapitaliseIntangibleSubsequentCost(args: Record<string, unknown>): Promise<ToolResult> {
  const { id, amount, date, description } = args as {
    id: string; amount: number; date: string; description?: string;
  };
  const body: Record<string, unknown> = { amount, date };
  if (description) body.description = description;
  const result = await apiPost(`/intangibles/${id}/capitalise`, body);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}
