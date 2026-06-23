import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getBearerToken } from "../lib/graphql.js";

const API_BASE = "http://localhost:8000/api";

async function apiGet(path: string): Promise<unknown> {
  const token = getBearerToken();
  if (!token) throw new Error("Not authenticated. Please run the login tool first.");
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  const json = await response.json();
  if (!response.ok) throw new Error((json as Record<string, unknown>).message as string ?? `HTTP ${response.status}`);
  return json;
}

async function apiPost(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const token = getBearerToken();
  if (!token) throw new Error("Not authenticated. Please run the login tool first.");
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
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
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
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
  "Use priority 'high' for compliance/audit risk, 'medium' for accounting estimate issues, 'low' for housekeeping. " +
  "Set related_type='biological_asset' and related_id to the asset ID where applicable.";

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

export const tools: Tool[] = [
  {
    name: "get_biological_assets",
    description:
      "Fetch IAS 41 biological assets for a company. " +
      "Returns each asset with quantity, unit, cost, fair value, FV gain/loss, carrying amount, and status. " +
      "Biological assets are living animals or plants managed for agricultural activity. " +
      "Requires prior login.",
    inputSchema: {
      type: "object",
      properties: {
        company_id: { type: "string", description: "The ID of the company whose biological assets to list." },
      },
      required: ["company_id"],
    },
  },
  {
    name: "get_biological_asset",
    description:
      "Fetch a single IAS 41 biological asset by ID with full details. Requires prior login.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The biological asset ID to fetch." },
      },
      required: ["id"],
    },
  },
  {
    name: "create_biological_asset",
    description:
      "Register a new IAS 41 biological asset. " +
      "USE THIS — NOT create_transaction — for initial recognition of biological assets (living animals or plants). " +
      "The system posts the acquisition journal automatically via a background queue. " +
      "Examples: livestock herds, timber plantations, fruit orchards, fish farms, crop fields. " +
      "IAS 41 requires measurement at fair value less costs to sell at each reporting date, with changes in P&L. " +
      "Requires prior login." +
      FLAG_RULE,
    inputSchema: {
      type: "object",
      properties: {
        company_id: { type: "string", description: "The ID of the company." },
        biological_asset_class_id: { type: "string", description: "Optional class ID." },
        name: { type: "string", description: "Asset name (e.g. 'Nguni Herd', 'Pine Plantation Block A')." },
        reference: { type: "string", description: "Optional reference code." },
        location: { type: "string", description: "Optional physical location." },
        acquisition_date: { type: "string", description: "Date acquired in YYYY-MM-DD format." },
        quantity: { type: "number", description: "Number of units (e.g. 150 head, 20 hectares)." },
        unit: { type: "string", description: "Unit of measure (e.g. 'head', 'hectares', 'trees')." },
        cost: { type: "number", description: "Acquisition cost." },
        fair_value: { type: "number", description: "Current fair value less costs to sell (optional at acquisition)." },
        fair_value_date: { type: "string", description: "Date of fair value determination (YYYY-MM-DD)." },
        notes: { type: "string", description: "Optional notes." },
      },
      required: ["company_id", "name", "acquisition_date", "quantity", "unit", "cost"],
    },
  },
  {
    name: "update_biological_asset",
    description:
      "Update mutable fields on an IAS 41 biological asset (name, reference, location, quantity, unit, notes). " +
      "Requires prior login." +
      FLAG_RULE,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The biological asset ID to update." },
        name: { type: "string" },
        reference: { type: "string" },
        location: { type: "string" },
        quantity: { type: "number" },
        unit: { type: "string" },
        notes: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "fair_value_adjust_biological_asset",
    description:
      "IAS 41.12 Fair Value Adjustment — re-measure a biological asset at fair value less costs to sell. " +
      "The gain or loss is recognised in profit or loss for the period (IAS 41.26). " +
      "This should be done at each reporting date or whenever fair value changes significantly. " +
      "Requires prior login." +
      FLAG_RULE,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The biological asset ID." },
        new_fair_value: { type: "number", description: "The new fair value less costs to sell. Must be positive." },
        date: { type: "string", description: "Effective date in YYYY-MM-DD format." },
      },
      required: ["id", "new_fair_value", "date"],
    },
  },
  {
    name: "harvest_biological_asset",
    description:
      "IAS 41.13 Harvest — record the harvesting of agricultural produce from a biological asset. " +
      "Agricultural produce is measured at fair value less costs to sell at the point of harvest (IAS 41.13). " +
      "After harvest, the produce becomes inventory under IAS 2. " +
      "Dr Agricultural Produce (inventory) / Cr Biological Asset. " +
      "Requires prior login." +
      FLAG_RULE,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The biological asset ID from which produce is harvested." },
        fair_value_at_harvest: { type: "number", description: "Fair value less costs to sell of the harvested produce." },
        quantity: { type: "number", description: "Quantity harvested (in the asset's unit of measure)." },
        date: { type: "string", description: "Harvest date in YYYY-MM-DD format." },
        description: { type: "string", description: "Brief description (e.g. 'Timber harvest Block A — 50 tonnes')." },
      },
      required: ["id", "fair_value_at_harvest", "quantity", "date"],
    },
  },
  {
    name: "dispose_biological_asset",
    description:
      "IAS 41.27 Disposal — dispose of a biological asset on sale or retirement. " +
      "Gain or loss = proceeds minus carrying amount, recognised in P&L. " +
      "USE THIS — NOT create_transaction — when selling or derecognising a biological asset. " +
      "Requires prior login." +
      FLAG_RULE,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The biological asset ID." },
        disposal_date: { type: "string", description: "Disposal date in YYYY-MM-DD format." },
        disposal_proceeds: { type: "number", description: "Cash/consideration received. Omit or 0 for write-offs." },
      },
      required: ["id", "disposal_date"],
    },
  },
];

