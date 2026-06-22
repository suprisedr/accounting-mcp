import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROTO_DIR = path.resolve(__dirname, "../../proto");
const GRPC_HOST = process.env.GRPC_HOST ?? "localhost:9001";
const clients = new Map();
function loadService(protoFile, serviceName) {
    const key = `${protoFile}:${serviceName}`;
    if (clients.has(key))
        return clients.get(key);
    const packageDefinition = protoLoader.loadSync(path.join(PROTO_DIR, protoFile), {
        keepCase: false,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
        includeDirs: [PROTO_DIR],
    });
    const proto = grpc.loadPackageDefinition(packageDefinition);
    const ServiceConstructor = proto.chainbook[serviceName];
    const client = new ServiceConstructor(GRPC_HOST, grpc.credentials.createInsecure());
    clients.set(key, client);
    return client;
}
function callUnary(client, method, request, metadata) {
    return new Promise((resolve, reject) => {
        const fn = client[method];
        if (!fn) {
            reject(new Error(`gRPC method '${method}' not found on client`));
            return;
        }
        fn.call(client, request, metadata ?? new grpc.Metadata(), (err, response) => {
            if (err)
                reject(err);
            else
                resolve(response);
        });
    });
}
export function getAuthService() {
    return loadService("auth.proto", "AuthService");
}
export function getCompanyService() {
    return loadService("company.proto", "CompanyService");
}
export function getTransactionService() {
    return loadService("transactions.proto", "TransactionService");
}
export function getAssetService() {
    return loadService("assets.proto", "AssetService");
}
export function getLeaseService() {
    return loadService("leases.proto", "LeaseService");
}
export function getInventoryService() {
    return loadService("inventory.proto", "InventoryService");
}
export function getIntangibleService() {
    return loadService("intangibles.proto", "IntangibleService");
}
export function getInvoiceService() {
    return loadService("invoices.proto", "InvoiceService");
}
let _bearerToken = null;
export function setGrpcBearerToken(token) {
    _bearerToken = token;
}
export function getGrpcBearerToken() {
    return _bearerToken;
}
function authMetadata() {
    const md = new grpc.Metadata();
    if (_bearerToken) {
        md.set("authorization", `Bearer ${_bearerToken}`);
    }
    return md;
}
export async function grpcCall(serviceFn, method, request) {
    const client = serviceFn();
    return callUnary(client, method, request, authMetadata());
}
