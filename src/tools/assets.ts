import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { graphqlRequest } from "../lib/graphql.js";

const FLAG_RULE =
  "\n\nACTION FLAGGING (mandatory): After completing this operation, if you identify ANY issue, " +
  "compliance gap, missing information, or recommended follow-up, you MUST call create_action for EACH one — " +
  "do not leave findings only in your text reply. " +
  "Examples: asset missing SARS wear & tear years (triggers IAS 12 deferred tax gap), no PPE class assigned, " +
  "disposal proceeds look unusual, missing acquisition date, deferred tax accounts not yet on the COA. " +
  "Use priority 'high' for compliance/audit risk, 'medium' for accounting estimate issues, 'low' for housekeeping. " +
  "Set related_type='asset' and related_id to the asset ID where applicable.";

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

export const tools: Tool[] = [
  {
    name: "get_assets",
    description:
      "Fetch PPE (IAS 16) assets on the asset register for a company. " +
      "Returns each asset with cost, residual value, useful life, depreciation method, status, and links to the original posting transaction and (if disposed) the disposal transaction. " +
      "Use this whenever the user asks about owned assets, asset register, depreciation, or wants to confirm whether an asset already exists before creating a new one. " +
      "Requires prior login.",
    inputSchema: {
      type: "object",
      properties: {
        company_id: { type: "string", description: "The ID of the company whose assets to list." },
        status: {
          type: "string",
          enum: ["ACTIVE", "DISPOSED", "ALL"],
          description: "Filter by status. Defaults to ACTIVE.",
        },
      },
      required: ["company_id"],
    },
  },
  {
    name: "get_asset",
    description:
      "Fetch a single PPE asset by ID, including its current status, cost, and the GL transaction that recognised it on acquisition. " +
      "Requires prior login.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The asset ID to fetch." },
      },
      required: ["id"],
    },
  },
  {
    name: "get_asset_depreciation_schedule",
    description:
      "Fetch the full depreciation schedule for a PPE asset — one row per period (e.g. '2026-06') showing the monthly depreciation amount, accumulated depreciation, carrying value, and whether the entry has already been posted to the GL. " +
      "Use this to answer 'what's the depreciation for X this month?', 'what's the carrying value?', or 'has depreciation been posted yet?'. " +
      "Requires prior login.",
    inputSchema: {
      type: "object",
      properties: {
        asset_id: { type: "string", description: "The asset ID whose schedule to retrieve." },
      },
      required: ["asset_id"],
    },
  },
  {
    name: "create_asset",
    description:
      "Register a new PPE (IAS 16) asset on the asset register. " +
      "USE THIS — NOT create_transaction — for any purchase or initial recognition of property, plant & equipment under IAS 16. " +
      "IMPORTANT: Calling create_asset is the ONLY step needed. Do NOT also call create_transaction — the system posts the acquisition journal (Dr PPE Cost / Cr Bank or Payable) automatically via a background queue. " +
      "If you call create_transaction for the same purchase, the entry will be DOUBLE-POSTED. " +
      "Cost should reflect IAS 16 recognition costs: purchase price net of trade discounts, import duties and non-refundable taxes, directly attributable costs of bringing the asset to its location and working condition, and the initial estimate of dismantling/restoration costs. " +
      "Always confirm cost components, useful life, residual value, SARS wear & tear allowance (for IAS 12 deferred tax), and depreciation method with the user before calling. " +
      "Requires prior login." +
      FLAG_RULE,
    inputSchema: {
      type: "object",
      properties: {
        company_id: { type: "string", description: "The ID of the company that owns the asset." },
        ppe_class_id: { type: "string", description: "The PPE class this asset belongs to (e.g. 'Motor Vehicles', 'Office Equipment')." },
        name: { type: "string", description: "Human-readable asset name (e.g. 'Toyota Hilux GP123-456')." },
        asset_tag: { type: "string", description: "Optional internal asset tag / barcode." },
        location: { type: "string", description: "Optional physical location of the asset." },
        acquisition_date: { type: "string", description: "Date the asset was acquired, in YYYY-MM-DD format." },
        cost: { type: "number", description: "IAS 16 recognition cost of the asset." },
        residual_value: { type: "number", description: "Expected residual value at end of useful life. Optional." },
        useful_life_years: { type: "number", description: "Estimated IFRS useful life in years. Optional." },
        sars_wear_tear_years: { type: "number", description: "SARS S11(e) wear & tear allowance life in years. When different from useful_life_years, IAS 12 deferred tax is posted alongside depreciation. Optional." },
        depreciation_method: {
          type: "string",
          enum: ["straight_line", "reducing_balance"],
          description: "Depreciation method. Optional.",
        },
        notes: { type: "string", description: "Optional notes about the asset." },
      },
      required: ["company_id", "ppe_class_id", "name", "acquisition_date", "cost"],
    },
  },
  {
    name: "update_asset",
    description:
      "Update mutable fields on a PPE asset (name, asset_tag, location, residual_value, useful_life_years, depreciation_method, notes). " +
      "Use this for revisions of accounting estimates under IAS 16 — e.g. changes to useful life, residual value, or depreciation method. " +
      "Changes to cost or acquisition date are NOT permitted via this tool. " +
      "Requires prior login." +
      FLAG_RULE,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The asset ID to update." },
        name: { type: "string" },
        asset_tag: { type: "string" },
        location: { type: "string" },
        residual_value: { type: "number" },
        useful_life_years: { type: "number" },
        sars_wear_tear_years: { type: "number", description: "SARS S11(e) wear & tear life in years. Triggers IAS 12 deferred tax when different from IFRS useful life." },
        depreciation_method: { type: "string", enum: ["straight_line", "reducing_balance"] },
        notes: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "dispose_asset",
    description:
      "Dispose of a PPE asset under IAS 16. " +
      "USE THIS — NOT create_transaction — when an asset is sold, scrapped, or otherwise derecognised. " +
      "The system posts the disposal journal entry automatically (gain/loss on disposal, derecognition of cost and accumulated depreciation) once the queue processes the request. " +
      "Confirm the disposal date and any proceeds with the user before calling. " +
      "Requires prior login." +
      FLAG_RULE,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The asset ID being disposed." },
        disposal_date: { type: "string", description: "Disposal date in YYYY-MM-DD format." },
        disposal_proceeds: {
          type: "number",
          description: "Cash/consideration received on disposal. Omit or pass 0 for scrapped assets.",
        },
      },
      required: ["id", "disposal_date"],
    },
  },
];

