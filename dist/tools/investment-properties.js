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
async function apiPatch(path, body) {
    const token = getBearerToken();
    if (!token)
        throw new Error("Not authenticated. Please run the login tool first.");
    const response = await fetch(`${API_BASE}${path}`, {
        method: "PATCH",
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
    "Set related_type='investment_property' and related_id to the property ID where applicable.";
export const tools = [
    {
        name: "get_investment_properties",
        description: "Fetch IAS 40 investment properties for a company. " +
            "Returns each property with cost, measurement model (cost or fair value), fair value, carrying amount, and status. " +
            "Requires prior login.",
        inputSchema: {
            type: "object",
            properties: {
                company_id: { type: "string", description: "The ID of the company whose investment properties to list." },
            },
            required: ["company_id"],
        },
    },
    {
        name: "get_investment_property",
        description: "Fetch a single IAS 40 investment property by ID with full details. Requires prior login.",
        inputSchema: {
            type: "object",
            properties: {
                id: { type: "string", description: "The investment property ID to fetch." },
            },
            required: ["id"],
        },
    },
    {
        name: "create_investment_property",
        description: "Register a new IAS 40 investment property. " +
            "USE THIS — NOT create_transaction — for initial recognition of investment property under IAS 40. " +
            "The system posts the acquisition journal automatically via a background queue. " +
            "Investment property is property held to earn rentals or for capital appreciation (or both), not for owner-occupation or sale in the ordinary course of business. " +
            "Requires prior login." +
            FLAG_RULE,
        inputSchema: {
            type: "object",
            properties: {
                company_id: { type: "string", description: "The ID of the company that owns the property." },
                investment_property_class_id: { type: "string", description: "Optional class ID for the property." },
                name: { type: "string", description: "Property name (e.g. 'Office block, 123 Main Rd')." },
                property_reference: { type: "string", description: "Optional reference (e.g. erf number)." },
                location: { type: "string", description: "Optional physical address/location." },
                acquisition_date: { type: "string", description: "Date acquired in YYYY-MM-DD format." },
                cost: { type: "number", description: "IAS 40 recognition cost." },
                residual_value: { type: "number", description: "Expected residual value (cost model only)." },
                useful_life_years: { type: "number", description: "Estimated useful life in years (cost model only)." },
                depreciation_method: { type: "string", enum: ["straight_line", "reducing_balance"], description: "Depreciation method (cost model only)." },
                fair_value: { type: "number", description: "Current fair value (fair value model)." },
                fair_value_date: { type: "string", description: "Date of fair value determination (YYYY-MM-DD)." },
                notes: { type: "string", description: "Optional notes." },
            },
            required: ["company_id", "name", "acquisition_date", "cost"],
        },
    },
    {
        name: "update_investment_property",
        description: "Update mutable fields on an IAS 40 investment property (name, reference, location, residual_value, useful_life_years, depreciation_method, notes). " +
            "Requires prior login." +
            FLAG_RULE,
        inputSchema: {
            type: "object",
            properties: {
                id: { type: "string", description: "The investment property ID to update." },
                name: { type: "string" },
                property_reference: { type: "string" },
                location: { type: "string" },
                residual_value: { type: "number" },
                useful_life_years: { type: "number" },
                depreciation_method: { type: "string", enum: ["straight_line", "reducing_balance"] },
                notes: { type: "string" },
            },
            required: ["id"],
        },
    },
    {
        name: "fair_value_adjust_investment_property",
        description: "IAS 40.35 Fair Value Adjustment — record a fair value change for an investment property measured under the fair value model. " +
            "The gain or loss is recognised in profit or loss (NOT OCI). " +
            "Only use for properties whose class uses the fair value measurement model. " +
            "Requires prior login." +
            FLAG_RULE,
        inputSchema: {
            type: "object",
            properties: {
                id: { type: "string", description: "The investment property ID." },
                new_fair_value: { type: "number", description: "The new fair value amount. Must be positive." },
                date: { type: "string", description: "Effective date in YYYY-MM-DD format." },
            },
            required: ["id", "new_fair_value", "date"],
        },
    },
    {
        name: "impair_investment_property",
        description: "IAS 36 Impairment — record an impairment event for an investment property measured under the cost model. " +
            "Fair value model properties should use fair_value_adjust_investment_property instead. " +
            "Requires prior login." +
            FLAG_RULE,
        inputSchema: {
            type: "object",
            properties: {
                id: { type: "string", description: "The investment property ID." },
                impairment_amount: { type: "number", description: "The impairment charge amount." },
                date: { type: "string", description: "Impairment date in YYYY-MM-DD format." },
                reason: { type: "string", description: "Brief reason for impairment." },
            },
            required: ["id", "impairment_amount", "date"],
        },
    },
    {
        name: "reverse_investment_property_impairment",
        description: "IAS 36.114 Impairment Reversal — reverse a previously recognised impairment on an investment property (cost model). " +
            "Requires prior login." +
            FLAG_RULE,
        inputSchema: {
            type: "object",
            properties: {
                id: { type: "string", description: "The investment property ID." },
                reversal_amount: { type: "number", description: "Amount to reverse. Capped at accumulated impairment." },
                date: { type: "string", description: "Reversal date in YYYY-MM-DD format." },
            },
            required: ["id", "reversal_amount", "date"],
        },
    },
    {
        name: "capitalise_investment_property_cost",
        description: "IAS 40.17 Subsequent Expenditure — capitalise subsequent costs that meet recognition criteria for an investment property. " +
            "Requires prior login." +
            FLAG_RULE,
        inputSchema: {
            type: "object",
            properties: {
                id: { type: "string", description: "The investment property ID." },
                amount: { type: "number", description: "Amount to capitalise." },
                date: { type: "string", description: "Date of expenditure in YYYY-MM-DD format." },
                description: { type: "string", description: "Brief description of the expenditure." },
            },
            required: ["id", "amount", "date"],
        },
    },
    {
        name: "dispose_investment_property",
        description: "IAS 40.66 Disposal — dispose of an investment property on sale or retirement. " +
            "USE THIS — NOT create_transaction — when an investment property is sold. " +
            "Requires prior login." +
            FLAG_RULE,
        inputSchema: {
            type: "object",
            properties: {
                id: { type: "string", description: "The investment property ID." },
                disposal_date: { type: "string", description: "Disposal date in YYYY-MM-DD format." },
                disposal_proceeds: { type: "number", description: "Cash/consideration received. Omit or 0 for retired properties." },
            },
            required: ["id", "disposal_date"],
        },
    },
];
export async function handle(name, args) {
    switch (name) {
        case "get_investment_properties":
            return handleGetProperties(args);
        case "get_investment_property":
            return handleGetProperty(args);
        case "create_investment_property":
            return handleCreate(args);
        case "update_investment_property":
            return handleUpdate(args);
        case "fair_value_adjust_investment_property":
            return handleFairValueAdjust(args);
        case "impair_investment_property":
            return handleImpair(args);
        case "reverse_investment_property_impairment":
            return handleReverseImpairment(args);
        case "capitalise_investment_property_cost":
            return handleCapitalise(args);
        case "dispose_investment_property":
            return handleDispose(args);
        default:
            return null;
    }
}
async function handleGetProperties(args) {
    const data = await apiGet(`/investment-properties?company_id=${args.company_id}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
async function handleGetProperty(args) {
    const data = await apiGet(`/investment-properties/${args.id}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
async function handleCreate(args) {
    const body = {
        company_id: args.company_id,
        name: args.name,
        acquisition_date: args.acquisition_date,
        cost: args.cost,
    };
    for (const k of ["investment_property_class_id", "property_reference", "location", "residual_value", "useful_life_years", "depreciation_method", "fair_value", "fair_value_date", "notes"]) {
        if (args[k] !== undefined)
            body[k] = args[k];
    }
    const result = await apiPost("/investment-properties", body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}
async function handleUpdate(args) {
    const { id, ...body } = args;
    const result = await apiPatch(`/investment-properties/${id}`, body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}
async function handleFairValueAdjust(args) {
    const { id, ...body } = args;
    const result = await apiPost(`/investment-properties/${id}/fair-value-adjust`, body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}
async function handleImpair(args) {
    const { id, ...body } = args;
    const result = await apiPost(`/investment-properties/${id}/impair`, body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}
async function handleReverseImpairment(args) {
    const { id, ...body } = args;
    const result = await apiPost(`/investment-properties/${id}/reverse-impairment`, body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}
async function handleCapitalise(args) {
    const { id, ...body } = args;
    const result = await apiPost(`/investment-properties/${id}/capitalise`, body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}
async function handleDispose(args) {
    const { id, ...body } = args;
    const result = await apiPost(`/investment-properties/${id}/dispose`, body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}
