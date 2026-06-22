import { grpcCall, getAuthService, getCompanyService, getTransactionService, getAssetService, getLeaseService, getInventoryService, getIntangibleService, getInvoiceService, setGrpcBearerToken, getGrpcBearerToken } from "./grpc-client.js";
import { graphqlRequest, setBearerToken as setRestBearerToken, getBearerToken as getRestBearerToken } from "./graphql.js";

const API_BASE = process.env.API_BASE ?? "http://localhost:8000/api";
const USE_GRPC = process.env.USE_GRPC !== "false";

let grpcAvailable: boolean | null = null;

async function isGrpcAvailable(): Promise<boolean> {
  if (!USE_GRPC) return false;
  if (grpcAvailable !== null) return grpcAvailable;

  try {
    await grpcCall(getAuthService, "getAuthStatus", {});
    grpcAvailable = true;
  } catch {
    grpcAvailable = false;
  }
  return grpcAvailable;
}

export function storeBearerToken(token: string): void {
  setGrpcBearerToken(token);
  setRestBearerToken(token);
}

export function hasBearerToken(): boolean {
  return getGrpcBearerToken() !== null || getRestBearerToken() !== null;
}

export async function login(email: string, password: string, deviceName: string): Promise<{ token: string; user: { id: string; name: string; email: string } }> {
  if (await isGrpcAvailable()) {
    const res = await grpcCall<any, any>(getAuthService, "login", { email, password, device_name: deviceName });
    const token = res.token;
    storeBearerToken(token);
    return { token, user: res.user };
  }

  const query = `
    mutation Login($email: String!, $password: String!, $device_name: String!) {
      login(input: { email: $email, password: $password, device_name: $device_name }) {
        token
        user { id name email }
      }
    }
  `;
  const data = (await graphqlRequest(query, { email, password, device_name: deviceName }, false)) as any;
  storeBearerToken(data.login.token);
  return { token: data.login.token, user: data.login.user };
}

async function restGet(path: string): Promise<unknown> {
  const token = getRestBearerToken();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { headers });
  return res.json();
}

async function restPost(path: string, body: Record<string, unknown>): Promise<unknown> {
  const token = getRestBearerToken();
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  return res.json();
}

async function restPatch(path: string, body: Record<string, unknown>): Promise<unknown> {
  const token = getRestBearerToken();
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { method: "PATCH", headers, body: JSON.stringify(body) });
  return res.json();
}

function parseGrpcData(res: any): unknown {
  if (res?.data && typeof res.data === "string") {
    try { return JSON.parse(res.data); } catch { return res.data; }
  }
  return res;
}

// --- Assets ---

export async function getAssets(companyId: number, status?: string, ppeClass?: string): Promise<unknown> {
  if (await isGrpcAvailable()) {
    const res = await grpcCall<any, any>(getAssetService, "getAssets", { company_id: companyId, status, ppe_class: ppeClass });
    return parseGrpcData(res);
  }
  const params = new URLSearchParams({ company_id: String(companyId) });
  if (status) params.set("status", status);
  if (ppeClass) params.set("ppe_class", ppeClass);
  return restGet(`/assets?${params}`);
}

export async function getAsset(id: number): Promise<unknown> {
  if (await isGrpcAvailable()) {
    const res = await grpcCall<any, any>(getAssetService, "getAsset", { id });
    return parseGrpcData(res);
  }
  return restGet(`/assets/${id}`);
}

export async function createAsset(data: Record<string, unknown>): Promise<unknown> {
  if (await isGrpcAvailable()) {
    const res = await grpcCall<any, any>(getAssetService, "createAsset", { data_json: JSON.stringify(data) });
    return parseGrpcData(res);
  }
  return restPost("/assets", data);
}

export async function updateAsset(id: number, data: Record<string, unknown>): Promise<unknown> {
  if (await isGrpcAvailable()) {
    const res = await grpcCall<any, any>(getAssetService, "updateAsset", { id, data_json: JSON.stringify(data) });
    return parseGrpcData(res);
  }
  return restPatch(`/assets/${id}`, data);
}

