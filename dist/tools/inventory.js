import { getBearerToken } from "../lib/graphql.js";
const API_BASE = "http://localhost:8000/api";
async function apiGet(path) {
    const token = getBearerToken();
    if (!token)
        throw new Error("Not authenticated. Please run the login tool first.");
    const response = await fetch(`${API_BASE}${path}`, {
        headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
        },
    });
    const json = (await response.json());
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
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });
    const json = (await response.json());
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
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });
    const json = (await response.json());
    if (!response.ok)
        throw new Error(json.message ?? `HTTP ${response.status}`);
    return json;
}
const FLAG_RULE = "\n\nACTION FLAGGING (mandatory): After completing this operation, if you identify ANY issue, " +
    "compliance gap, missing information, or recommended follow-up, you MUST call create_action for EACH one — " +
    "do not leave findings only in your text reply. " +
    "Examples: inventory item missing NRV assessment, write-down not yet recorded, stock count discrepancy, " +
    "no inventory type assigned (affects IAS 2 disclosure grouping). " +
    "Use priority 'high' for compliance/audit risk, 'medium' for accounting estimate issues, 'low' for housekeeping. " +
    "Set related_type='inventory_item' and related_id to the item ID where applicable.";
export const tools = [
    {
        name: "inventory",
        description: "Fetch inventory items (IAS 2) and service items for a company. " +
            "Returns each item with cost, quantity on hand, stock value, carrying amount (after NRV write-downs), and landed cost breakdown. " +
            "Service items are included by default — use include_services=false to filter them out. " +
            "Use this whenever the user asks about stock, inventory, goods on hand, or wants to check item availability. " +
            "Requires prior login.",
        inputSchema: {
            type: "object",
            properties: {
                company_id: { type: "string", description: "The ID of the company whose inventory to list." },
                only_active: { type: "boolean", description: "Filter to active items only. Default: false." },
                include_services: { type: "boolean", description: "Include service items. Default: true." },
            },
            required: ["company_id"],
        },
    },
    {
        name: "get_inventory_item",
        description: "Fetch a single inventory item by ID, including its recent stock movements (last 50). " +
            "Use this to check an item's movement history, current stock position, or NRV write-down status. " +
            "Requires prior login.",
        inputSchema: {
            type: "object",
            properties: {
                id: { type: "string", description: "The inventory item ID to fetch." },
            },
            required: ["id"],
        },
    },
    {
        name: "create_inventory_item",
        description: "Create a new inventory item or service item. " +
            "For inventory items: provide landed cost components (purchase_cost, freight_in, import_duties, handling_costs, trade_discount) and initial_quantity. " +
            "For service items: set is_service=true — only name, unit_price, tax_rate, and description are needed. " +
            "IAS 2 requires inventory to be measured at cost including all costs of purchase, conversion, and other costs to bring it to its present location and condition. " +
            "Requires prior login." +
            FLAG_RULE,
        inputSchema: {
            type: "object",
            properties: {
                company_id: { type: "string", description: "The ID of the company." },
                name: { type: "string", description: "Item name." },
                unit_price: { type: "number", description: "Selling price per unit." },
                is_service: { type: "boolean", description: "True for service items (no stock tracking). Default: false." },
                description: { type: "string", description: "Item description." },
                sku: { type: "string", description: "Stock-keeping unit code. Inventory items only." },
                inventory_type: {
                    type: "string",
                    enum: ["raw_material", "wip", "finished_goods", "merchandise", "consumable"],
                    description: "IAS 2 inventory category. Affects movement schedule grouping. Inventory items only.",
                },
                purchase_cost: { type: "number", description: "Purchase cost per unit. Inventory items only." },
                freight_in: { type: "number", description: "Freight/shipping cost per unit. Inventory items only." },
                import_duties: { type: "number", description: "Import duties per unit. Inventory items only." },
                handling_costs: { type: "number", description: "Handling costs per unit. Inventory items only." },
                trade_discount: { type: "number", description: "Trade discount per unit (reduces cost). Inventory items only." },
                initial_quantity: { type: "number", description: "Opening stock quantity. Inventory items only." },
                tax_rate: { type: "number", description: "VAT rate percentage (e.g. 15 for 15%)." },
            },
            required: ["company_id", "name", "unit_price"],
        },
    },
    {
        name: "update_inventory_item",
        description: "Update an existing inventory item's details (name, description, sku, unit_price, purchase_cost, tax_rate, inventory_type, is_active). " +
            "Does NOT change stock quantities — use record_stock_movement for that. " +
            "Requires prior login." +
            FLAG_RULE,
        inputSchema: {
            type: "object",
            properties: {
                id: { type: "string", description: "The inventory item ID to update." },
                name: { type: "string" },
                description: { type: "string" },
                sku: { type: "string" },
                inventory_type: { type: "string", enum: ["raw_material", "wip", "finished_goods", "merchandise", "consumable"] },
                unit_price: { type: "number" },
                purchase_cost: { type: "number" },
                tax_rate: { type: "number" },
                is_active: { type: "boolean" },
            },
            required: ["id"],
        },
    },
    {
        name: "record_stock_movement",
        description: "Record a stock movement (receive, issue, or adjust) for an inventory item. " +
            "USE THIS for goods received, goods issued/sold, and stock count adjustments. " +
            "For NRV write-downs or reversals, use the dedicated write_down_inventory / reverse_inventory_write_down tools instead. " +
            "Requires prior login." +
            FLAG_RULE,
        inputSchema: {
            type: "object",
            properties: {
                id: { type: "string", description: "The inventory item ID." },
                action: {
                    type: "string",
                    enum: ["receive", "issue", "adjust"],
                    description: "Movement type: receive (goods in), issue (goods out), adjust (stock count correction — can be positive or negative).",
                },
                quantity: { type: "number", description: "Quantity to move. Always positive for receive/issue; signed for adjust." },
                unit_cost: { type: "number", description: "Cost per unit for this movement. Optional." },
                reference: { type: "string", description: "Reference number (e.g. GRN, delivery note)." },
                notes: { type: "string", description: "Movement notes." },
                moved_at: { type: "string", description: "Date of movement in YYYY-MM-DD format." },
            },
            required: ["id", "action", "quantity", "moved_at"],
        },
    },
    {
        name: "write_down_inventory",
        description: "IAS 2.9 / IAS 2.34 — Write down inventory to net realisable value (NRV) when NRV falls below cost. " +
            "The write-down is calculated as (cost per unit − NRV per unit) × quantity on hand. " +
            "If a previous write-down exists, only the incremental amount is recorded. " +
            "Confirm the NRV per unit with the user before calling. " +
            "Requires prior login." +
            FLAG_RULE,
        inputSchema: {
            type: "object",
            properties: {
                id: { type: "string", description: "The inventory item ID." },
                nrv_per_unit: { type: "number", description: "Net realisable value per unit. Must be below cost per unit." },
                date: { type: "string", description: "Date of the write-down assessment in YYYY-MM-DD format." },
                notes: { type: "string", description: "Reason for the write-down (e.g. 'market price decline', 'slow-moving stock')." },
            },
            required: ["id", "nrv_per_unit", "date"],
        },
    },
    {
        name: "reverse_inventory_write_down",
        description: "IAS 2.33 — Reverse a previous NRV write-down when the circumstances that caused the write-down no longer exist " +
            "(e.g. selling price has recovered). The reversal is limited to the original write-down amount — inventory cannot be written up above cost. " +
            "Confirm the new NRV per unit with the user before calling. " +
            "Requires prior login." +
            FLAG_RULE,
        inputSchema: {
            type: "object",
            properties: {
                id: { type: "string", description: "The inventory item ID." },
                new_nrv_per_unit: { type: "number", description: "Revised NRV per unit. If ≥ cost, the entire write-down is reversed." },
                date: { type: "string", description: "Date of the reversal in YYYY-MM-DD format." },
                notes: { type: "string", description: "Reason for the reversal (e.g. 'market price recovered')." },
            },
            required: ["id", "new_nrv_per_unit", "date"],
        },
    },
];
// ─── Handlers ─────────────────────────────────────────────────────────────────
export async function handle(name, args) {
    switch (name) {
        case "inventory":
            return handleList(args);
        case "get_inventory_item":
            return handleShow(args);
        case "create_inventory_item":
            return handleCreate(args);
        case "update_inventory_item":
            return handleUpdate(args);
        case "record_stock_movement":
            return handleMovement(args);
        case "write_down_inventory":
            return handleWriteDown(args);
        case "reverse_inventory_write_down":
            return handleReverseWriteDown(args);
        default:
            return null;
    }
}
async function handleList(args) {
    const params = new URLSearchParams();
    params.set("company_id", String(args.company_id));
    if (args.only_active !== undefined)
        params.set("only_active", String(args.only_active));
    if (args.include_services !== undefined)
        params.set("include_services", String(args.include_services));
    const data = await apiGet(`/inventory?${params.toString()}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
async function handleShow(args) {
    const data = await apiGet(`/inventory/${args.id}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
async function handleCreate(args) {
    const body = {
        company_id: args.company_id,
        name: args.name,
        unit_price: args.unit_price,
    };
    for (const k of [
        "is_service", "description", "sku", "inventory_type",
        "purchase_cost", "freight_in", "import_duties", "handling_costs",
        "trade_discount", "initial_quantity", "tax_rate",
    ]) {
        if (args[k] !== undefined)
            body[k] = args[k];
    }
    const result = await apiPost("/inventory", body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}
async function handleUpdate(args) {
    const { id, ...fields } = args;
    const body = {};
    for (const k of ["name", "description", "sku", "inventory_type", "unit_price", "purchase_cost", "tax_rate", "is_active"]) {
        if (fields[k] !== undefined)
            body[k] = fields[k];
    }
    if (Object.keys(body).length === 0) {
        throw new Error("update_inventory_item requires at least one field to change.");
    }
    const result = await apiPatch(`/inventory/${id}`, body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}
async function handleMovement(args) {
    const { id, ...fields } = args;
    const body = {
        action: fields.action,
        quantity: fields.quantity,
        moved_at: fields.moved_at,
    };
    if (fields.unit_cost !== undefined)
        body.unit_cost = fields.unit_cost;
    if (fields.reference !== undefined)
        body.reference = fields.reference;
    if (fields.notes !== undefined)
        body.notes = fields.notes;
    const result = await apiPost(`/inventory/${id}/movement`, body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}
async function handleWriteDown(args) {
    const { id, nrv_per_unit, date, notes } = args;
    const body = { nrv_per_unit, date };
    if (notes)
        body.notes = notes;
    const result = await apiPost(`/inventory/${id}/write-down`, body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}
async function handleReverseWriteDown(args) {
    const { id, new_nrv_per_unit, date, notes } = args;
    const body = { new_nrv_per_unit, date };
    if (notes)
        body.notes = notes;
    const result = await apiPost(`/inventory/${id}/reverse-write-down`, body);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}
