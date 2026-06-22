import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROTO_DIR = path.resolve(__dirname, "../../proto");

const GRPC_HOST = process.env.GRPC_HOST ?? "localhost:9001";

type ServiceClient = grpc.Client & Record<string, Function>;

const clients: Map<string, ServiceClient> = new Map();

function loadService(protoFile: string, serviceName: string): ServiceClient {
  const key = `${protoFile}:${serviceName}`;
  if (clients.has(key)) return clients.get(key)!;

  const packageDefinition = protoLoader.loadSync(
    path.join(PROTO_DIR, protoFile),
    {
      keepCase: false,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
      includeDirs: [PROTO_DIR],
    }
  );

  const proto = grpc.loadPackageDefinition(packageDefinition) as any;
  const ServiceConstructor = proto.chainbook[serviceName];

  const client = new ServiceConstructor(
    GRPC_HOST,
    grpc.credentials.createInsecure()
  ) as ServiceClient;

  clients.set(key, client);
  return client;
}

function callUnary<TReq, TRes>(
  client: ServiceClient,
  method: string,
  request: TReq,
  metadata?: grpc.Metadata
): Promise<TRes> {
  return new Promise((resolve, reject) => {
    const fn = (client as any)[method];
    if (!fn) {
      reject(new Error(`gRPC method '${method}' not found on client`));
      return;
    }
    fn.call(client, request, metadata ?? new grpc.Metadata(), (err: grpc.ServiceError | null, response: TRes) => {
      if (err) reject(err);
      else resolve(response);
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

let _bearerToken: string | null = null;

export function setGrpcBearerToken(token: string | null): void {
  _bearerToken = token;
}

export function getGrpcBearerToken(): string | null {
  return _bearerToken;
}

function authMetadata(): grpc.Metadata {
  const md = new grpc.Metadata();
  if (_bearerToken) {
    md.set("authorization", `Bearer ${_bearerToken}`);
  }
  return md;
}

export async function grpcCall<TReq, TRes>(
  serviceFn: () => ServiceClient,
  method: string,
  request: TReq
): Promise<TRes> {
  const client = serviceFn();
  return callUnary<TReq, TRes>(client, method, request, authMetadata());
}
