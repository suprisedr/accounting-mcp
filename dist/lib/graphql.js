export const GRAPHQL_ENDPOINT = "http://localhost:8000/graphql";
let _bearerToken = null;
export function setBearerToken(token) {
    _bearerToken = token;
}
export function getBearerToken() {
    return _bearerToken;
}
export async function graphqlRequest(query, variables, authenticated = false) {
    const headers = {
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
    const json = (await response.json());
    if (json.errors && json.errors.length > 0) {
        throw new Error(`GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`);
    }
    return json.data;
}
