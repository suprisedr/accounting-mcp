import { getBearerToken } from "../lib/graphql.js";
const API_BASE = "http://localhost:8000/api";
async function apiGet(path) {
    const token = getBearerToken();
    if (!token)
        throw new Error("Not authenticated. Please run the login tool first.");
    const response = await fetch(`${API_BASE}${path}`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
    const json = await response.json();
    if (!response.ok)
        throw new Error(json.message ?? `HTTP ${response.status}`);
    return json;
}
async function apiPost(path, body) {
    const token = getBearerToken();
    if (!token)
        throw new Error("Not authenticated. Please run the login tool first.");
    const response = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
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
    "Use priority 'high' for compliance/audit risk, 'medium' for accounting estimate issues, 'low' for housekeeping. " +
    "Set related_type='asset' and related_id to the asset ID where applicable.";
export const tools = [
    {
        name: "get_held_for_sale_assets",
        description: "Fetch IFRS 5 assets held for sale for a company. " +
            "Returns each item with the underlying PPE asset details, reclassification date, carrying amount, FVLCTS, impairment write-down, and status (held_for_sale, sold, reversed). " +
            "Requires prior login.",
        inputSchema: {
            type: "object",
            properties: {
                company_id: { type: "string", description: "The ID of the company whose held-for-sale assets to list." },
            },
            required: ["company_id"],
        },
    },
    {
        name: "get_held_for_sale_asset",
        description: "Fetch a single IFRS 5 held-for-sale asset by ID with full details. Requires prior login.",
        inputSchema: {
            type: "object",
            properties: {
                id: { type: "string", description: "The held-for-sale record ID to fetch." },
            },
            required: ["id"],
        },
    },
    {
        name: "reclassify_asset_held_for_sale",
        description: "IFRS 5 Reclassification — reclassify an active PPE asset as held for sale. " +
            "USE THIS when a non-current asset is available for immediate sale in its present condition and the sale is highly probable within 12 months. " +
            "Depreciation ceases on reclassification. The asset is measured at the lower of carrying amount and fair value less costs to sell (FVLCTS). " +
            "If FVLCTS is below carrying amount, an impairment write-down is recognised in P&L. " +
            "The asset moves from the PPE register to the held-for-sale register. " +
            "IMPORTANT: Do NOT also call create_transaction — the system posts the reclassification journal automatically. " +
            "Requires prior login." +
            FLAG_RULE,
        inputSchema: {
            type: "object",
            properties: {
                asset_id: { type: "string", description: "The PPE asset ID to reclassify. Must be an active asset." },
                reclassification_date: { type: "string", description: "Date of reclassification in YYYY-MM-DD format." },
                fair_value_less_costs_to_sell: {
                    type: "number",
                    description: "Fair value less costs to sell. If below carrying amount, an IFRS 5 write-down is recognised. Optional.",
                },
                expected_sale_date: { type: "string", description: "Expected date of sale (YYYY-MM-DD). Should be within 12 months of reclassification." },
                buyer_details: { type: "string", description: "Details of the prospective buyer, if known." },
                notes: { type: "string", description: "Additional context for the reclassification." },
            },
            required: ["asset_id", "reclassification_date"],
        },
    },
    {
        name: "reverse_held_for_sale",
        description: "IFRS 5.26-29 Reversal — reverse the held-for-sale classification and return the asset to PPE. " +
            "Use when the held-for-sale criteria are no longer met. The asset is measured at the lower of its carrying amount before reclassification (adjusted for depreciation that would have been recognised) and its recoverable amount. " +
            "Requires prior login." +
            FLAG_RULE,
        inputSchema: {
            type: "object",
            properties: {
                id: { type: "string", description: "The held-for-sale record ID to reverse." },
                reversal_date: { type: "string", description: "Date of reversal in YYYY-MM-DD format." },
            },
            required: ["id", "reversal_date"],
        },
    },
    {
        name: "sell_held_for_sale_asset",
        description: "IFRS 5.25 Disposal — record the actual sale of a held-for-sale asset. " +
            "Gain or loss = proceeds minus IFRS 5 carrying amount, recognised in P&L. " +
            "USE THIS — NOT create_transaction or dispose_asset — for selling an asset that is on the held-for-sale register. " +
            "Requires prior login." +
            FLAG_RULE,
        inputSchema: {
            type: "object",
            properties: {
                id: { type: "string", description: "The held-for-sale record ID." },
                disposal_date: { type: "string", description: "Sale date in YYYY-MM-DD format." },
                disposal_proceeds: { type: "number", description: "Cash/consideration received on sale." },
            },
            required: ["id", "disposal_date"],
        },
    },
];
export async function handle(name, args) {
    switch (name) {
        case "get_held_for_sale_assets":
            return handleGetAll(args);
        case "get_held_for_sale_asset":
            return handleGetOne(args);
        case "reclassify_asset_held_for_sale":
            return handleReclassify(args);
        case "reverse_held_for_sale":
            return handleReverse(args);
        case "sell_held_for_sale_asset":
            return handleSell(args);
        default:
            return null;
    }
}
async function handleGetAll(args) {
    const data = await apiGet(`/held-for-sale?company_id=${args.company_id}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
async function handleGetOne(args) {
    const data = await apiGet(`/held-for-sale/${args.id}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
async function handleReclassify(args) {
    const { asset_id, ...body } = args;
    const result = await apiPost(`/assets/${asset_id}/reclassify-held-for-sale`, body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}
async function handleReverse(args) {
    const { id, ...body } = args;
    const result = await apiPost(`/held-for-sale/${id}/reverse`, body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}
async function handleSell(args) {
    const { id, ...body } = args;
    const result = await apiPost(`/held-for-sale/${id}/dispose`, body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}
