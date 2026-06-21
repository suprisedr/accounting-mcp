import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getBearerToken } from "../lib/graphql.js";

const API_BASE = "http://localhost:8000/api";

async function apiGet(path: string): Promise<Record<string, unknown>> {
  const token = getBearerToken();
  if (!token) throw new Error("Not authenticated. Please run the login tool first.");
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  const json = (await response.json()) as Record<string, unknown>;
  if (!response.ok) throw new Error((json.message as string) ?? `HTTP ${response.status}`);
  return json;
}

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
  const json = (await response.json()) as Record<string, unknown>;
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
  const json = (await response.json()) as Record<string, unknown>;
  if (!response.ok) throw new Error((json.message as string) ?? `HTTP ${response.status}`);
  return json;
}

const FLAG_RULE =
  "\n\nACTION FLAGGING (mandatory): After completing this operation, if you identify ANY issue, " +
  "compliance gap, missing information, or recommended follow-up, you MUST call create_action for EACH one — " +
  "do not leave findings only in your text reply. " +
  "Examples: lease missing IBR justification, short-term exemption applied to a lease > 12 months, " +
  "ROU asset not matched to a COA account, missing counterparty details, lease nearing expiry without renewal decision. " +
  "Use priority 'high' for compliance/audit risk, 'medium' for accounting estimate issues, 'low' for housekeeping. " +
  "Set related_type='lease' and related_id to the lease ID where applicable.";

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

