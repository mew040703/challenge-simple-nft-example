import { Agent, fetch as undiciFetch } from "undici";
import dns from "node:dns";
// Pinata API configuration
const PINATA_API_KEY ="0832c8cf3517b1ff615b";
const PINATA_SECRET_API_KEY ="31f63c97a34e859a4eb9bc0b3aeaa37790db770d7abf1dbf5bd443e7e02fc573";

// Pinata API client for uploading to IPFS
export const ipfsClient = {
  async add(content: string) {
    try {
      const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          pinata_api_key: PINATA_API_KEY,
          pinata_secret_api_key: PINATA_SECRET_API_KEY,
        },
        body: JSON.stringify({
          pinataContent: JSON.parse(content),
          pinataMetadata: {
            name: "NFT Metadata",
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return { path: result.IpfsHash };
    } catch (error) {
      console.error("Error uploading to Pinata:", error);
      throw error;
    }
  },
};

const normalizeIpfsInput = (input: string) => {
  let s = input.trim();
  if (!s) return s;
  if (s.startsWith("ipfs://")) s = s.slice(7);
  if (s.startsWith("http://") || s.startsWith("https://")) {
    const parts = s.split("/");
    const idx = parts.findIndex(p => p === "ipfs");
    if (idx >= 0) s = parts.slice(idx + 1).join("/");
  }
  while (s.startsWith("/")) s = s.slice(1);
  return s;
};

const ipv4Agent = new Agent({
  connect: {
    lookup: (hostname: string, _options: any, callback: any) => {
      dns.lookup(hostname, { family: 4 }, callback);
    },
  },
});

const fetchJsonWithTimeout = async (url: string, timeoutMs: number) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await undiciFetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      dispatcher: ipv4Agent,
    } as any);
    if (!response.ok) {
      if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
        throw new Error(`HTTP ${response.status}`);
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return await response.json();
    }
    const text = await response.text();
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
};

export async function getNFTMetadataFromIPFS(ipfsHash: string) {
  const gateways = [
    "https://green-payable-guan-79.mypinata.cloud/ipfs/",
    "https://gateway.pinata.cloud/ipfs/",
    "https://nftstorage.link/ipfs/",
    "https://w3s.link/ipfs/",
    "https://ipfs.io/ipfs/",
    "https://gateway.ipfs.io/ipfs/",
    "https://cloudflare-ipfs.com/ipfs/",
    "https://dweb.link/ipfs/",
  ];
  const path = normalizeIpfsInput(ipfsHash);
  const urls = gateways.map(base => `${base}${path}`);
  try {
    return await Promise.any(urls.map(u => fetchJsonWithTimeout(u, 8000)));
  } catch (e: any) {
    for (const u of urls) {
      try {
        const data = await fetchJsonWithTimeout(u, 15000);
        return data;
      } catch {}
    }
    throw new Error("Failed to fetch metadata from IPFS");
  }
}