export async function disposeAsset(id: number, data: Record<string, unknown>): Promise<unknown> {
  if (await isGrpcAvailable()) {
    const res = await grpcCall<any, any>(getAssetService, "disposeAsset", { id, data_json: JSON.stringify(data) });
    return parseGrpcData(res);
  }
  return restPost(`/assets/${id}/dispose`, data);
}

export async function assetAction(id: number, action: string, data: Record<string, unknown>): Promise<unknown> {
  if (await isGrpcAvailable()) {
    const methodMap: Record<string, string> = {
      revalue: "revalueAsset", impair: "impairAsset",
      "reverse-impairment": "reverseImpairment", capitalise: "capitaliseSubsequentCost",
    };
    const res = await grpcCall<any, any>(getAssetService, methodMap[action] ?? action, { id, data_json: JSON.stringify(data) });
    return parseGrpcData(res);
  }
  return restPost(`/assets/${id}/${action}`, data);
}

export async function getDepreciationSchedule(id: number): Promise<unknown> {
  if (await isGrpcAvailable()) {
    const res = await grpcCall<any, any>(getAssetService, "getDepreciationSchedule", { id });
    return parseGrpcData(res);
  }
  return restGet(`/assets/${id}/depreciation-schedule`);
}

// --- Leases ---

export async function getLeases(companyId: number, filters?: Record<string, string>): Promise<unknown> {
  if (await isGrpcAvailable()) {
    const res = await grpcCall<any, any>(getLeaseService, "getLeases", { company_id: companyId, ...filters });
    return parseGrpcData(res);
  }
  const params = new URLSearchParams({ company_id: String(companyId) });
  if (filters) Object.entries(filters).forEach(([k, v]) => params.set(k, v));
  return restGet(`/leases?${params}`);
}

export async function getLease(id: number): Promise<unknown> {
  if (await isGrpcAvailable()) {
    const res = await grpcCall<any, any>(getLeaseService, "getLease", { id });
    return parseGrpcData(res);
  }
  return restGet(`/leases/${id}`);
}

export async function createLease(data: Record<string, unknown>): Promise<unknown> {
  if (await isGrpcAvailable()) {
    const res = await grpcCall<any, any>(getLeaseService, "createLease", { data_json: JSON.stringify(data) });
    return parseGrpcData(res);
  }
  return restPost("/leases", data);
}

export async function leaseAction(id: number, action: string, data: Record<string, unknown>): Promise<unknown> {
  if (await isGrpcAvailable()) {
    const methodMap: Record<string, string> = {
      modify: "modifyLease", impair: "impairLease",
      "reverse-impairment": "reverseLeaseImpairment", terminate: "terminateLease",
    };
    const res = await grpcCall<any, any>(getLeaseService, methodMap[action] ?? action, { id, data_json: JSON.stringify(data) });
    return parseGrpcData(res);
  }
  return restPost(`/leases/${id}/${action}`, data);
}

export async function getLeaseSchedule(id: number): Promise<unknown> {
  if (await isGrpcAvailable()) {
    const res = await grpcCall<any, any>(getLeaseService, "getLeaseSchedule", { id });
    return parseGrpcData(res);
  }
  return restGet(`/leases/${id}/schedule`);
}

// --- Inventory ---

export async function getInventory(companyId: number, search?: string): Promise<unknown> {
  if (await isGrpcAvailable()) {
    const res = await grpcCall<any, any>(getInventoryService, "getInventory", { company_id: companyId, search });
    return parseGrpcData(res);
  }
  const params = new URLSearchParams({ company_id: String(companyId) });
  if (search) params.set("search", search);
  return restGet(`/inventory?${params}`);
}

export async function getInventoryItem(id: number): Promise<unknown> {
  if (await isGrpcAvailable()) {
    const res = await grpcCall<any, any>(getInventoryService, "getInventoryItem", { id });
    return parseGrpcData(res);
  }
  return restGet(`/inventory/${id}`);
}

export async function createInventoryItem(data: Record<string, unknown>): Promise<unknown> {
  if (await isGrpcAvailable()) {
    const res = await grpcCall<any, any>(getInventoryService, "createInventoryItem", { data_json: JSON.stringify(data) });
    return parseGrpcData(res);
  }
  return restPost("/inventory", data);
}