export const tools: Tool[] = [
  {
    name: "get_leases",
    description:
      "Fetch IFRS 16 leases on the lease register for a company. " +
      "Returns each lease with ROU asset cost, accumulated depreciation, net book value, lease liability balance, status, and key terms. " +
      "Use this whenever the user asks about leases, right-of-use assets, lease liabilities, or wants to confirm whether a lease already exists before creating one. " +
      "Requires prior login.",
    inputSchema: {
      type: "object",
      properties: {
        company_id: { type: "string", description: "The ID of the company whose leases to list." },
        status: {
          type: "string",
          enum: ["active", "terminated", "expired", "exempt", "all"],
          description: "Filter by status. Defaults to all.",
        },
      },
      required: ["company_id"],
    },
  },
  {
    name: "get_lease",
    description:
      "Fetch a single IFRS 16 lease by ID, including its current ROU NBV, liability balance, event history, and all terms. " +
      "Requires prior login.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The lease ID to fetch." },
      },
      required: ["id"],
    },
  },
  {
    name: "get_lease_schedule",
    description:
      "Fetch the full amortisation schedule for a lease — one row per month showing payment split (interest vs capital), " +
      "lease liability balance, monthly depreciation, and ROU net book value. " +
      "Use this to answer 'what's the interest expense for month X?', 'what's the liability balance at year-end?', etc. " +
      "Requires prior login.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The lease ID whose schedule to retrieve." },
      },
      required: ["id"],
    },
  },
  {
    name: "create_lease",
    description:
      "Recognise a new IFRS 16 lease on the lease register. Supports both lessee and lessor roles.\n" +
      "LESSEE (default): The system calculates the PV of lease payments (lease liability) and ROU asset cost (PV + initial direct costs). " +
      "Short-term (≤ 12 months) and low-value leases can be exempt per IFRS 16.5–8.\n" +
      "LESSOR — FINANCE LEASE (IFRS 16.67): Substantially all risks/rewards transfer. The system calculates the net investment in the lease " +
      "(PV of payments + PV of unguaranteed residual) and unearned finance income. Income is recognised using the effective interest method.\n" +
      "LESSOR — OPERATING LEASE (IFRS 16.81): Risks/rewards do not transfer. Rental income is recognised on a straight-line basis.\n" +
      "Always confirm the role, classification (for lessor), IBR, lease term, and payment amount with the user before calling. " +
      "Requires prior login." +
      FLAG_RULE,
    inputSchema: {
      type: "object",
      properties: {
        company_id: { type: "string", description: "The ID of the company." },
        role: {
          type: "string",
          enum: ["lessee", "lessor"],
          description: "Whether the company is the lessee (rents from someone) or lessor (leases out to someone). Defaults to 'lessee'.",
        },
        classification: {
          type: "string",
          enum: ["finance", "operating"],
          description: "For lessor leases only. 'finance' = substantially all risks/rewards transfer (IFRS 16.63). 'operating' = they don't (IFRS 16.56). Required when role is 'lessor'.",
        },
        name: { type: "string", description: "Description of the leased asset (e.g. 'Office lease — 123 Main St')." },
        asset_tag: { type: "string", description: "Optional internal reference tag." },
        category: {
          type: "string",
          enum: ["property", "vehicle", "equipment", "it", "other"],
          description: "Lease category. Defaults to 'property'.",
        },
        counterparty: { type: "string", description: "Name of the counterparty (lessor if lessee, lessee if lessor)." },
        commencement_date: { type: "string", description: "Lease commencement date in YYYY-MM-DD format." },
        end_date: { type: "string", description: "Lease end date in YYYY-MM-DD format." },
        monthly_payment: { type: "number", description: "Fixed monthly lease payment amount." },
        payment_frequency: {
          type: "string",
          enum: ["monthly", "quarterly", "annually"],
          description: "Payment frequency. Defaults to monthly.",
        },
        incremental_borrowing_rate: {
          type: "number",
          description: "Annual rate as a decimal (e.g. 0.10 for 10%). For lessee: IBR. For lessor finance lease: implicit rate.",
        },
        initial_direct_costs: { type: "number", description: "Initial direct costs. For lessee: added to ROU cost. Optional." },
        residual_value_guarantee: { type: "number", description: "Residual value guarantee amount. Optional." },
        asset_fair_value: { type: "number", description: "Fair value of the underlying asset. For lessor finance leases. Optional." },
        unguaranteed_residual: { type: "number", description: "Unguaranteed residual value accruing to the lessor. For lessor finance leases. Optional." },
        is_short_term: { type: "boolean", description: "True if short-term lease (≤ 12 months) exempt under IFRS 16.5. Lessee only." },
        is_low_value: { type: "boolean", description: "True if low-value asset, exempt under IFRS 16.5. Lessee only." },
        location: { type: "string", description: "Physical location of the leased asset. Optional." },
        notes: { type: "string", description: "Additional notes. Optional." },
      },
      required: ["company_id", "name", "commencement_date", "end_date", "monthly_payment", "incremental_borrowing_rate"],
    },
  },
  {
    name: "update_lease",
    description:
      "Update mutable descriptive fields on a lease (name, asset_tag, category, counterparty, location, notes). " +
      "For changes to payment terms or lease duration, use modify_lease instead. " +
      "Requires prior login." +
      FLAG_RULE,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The lease ID to update." },
        name: { type: "string" },
        asset_tag: { type: "string" },
        category: { type: "string", enum: ["property", "vehicle", "equipment", "it", "other"] },
        counterparty: { type: "string" },
        location: { type: "string" },
        notes: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "modify_lease",
    description:
      "IFRS 16.44–46 Lease Modification — record a change in the scope or consideration of a lease that was not part of the original terms. " +
      "Examples: extending the lease term, changing the monthly payment, adding/removing leased space. " +
      "The system remeasures the lease liability using the revised payments discounted at the original IBR, " +
      "and adjusts the ROU asset by the same amount. " +
      "Confirm the new terms with the user before calling. " +
      "Requires prior login." +
      FLAG_RULE,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The lease ID to modify." },
        event_date: { type: "string", description: "Effective date of the modification in YYYY-MM-DD format." },
        new_end_date: { type: "string", description: "New lease end date in YYYY-MM-DD format." },
        new_monthly_payment: { type: "number", description: "New monthly payment amount." },
        description: { type: "string", description: "Brief description of the modification (e.g. 'Extended by 24 months at increased rental')." },
      },
      required: ["id", "event_date", "new_end_date", "new_monthly_payment"],
    },
  },
  {
    name: "impair_lease",
    description:
      "IAS 36 Impairment — record an impairment loss on the right-of-use asset when its recoverable amount falls below its carrying amount. " +
      "The impairment is applied to the ROU asset (not the lease liability). " +
      "Confirm the recoverable amount with the user before calling. " +
      "Requires prior login." +
      FLAG_RULE,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The lease ID whose ROU asset to impair." },
        amount: {
          type: "number",
          description: "The impairment charge. Must be positive and not exceed the current ROU net book value.",
        },
        date: { type: "string", description: "Impairment date in YYYY-MM-DD format." },
        reason: {
          type: "string",
          description: "Brief reason for impairment (e.g. 'sublease market decline', 'physical damage to leased premises').",
        },
      },
      required: ["id", "amount", "date"],
    },
  },
  {
    name: "reverse_lease_impairment",
    description:
      "IAS 36.114 — reverse a previously recognised impairment on the ROU asset when the recoverable amount has recovered. " +
      "The reversal is capped at the accumulated impairment. " +
      "Requires prior login." +
      FLAG_RULE,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The lease ID whose ROU impairment to reverse." },
        amount: {
          type: "number",
          description: "The reversal amount. Capped at accumulated impairment.",
        },
        date: { type: "string", description: "Reversal date in YYYY-MM-DD format." },
      },
      required: ["id", "amount", "date"],
    },
  },
  {
    name: "terminate_lease",
    description:
      "IFRS 16.B98 Early Termination — derecognise the ROU asset and lease liability when a lease is terminated before its contractual end. " +
      "The system calculates the gain or loss as the difference between the derecognised liability and the derecognised ROU asset NBV. " +
      "Confirm the termination date with the user before calling. " +
      "Requires prior login." +
      FLAG_RULE,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The lease ID to terminate." },
        termination_date: { type: "string", description: "Early termination date in YYYY-MM-DD format." },
        description: { type: "string", description: "Brief reason (e.g. 'Break clause exercised', 'Mutual agreement')." },
      },
      required: ["id", "termination_date"],
    },
  },
];

