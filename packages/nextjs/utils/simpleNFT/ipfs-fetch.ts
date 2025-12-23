const fetchFromApi = ({ path, method, body }: { path: string; method: string; body?: object }) => {
  return fetch(path, {
    method: method.toUpperCase(),
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async response => {
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `API ${path} ${response.status} ${response.statusText}${text ? `: ${text.slice(0, 120)}` : ""}`
      );
    }
    return response.json();
  });
};

export const addToIPFS = (yourJSON: object) => fetchFromApi({ path: "/api/ipfs/add", method: "POST", body: yourJSON });

const metadataCache = new Map<string, unknown>();
const metadataInFlight = new Map<string, Promise<unknown>>();

export const getMetadataFromIPFS = (ipfsHash: string) => {
  const key = String(ipfsHash || "").trim();
  if (metadataCache.has(key)) return Promise.resolve(metadataCache.get(key));

  const existing = metadataInFlight.get(key);
  if (existing) return existing;

  const p = fetchFromApi({ path: "/api/ipfs/get-metadata", method: "POST", body: { ipfsHash: key } })
    .then(res => {
      metadataCache.set(key, res);
      return res;
    })
    .finally(() => {
      metadataInFlight.delete(key);
    });

  metadataInFlight.set(key, p);
  return p;
};