export async function updateInventoryItem(id: number, data: Record<string, unknown>): Promise<unknown> {
  if (await isGrpcAvailable()) {
    const res = await grpcCall<any, any>(getInventoryService, "updateInventoryItem", { id, data_json: JSON.stringify(data) });
    return parseGrpcData(res);
  }
  return restPatch(`/inventory/${id}`, data);
}

export async function recordMovement(itemId: number, data: Record<string, unknown>): Promise<unknown> {
  if (await isGrpcAvailable()) {
    const res = await grpcCall<any, any>(getInventoryService, "recordMovement", { inventory_item_id: itemId, data_json: JSON.stringify(data) });
    return res;
  }
  return restPost(`/inventory/${itemId}/movement`, data);
}

export async function writeDownInventory(itemId: number, data: Record<string, unknown>): Promise<unknown> {
  if (await isGrpcAvailable()) {
    const res = await grpcCall<any, any>(getInventoryService, "writeDown", { inventory_item_id: itemId, data_json: JSON.stringify(data) });
    return parseGrpcData(res);
  }
  return restPost(`/inventory/${itemId}/write-down`, data);
}

export async function reverseWriteDown(itemId: number, data: Record<string, unknown>): Promise<unknown> {
  if (await isGrpcAvailable()) {
    const res = await grpcCall<any, any>(getInventoryService, "reverseWriteDown", { inventory_item_id: itemId, data_json: JSON.stringify(data) });
    return parseGrpcData(res);
  }
  return restPost(`/inventory/${itemId}/reverse-write-down`, data);
}

// --- Intangibles ---

export async function getIntangibles(companyId: number, status?: string): Promise<unknown> {
  if (await isGrpcAvailable()) {
    const res = await grpcCall<any, any>(getIntangibleService, "getIntangibles", { company_id: companyId, status });
    return parseGrpcData(res);
  }
  const params = new URLSearchParams({ company_id: String(companyId) });
  if (status) params.set("status", status);
  return restGet(`/intangibles?${params}`);
}

export async function getIntangible(id: number): Promise<unknown> {
  if (await isGrpcAvailable()) {
    const res = await grpcCall<any, any>(getIntangibleService, "getIntangible", { id });
    return parseGrpcData(res);
  }
  return restGet(`/intangibles/${id}`);
}

export async function createIntangible(data: Record<string, unknown>): Promise<unknown> {
  if (await isGrpcAvailable()) {
    const res = await grpcCall<any, any>(getIntangibleService, "createIntangible", { data_json: JSON.stringify(data) });
    return parseGrpcData(res);
  }
  return restPost("/intangibles", data);
}

export async function intangibleAction(id: number, action: string, data: Record<string, unknown>): Promise<unknown> {
  if (await isGrpcAvailable()) {
    const methodMap: Record<string, string> = {
      dispose: "disposeIntangible", revalue: "revalueIntangible",
      impair: "impairIntangible", "reverse-impairment": "reverseImpairment",
      capitalise: "capitaliseSubsequentCost",
    };
    const res = await grpcCall<any, any>(getIntangibleService, methodMap[action] ?? action, { id, data_json: JSON.stringify(data) });
    return parseGrpcData(res);
  }
  return restPost(`/intangibles/${id}/${action}`, data);
}

// --- Transactions ---

export async function searchTransactions(companyId: number, query: string, limit = 20): Promise<unknown> {
  if (await isGrpcAvailable()) {
    const res = await grpcCall<any, any>(getTransactionService, "searchTransactions", { company_id: companyId, query, limit });
    return parseGrpcData(res);
  }
  return restPost("/transactions/search", { company_id: companyId, query, limit });
}

export async function getTransactionByReference(companyId: number, reference: string): Promise<unknown> {
  if (await isGrpcAvailable()) {
    const res = await grpcCall<any, any>(getTransactionService, "getTransactionByReference", { company_id: companyId, reference });
    return parseGrpcData(res);
  }
  return restPost("/transactions/search", { company_id: companyId, query: reference, limit: 1 });
}

// Re-export graphqlRequest for tools that still need it
export { graphqlRequest } from "./graphql.js";
