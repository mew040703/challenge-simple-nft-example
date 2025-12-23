import { getNFTMetadataFromIPFS } from "~~/utils/simpleNFT/ipfs";
import { ensureSchema, getMySqlPool } from "~~/utils/db/mysql";

const toPublicIpfsGatewayUrl = (input: string) => {
  const raw = String(input || "").trim();
  if (!raw) return raw;

  if (raw.startsWith("ipfs://")) {
    let path = raw.slice(7);
    if (path.startsWith("ipfs/")) path = path.slice(5);
    while (path.startsWith("/")) path = path.slice(1);
    return `https://gateway.pinata.cloud/ipfs/${path}`;
  }

  try {
    const u = new URL(raw);
    const idx = u.pathname.indexOf("/ipfs/");
    if (idx >= 0) {
      const path = u.pathname.slice(idx + 6).replace(/^\/+/, "");
      return `https://gateway.pinata.cloud/ipfs/${path}${u.search || ""}`;
    }
  } catch {}

  return raw;
};

const fetchJson = async (url: string, timeoutMs: number) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) return await res.json();
    const text = await res.text();
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
};

export async function POST(request: Request) {
  let ipfsHash = "";
  try {
    const body = await request.json();
    ipfsHash = body.ipfsHash;
    const raw = String(ipfsHash || "").trim();
    let metadata: any | undefined;

    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      const candidates: string[] = [];
      candidates.push(raw);
      candidates.push(toPublicIpfsGatewayUrl(raw));
      metadata = await Promise.any(candidates.map(u => fetchJson(u, 12000)));
    } else {
      metadata = await getNFTMetadataFromIPFS(ipfsHash);
    }

    if (metadata && typeof metadata === "object" && typeof (metadata as any).image === "string") {
      (metadata as any).image = toPublicIpfsGatewayUrl((metadata as any).image);
    }
    return Response.json(metadata);
  } catch (error: any) {
    const raw = String(ipfsHash || "");
    let s = raw.trim();
    if (s.startsWith("ipfs://")) s = s.slice(7);
    const ix = s.indexOf("/ipfs/");
    if (ix >= 0) s = s.slice(ix + 6);
    const cid = s.split("/")[0];
    if (cid) {
      try {
        await ensureSchema();
        const pool = getMySqlPool();
        const [rows] = await pool.query("SELECT image_url FROM nft_images WHERE metadata_hash = ? LIMIT 1", [cid]);
        const row = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;
        if (row?.image_url) {
          return Response.json({ image: toPublicIpfsGatewayUrl(row.image_url), attributes: [] });
        }
      } catch {}
    }
    const message = error?.message || "Error getting metadata from ipfs";
    const status = /HTTP\s+(\d+)/.exec(message)?.[1] ? Number(/HTTP\s+(\d+)/.exec(message)?.[1]) : 502;
    return Response.json({ error: message }, { status });
  }
}
export const runtime = "nodejs";