export async function handle(
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult | null> {
  switch (name) {
    case "get_biological_assets":
      return handleGetAll(args);
    case "get_biological_asset":
      return handleGetOne(args);
    case "create_biological_asset":
      return handleCreate(args);
    case "update_biological_asset":
      return handleUpdate(args);
    case "fair_value_adjust_biological_asset":
      return handleFairValueAdjust(args);
    case "harvest_biological_asset":
      return handleHarvest(args);
    case "dispose_biological_asset":
      return handleDispose(args);
    default:
      return null;
  }
}

async function handleGetAll(args: Record<string, unknown>): Promise<ToolResult> {
  const data = await apiGet(`/biological-assets?company_id=${args.company_id}`);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

async function handleGetOne(args: Record<string, unknown>): Promise<ToolResult> {
  const data = await apiGet(`/biological-assets/${args.id}`);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

async function handleCreate(args: Record<string, unknown>): Promise<ToolResult> {
  const body: Record<string, unknown> = {
    company_id: args.company_id,
    name: args.name,
    acquisition_date: args.acquisition_date,
    quantity: args.quantity,
    unit: args.unit,
    cost: args.cost,
  };
  for (const k of ["biological_asset_class_id", "reference", "location", "fair_value", "fair_value_date", "notes"]) {
    if (args[k] !== undefined) body[k] = args[k];
  }
  const result = await apiPost("/biological-assets", body);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

async function handleUpdate(args: Record<string, unknown>): Promise<ToolResult> {
  const { id, ...body } = args;
  const result = await apiPatch(`/biological-assets/${id}`, body);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

async function handleFairValueAdjust(args: Record<string, unknown>): Promise<ToolResult> {
  const { id, ...body } = args;
  const result = await apiPost(`/biological-assets/${id}/fair-value-adjust`, body as Record<string, unknown>);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

async function handleHarvest(args: Record<string, unknown>): Promise<ToolResult> {
  const { id, ...body } = args;
  const result = await apiPost(`/biological-assets/${id}/harvest`, body as Record<string, unknown>);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

async function handleDispose(args: Record<string, unknown>): Promise<ToolResult> {
  const { id, ...body } = args;
  const result = await apiPost(`/biological-assets/${id}/dispose`, body as Record<string, unknown>);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}
