import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { hardhat } from "viem/chains";
import deployedContracts from "~~/contracts/deployedContracts";
import scaffoldConfig from "~~/scaffold.config";
import { getAlchemyHttpUrl } from "~~/utils/scaffold-eth/networks";

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

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ tokenId: string }> }
) {
  const params = await props.params;
  try {
    const tokenId = params.tokenId;

    if (!tokenId) {
      return NextResponse.json({ error: "Token ID is required" }, { status: 400 });
    }

    const availableChainIds = Object.keys(deployedContracts as any).map(id => Number(id));
    const preferOrder = [1337, 31337, 11155111, ...availableChainIds.filter(id => ![1337, 31337, 11155111].includes(id))];
    const selectedChainId = preferOrder.find(id => (deployedContracts as any)?.[id]?.["YourCollectible"]);
    const selectedChain =
      scaffoldConfig.targetNetworks.find(n => n.id === selectedChainId) ||
      scaffoldConfig.targetNetworks.find(n => n.id === 31337) ||
      hardhat;

    const rpcOverride = (scaffoldConfig.rpcOverrides as any)?.[selectedChain.id];
    const chainRpcDefault = (selectedChain as any)?.rpcUrls?.default?.http?.[0];
    const alchemyUrl = getAlchemyHttpUrl(selectedChain.id);
    const rpcUrl = rpcOverride || chainRpcDefault || alchemyUrl;

    const publicClient = createPublicClient({
      chain: selectedChain,
      transport: rpcUrl ? http(rpcUrl) : http(),
    });

    const yourCollectible = (deployedContracts as any)?.[selectedChainId!]?.["YourCollectible"];
    const contractAddress =
      (yourCollectible?.address as `0x${string}` | undefined) ||
      (process.env.NEXT_PUBLIC_YOUR_COLLECTIBLE_ADDRESS as `0x${string}` | undefined);
    if (!contractAddress) {
      return NextResponse.json({ error: "YourCollectible 合约地址未配置" }, { status: 500 });
    }

    const tokenURI = await publicClient.readContract({
      address: contractAddress,
      abi: [
        {
          inputs: [{ name: "tokenId", type: "uint256" }],
          name: "tokenURI",
          outputs: [{ name: "", type: "string" }],
          stateMutability: "view",
          type: "function",
        },
      ],
      functionName: "tokenURI",
      args: [BigInt(tokenId)],
    });

    if (!tokenURI) {
      return NextResponse.json({ error: "Token URI not found" }, { status: 404 });
    }

    const metadataUrl = toPublicIpfsGatewayUrl(tokenURI as string);

    const metadataResponse = await fetch(metadataUrl);
    if (!metadataResponse.ok) {
      return NextResponse.json({ error: "Failed to fetch metadata" }, { status: 500 });
    }

    const metadata = await metadataResponse.json();

    if (metadata?.image && typeof metadata.image === "string") {
      metadata.image = toPublicIpfsGatewayUrl(metadata.image);
    }

    return NextResponse.json(metadata);
  } catch (error) {
    console.error("Error fetching NFT metadata:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