// ─── Handlers ─────────────────────────────────────────────────────────────────

export async function handle(
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult | null> {
  switch (name) {
    case "get_assets":
      return handleGetAssets(args);
    case "get_asset":
      return handleGetAsset(args);
    case "get_asset_depreciation_schedule":
      return handleGetAssetDepreciationSchedule(args);
    case "create_asset":
      return handleCreateAsset(args);
    case "update_asset":
      return handleUpdateAsset(args);
    case "dispose_asset":
      return handleDisposeAsset(args);
    default:
      return null;
  }
}

async function handleGetAssets(args: Record<string, unknown>): Promise<ToolResult> {
  const { company_id, status } = args as { company_id: string; status?: "ACTIVE" | "DISPOSED" | "ALL" };

  const query = `
    query Assets($companyId: ID!, $status: AssetStatus) {
      assets(company_id: $companyId, status: $status) {
        id
        name
        asset_tag
        status
        cost
        residual_value
        useful_life_years
        sars_wear_tear_years
        depreciation_method
        acquisition_date
        disposal_date
        disposal_proceeds
        last_depreciation_posted_on
        ppe_class { id name }
        company   { id registered_name }
        posting_transaction  { id reference }
        disposal_transaction { id reference }
      }
    }
  `;

  const data = (await graphqlRequest(
    query,
    { companyId: company_id, status: status ?? "ACTIVE" },
    true
  )) as { assets: unknown[] };

  return { content: [{ type: "text", text: JSON.stringify(data.assets, null, 2) }] };
}

async function handleGetAsset(args: Record<string, unknown>): Promise<ToolResult> {
  const { id } = args as { id: string };

  const query = `
    query OneAsset($id: ID!) {
      asset(id: $id) {
        name
        status
        cost
        posting_transaction { id description }
      }
    }
  `;

  const data = (await graphqlRequest(query, { id }, true)) as { asset: unknown };

  if (!data.asset) {
    return {
      content: [
        { type: "text", text: JSON.stringify({ found: false, message: `No asset with id ${id}.` }, null, 2) },
      ],
    };
  }

  return { content: [{ type: "text", text: JSON.stringify(data.asset, null, 2) }] };
}

async function handleGetAssetDepreciationSchedule(args: Record<string, unknown>): Promise<ToolResult> {
  const { asset_id } = args as { asset_id: string };

  const query = `
    query Schedule($id: ID!) {
      assetDepreciationSchedule(asset_id: $id) {
        period
        depreciation
        accumulated
        carrying_value
        posted
      }
    }
  `;

  const data = (await graphqlRequest(query, { id: asset_id }, true)) as {
    assetDepreciationSchedule: unknown[];
  };

  return {
    content: [{ type: "text", text: JSON.stringify(data.assetDepreciationSchedule, null, 2) }],
  };
}

async function handleCreateAsset(args: Record<string, unknown>): Promise<ToolResult> {
  const input: Record<string, unknown> = {
    company_id: args.company_id,
    ppe_class_id: args.ppe_class_id,
    name: args.name,
    acquisition_date: args.acquisition_date,
    cost: args.cost,
  };

  for (const k of [
    "asset_tag",
    "location",
    "residual_value",
    "useful_life_years",
    "depreciation_method",
    "notes",
  ] as const) {
    if (args[k] !== undefined) input[k] = args[k];
  }

  const mutation = `
    mutation Create($input: CreateAssetInput!) {
      createAsset(input: $input) {
        id
        name
        status
      }
    }
  `;

  const data = (await graphqlRequest(mutation, { input }, true)) as { createAsset: unknown };

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            success: true,
            asset: data.createAsset,
            note: "Recognition journal entry will be posted automatically on the next queue tick — posting_transaction_id will populate shortly.",
          },
          null,
          2
        ),
      },
    ],
  };
}