// ─── Handlers ─────────────────────────────────────────────────────────────────

export async function handle(
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult | null> {
  switch (name) {
    case "get_leases":
      return handleGetLeases(args);
    case "get_lease":
      return handleGetLease(args);
    case "get_lease_schedule":
      return handleGetLeaseSchedule(args);
    case "create_lease":
      return handleCreateLease(args);
    case "update_lease":
      return handleUpdateLease(args);
    case "modify_lease":
      return handleModifyLease(args);
    case "impair_lease":
      return handleImpairLease(args);
    case "reverse_lease_impairment":
      return handleReverseLeaseImpairment(args);
    case "terminate_lease":
      return handleTerminateLease(args);
    default:
      return null;
  }
}

async function handleGetLeases(args: Record<string, unknown>): Promise<ToolResult> {
  const { company_id, status } = args as { company_id: string; status?: string };
  const params = new URLSearchParams({ company_id });
  if (status) params.set("status", status);

  const data = await apiGet(`/leases?${params.toString()}`);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

async function handleGetLease(args: Record<string, unknown>): Promise<ToolResult> {
  const { id } = args as { id: string };
  const data = await apiGet(`/leases/${id}`);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

async function handleGetLeaseSchedule(args: Record<string, unknown>): Promise<ToolResult> {
  const { id } = args as { id: string };
  const data = await apiGet(`/leases/${id}/schedule`);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

async function handleCreateLease(args: Record<string, unknown>): Promise<ToolResult> {
  const body: Record<string, unknown> = {
    company_id: args.company_id,
    name: args.name,
    commencement_date: args.commencement_date,
    end_date: args.end_date,
    monthly_payment: args.monthly_payment,
    incremental_borrowing_rate: args.incremental_borrowing_rate,
    category: args.category ?? "property",
    role: args.role ?? "lessee",
  };

  for (const k of [
    "classification",
    "asset_tag",
    "counterparty",
    "payment_frequency",
    "initial_direct_costs",
    "residual_value_guarantee",
    "asset_fair_value",
    "unguaranteed_residual",
    "is_short_term",
    "is_low_value",
    "location",
    "notes",
  ] as const) {
    if (args[k] !== undefined) body[k] = args[k];
  }

  const result = await apiPost("/leases", body);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

async function handleUpdateLease(args: Record<string, unknown>): Promise<ToolResult> {
  const { id } = args as { id: string };
  const body: Record<string, unknown> = {};

  for (const k of ["name", "asset_tag", "category", "counterparty", "location", "notes"] as const) {
    if (args[k] !== undefined) body[k] = args[k];
  }

  if (Object.keys(body).length === 0) {
    throw new Error("update_lease requires at least one field to change.");
  }

  const result = await apiPatch(`/leases/${id}`, body);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

async function handleModifyLease(args: Record<string, unknown>): Promise<ToolResult> {
  const { id, event_date, new_end_date, new_monthly_payment, description } = args as {
    id: string;
    event_date: string;
    new_end_date: string;
    new_monthly_payment: number;
    description?: string;
  };

  const body: Record<string, unknown> = { event_date, new_end_date, new_monthly_payment };
  if (description) body.description = description;

  const result = await apiPost(`/leases/${id}/modify`, body);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

async function handleImpairLease(args: Record<string, unknown>): Promise<ToolResult> {
  const { id, amount, date, reason } = args as {
    id: string;
    amount: number;
    date: string;
    reason?: string;
  };

  const body: Record<string, unknown> = { amount, date };
  if (reason) body.reason = reason;

  const result = await apiPost(`/leases/${id}/impair`, body);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

async function handleReverseLeaseImpairment(args: Record<string, unknown>): Promise<ToolResult> {
  const { id, amount, date } = args as { id: string; amount: number; date: string };
  const result = await apiPost(`/leases/${id}/reverse-impairment`, { amount, date });
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

async function handleTerminateLease(args: Record<string, unknown>): Promise<ToolResult> {
  const { id, termination_date, description } = args as {
    id: string;
    termination_date: string;
    description?: string;
  };

  const body: Record<string, unknown> = { termination_date };
  if (description) body.description = description;

  const result = await apiPost(`/leases/${id}/terminate`, body);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}
