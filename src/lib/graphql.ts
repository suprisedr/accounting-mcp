export const GRAPHQL_ENDPOINT = "http://localhost:8000/graphql";

let _bearerToken: string | null = null;

export function setBearerToken(token: string | null): void {
  _bearerToken = token;
}

export function getBearerToken(): string | null {
  return _bearerToken;
}

export async function graphqlRequest(
  query: string,
  variables?: Record<string, unknown>,
  authenticated = false
): Promise<unknown> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (authenticated) {
    if (!_bearerToken) {
      throw new Error("Not authenticated. Please run the login tool first.");
    }
    headers["Authorization"] = `Bearer ${_bearerToken}`;
  }

  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
  }

  const json = (await response.json()) as {
    data?: unknown;
    errors?: Array<{ message: string }>;
  };

  if (json.errors && json.errors.length > 0) {
    throw new Error(
      `GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`
    );
  }

  return json.data;
}