async function handleUpdateAsset(args: Record<string, unknown>): Promise<ToolResult> {
  const { id } = args as { id: string };
  const input: Record<string, unknown> = {};

  for (const k of [
    "name",
    "asset_tag",
    "location",
    "residual_value",
    "useful_life_years",
    "depreciation_method",
    "notes",
  ] as const) {
    if (args[k] !== undefined) input[k] = args[k];
  }

  if (Object.keys(input).length === 0) {
    throw new Error("update_asset requires at least one field to change.");
  }

  const mutation = `
    mutation Update($id: ID!, $input: UpdateAssetInput!) {
      updateAsset(id: $id, input: $input) {
        id
        name
        location
      }
    }
  `;

  const data = (await graphqlRequest(mutation, { id, input }, true)) as { updateAsset: unknown };

  return {
    content: [{ type: "text", text: JSON.stringify({ success: true, asset: data.updateAsset }, null, 2) }],
  };
}

async function handleDisposeAsset(args: Record<string, unknown>): Promise<ToolResult> {
  const { id, disposal_date, disposal_proceeds } = args as {
    id: string;
    disposal_date: string;
    disposal_proceeds?: number;
  };

  const mutation = `
    mutation Dispose($id: ID!, $date: Date!, $proceeds: Float) {
      disposeAsset(id: $id, disposal_date: $date, disposal_proceeds: $proceeds) {
        id
        status
        disposal_date
        disposal_proceeds
      }
    }
  `;

  const data = (await graphqlRequest(
    mutation,
    { id, date: disposal_date, proceeds: disposal_proceeds ?? null },
    true
  )) as { disposeAsset: unknown };

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            success: true,
            asset: data.disposeAsset,
            note: "Disposal journal entry will be posted automatically on the next queue tick — disposal_transaction_id will populate shortly.",
          },
          null,
          2
        ),
      },
    ],
  };
}
