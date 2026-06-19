import { graphqlRequest, getBearerToken } from "../lib/graphql.js";
const API_BASE = "http://localhost:8000/api";
async function apiPost(path, body) {
    const token = getBearerToken();
    if (!token)
        throw new Error("Not authenticated. Please run the login tool first.");
    const response = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });
    const json = await response.json();
    if (!response.ok)
        throw new Error(json.message ?? `HTTP ${response.status}`);
    return json;
}
const FLAG_RULE = "\n\nACTION FLAGGING (mandatory): After completing this operation, if you identify ANY issue, " +
    "compliance gap, missing information, or recommended follow-up, you MUST call create_action for EACH one — " +
    "do not leave findings only in your text reply. " +
    "Examples: asset missing SARS wear & tear years (triggers IAS 12 deferred tax gap), no PPE class assigned, " +
    "disposal proceeds look unusual, missing acquisition date, deferred tax accounts not yet on the COA. " +
    "Use priority 'high' for compliance/audit risk, 'medium' for accounting estimate issues, 'low' for housekeeping. " +
    "Set related_type='asset' and related_id to the asset ID where applicable.";
export const tools = [
    {
        name: "get_assets",
        description: "Fetch PPE (IAS 16) assets on the asset register for a company. " +
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
        description: "Fetch a single PPE asset by ID, including its current status, cost, and the GL transaction that recognised it on acquisition. " +
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
        description: "Fetch the full depreciation schedule for a PPE asset — one row per period (e.g. '2026-06') showing the monthly depreciation amount, accumulated depreciation, carrying value, and whether the entry has already been posted to the GL. " +
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
        description: "Register a new PPE (IAS 16) asset on the asset register. " +
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
        description: "Update mutable fields on a PPE asset (name, asset_tag, location, residual_value, useful_life_years, depreciation_method, notes). " +
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
        description: "Dispose of a PPE asset under IAS 16. " +
            "USE THIS — NOT create_transaction — when an asset is sold, scrapped, or otherwise derecognised. " +
            "The system records the disposal event immediately and dispatches the journal posting to a background job (AI selects accounts and posts the journal automatically). " +
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
    {
        name: "revalue_asset",
        description: "IAS 16.31 Revaluation Model — record a revaluation event for a PPE asset whose class uses the revaluation model. " +
            "Pass the new IFRS fair-value carrying amount (after revaluation) and the effective date. " +
            "The event is saved immediately and a background job dispatches the AI to post the full revaluation journal:\n" +
            "  • Upward: eliminates accumulated depreciation, increases cost, credits Revaluation Surplus (OCI), and recognises IAS 12 deferred tax on the surplus.\n" +
            "  • Downward: first exhausts any existing OCI surplus (IAS 16.40), then routes the excess to Impairment Loss (P&L).\n" +
            "IMPORTANT: Only call this for assets whose PPE class accounting_policy is 'revaluation'. For cost-model assets, use impair_asset instead. " +
            "Requires prior login." +
            FLAG_RULE,
        inputSchema: {
            type: "object",
            properties: {
                id: { type: "string", description: "The asset ID to revalue." },
                new_carrying_amount: {
                    type: "number",
                    description: "The IFRS fair-value carrying amount after revaluation. Must be positive.",
                },
                date: { type: "string", description: "Effective date of the revaluation in YYYY-MM-DD format." },
            },
            required: ["id", "new_carrying_amount", "date"],
        },
    },
    {
        name: "impair_asset",
        description: "IAS 36 Impairment — record an impairment event for a PPE asset when its recoverable amount falls below its carrying amount. " +
            "The event is saved immediately and a background job dispatches the AI to post the impairment journal:\n" +
            "  • For revaluation-model assets: first exhausts any remaining OCI Revaluation Surplus (IAS 36.60), then routes the excess to Impairment Loss (P&L).\n" +
            "  • For cost-model assets: posts Dr Impairment Loss (P&L) / Cr Accumulated Impairment in full.\n" +
            "Confirm the recoverable amount (higher of FVLCTS and VIU) with the user before calling. " +
            "Requires prior login." +
            FLAG_RULE,
        inputSchema: {
            type: "object",
            properties: {
                id: { type: "string", description: "The asset ID to impair." },
                impairment_amount: {
                    type: "number",
                    description: "The impairment charge — difference between carrying amount and recoverable amount. Must be positive and not exceed the current carrying amount.",
                },
                date: { type: "string", description: "Impairment date in YYYY-MM-DD format." },
                reason: {
                    type: "string",
                    description: "Brief reason for impairment (e.g. 'physical damage', 'market decline', 'obsolescence'). Included in the journal notes.",
                },
            },
            required: ["id", "impairment_amount", "date"],
        },
    },
    {
        name: "reverse_impairment",
        description: "IAS 36.114 Impairment Reversal — record a reversal of a previously recognised impairment charge when the recoverable amount has recovered. " +
            "The reversal is capped at the lesser of the cumulative impairment or what the carrying amount would have been without the impairment (no write-up above depreciated cost). " +
            "The event is saved immediately and a background job dispatches the AI to post Dr Accumulated Impairment / Cr Impairment Reversal Income (P&L). " +
            "IMPORTANT: Reversals of goodwill impairments are prohibited (IAS 36.124) — do not call this for goodwill. " +
            "Requires prior login." +
            FLAG_RULE,
        inputSchema: {
            type: "object",
            properties: {
                id: { type: "string", description: "The asset ID whose impairment to partially or fully reverse." },
                reversal_amount: {
                    type: "number",
                    description: "The amount of the reversal. Capped automatically at accumulated impairment.",
                },
                date: { type: "string", description: "Reversal date in YYYY-MM-DD format." },
            },
            required: ["id", "reversal_amount", "date"],
        },
    },
    {
        name: "capitalise_subsequent_cost",
        description: "IAS 16.7 Subsequent Expenditure — record a subsequent cost event for an asset that meets the recognition criteria: " +
            "they extend the asset's useful life, add productive capacity, or represent replacement of a significant component. " +
            "DO NOT use this for routine maintenance and repairs — those are expensed via create_transaction. " +
            "The event is saved immediately and a background job dispatches the AI to post Dr PPE Cost / Cr Bank or Payable and increase the asset's cost on the register. " +
            "Requires prior login." +
            FLAG_RULE,
        inputSchema: {
            type: "object",
            properties: {
                id: { type: "string", description: "The asset ID to which the subsequent cost is added." },
                amount: { type: "number", description: "Amount to capitalise." },
                date: { type: "string", description: "Date of the expenditure in YYYY-MM-DD format." },
                description: {
                    type: "string",
                    description: "Brief description of the expenditure (e.g. 'Engine overhaul extending life by 3 years', 'Roof replacement').",
                },
            },
            required: ["id", "amount", "date"],
        },
    },
];
// ─── Handlers ─────────────────────────────────────────────────────────────────
export async function handle(name, args) {
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
        case "revalue_asset":
            return handleRevalueAsset(args);
        case "impair_asset":
            return handleImpairAsset(args);
        case "reverse_impairment":
            return handleReverseImpairment(args);
        case "capitalise_subsequent_cost":
            return handleCapitaliseSubsequentCost(args);
        default:
            return null;
    }
}
async function handleGetAssets(args) {
    const { company_id, status } = args;
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
        accumulated_impairment
        revaluation_surplus
        ppe_class { id name useful_life_years depreciation_method accounting_policy }
        company   { id registered_name }
        posting_transaction  { id reference }
        disposal_transaction { id reference }
      }
    }
  `;
    const data = (await graphqlRequest(query, { companyId: company_id, status: status ?? "ACTIVE" }, true));
    return { content: [{ type: "text", text: JSON.stringify(data.assets, null, 2) }] };
}
async function handleGetAsset(args) {
    const { id } = args;
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
    const data = (await graphqlRequest(query, { id }, true));
    if (!data.asset) {
        return {
            content: [
                { type: "text", text: JSON.stringify({ found: false, message: `No asset with id ${id}.` }, null, 2) },
            ],
        };
    }
    return { content: [{ type: "text", text: JSON.stringify(data.asset, null, 2) }] };
}
async function handleGetAssetDepreciationSchedule(args) {
    const { asset_id } = args;
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
    const data = (await graphqlRequest(query, { id: asset_id }, true));
    return {
        content: [{ type: "text", text: JSON.stringify(data.assetDepreciationSchedule, null, 2) }],
    };
}
async function handleCreateAsset(args) {
    const body = {
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
        "sars_wear_tear_years",
        "depreciation_method",
        "notes",
    ]) {
        if (args[k] !== undefined)
            body[k] = args[k];
    }
    const result = await apiPost("/assets", body);
    return {
        content: [{
                type: "text",
                text: JSON.stringify(result, null, 2),
            }],
    };
}
async function handleUpdateAsset(args) {
    const { id } = args;
    const body = {};
    for (const k of [
        "name",
        "asset_tag",
        "location",
        "residual_value",
        "useful_life_years",
        "sars_wear_tear_years",
        "depreciation_method",
        "notes",
    ]) {
        if (args[k] !== undefined)
            body[k] = args[k];
    }
    if (Object.keys(body).length === 0) {
        throw new Error("update_asset requires at least one field to change.");
    }
    const token = getBearerToken();
    if (!token)
        throw new Error("Not authenticated. Please run the login tool first.");
    const response = await fetch(`${API_BASE}/assets/${id}`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok)
        throw new Error(result.message ?? `HTTP ${response.status}`);
    return {
        content: [{ type: "text", text: JSON.stringify({ success: true, ...result }, null, 2) }],
    };
}
async function handleDisposeAsset(args) {
    const { id, disposal_date, disposal_proceeds } = args;
    const body = { disposal_date };
    if (disposal_proceeds !== undefined)
        body.disposal_proceeds = disposal_proceeds;
    const result = await apiPost(`/assets/${id}/dispose`, body);
    return {
        content: [{
                type: "text",
                text: JSON.stringify(result, null, 2),
            }],
    };
}
async function handleRevalueAsset(args) {
    const { id, new_carrying_amount, date } = args;
    const result = await apiPost(`/assets/${id}/revalue`, { new_carrying_amount, date });
    return {
        content: [{
                type: "text",
                text: JSON.stringify(result, null, 2),
            }],
    };
}
async function handleImpairAsset(args) {
    const { id, impairment_amount, date, reason } = args;
    const body = { impairment_amount, date };
    if (reason)
        body.reason = reason;
    const result = await apiPost(`/assets/${id}/impair`, body);
    return {
        content: [{
                type: "text",
                text: JSON.stringify(result, null, 2),
            }],
    };
}
async function handleReverseImpairment(args) {
    const { id, reversal_amount, date } = args;
    const result = await apiPost(`/assets/${id}/reverse-impairment`, { reversal_amount, date });
    return {
        content: [{
                type: "text",
                text: JSON.stringify(result, null, 2),
            }],
    };
}
async function handleCapitaliseSubsequentCost(args) {
    const { id, amount, date, description } = args;
    const body = { amount, date };
    if (description)
        body.description = description;
    const result = await apiPost(`/assets/${id}/capitalise`, body);
    return {
        content: [{
                type: "text",
                text: JSON.stringify(result, null, 2),
            }],
    };
}
