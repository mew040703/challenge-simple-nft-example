"use client";

import { useState, useEffect, useMemo } from "react";
import { formatEther, parseEther } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { useScaffoldReadContract, useScaffoldWriteContract, useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { SellerOffersPanel } from "~~/components/SellerOffersPanel";
import { Address } from "~~/components/scaffold-eth";

// Client-side check to avoid SSR issues
const isClient = typeof window !== "undefined";

interface MarketplaceListing {
  listingId: bigint;
  tokenId: bigint;
  seller: string;
  price: bigint;
  active: boolean;
  nftContract: string;
}

interface NFTMetadata {
  name: string;
  description: string;
  image: string;
  attributes?: Array<{
    trait_type: string;
    value: string;
  }>;
}

interface MarketplaceNFT extends MarketplaceListing {
  metadata?: NFTMetadata;
}

export default function Marketplace() {
  const { address: connectedAddress } = useAccount();
  const publicClient = usePublicClient();
  const [listings, setListings] = useState<MarketplaceNFT[]>([]);
  const [loading, setLoading] = useState(true);
  const [buyingTokenId, setBuyingTokenId] = useState<string | null>(null);
  // 分页状态：每页 5 个
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  // 新增：批量购买状态
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedListingIds, setSelectedListingIds] = useState<bigint[]>([]);
  const [isBulkBuying, setIsBulkBuying] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; current?: bigint } | null>(null);

  // 新增：筛选与排序状态
  const [minPrice, setMinPrice] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [sellerQuery, setSellerQuery] = useState<string>("");
  const [contractQuery, setContractQuery] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      return p.get("contract") ?? "";
    }
    return "";
  });
  const [excludeMine, setExcludeMine] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<"recent" | "priceAsc" | "priceDesc" | "tokenIdAsc" | "tokenIdDesc">("recent");

  // 新增：我的上架管理（改价/暂停）状态
  const [editPrices, setEditPrices] = useState<Record<string, string>>({});
  const [updatingId, setUpdatingId] = useState<bigint | null>(null);
  const [pausingId, setPausingId] = useState<bigint | null>(null);
  // 新增：报价状态
  const [offerPrices, setOfferPrices] = useState<Record<string, string>>({});
  const [offerEndTimes, setOfferEndTimes] = useState<Record<string, string>>({});
  const [offeringId, setOfferingId] = useState<bigint | null>(null);
  const [acceptingKey, setAcceptingKey] = useState<string | null>(null);

  const { writeContractAsync: buyNFT } = useScaffoldWriteContract({ contractName: "NFTMarketplace", disableSimulate: true });
  const { writeContractAsync: writeMarketplace } = useScaffoldWriteContract({ contractName: "NFTMarketplace", disableSimulate: true });
  const { writeContractAsync: makeOffer } = useScaffoldWriteContract({ contractName: "NFTMarketplace", disableSimulate: true });
  const { data: marketplaceInfo } = useDeployedContractInfo({ contractName: "NFTMarketplace" });

  // 获取所有活跃的市场列表
  const { data: activeListings, refetch: refetchListings } = useScaffoldReadContract({
    contractName: "NFTMarketplace",
    functionName: "getAllActiveListings",
  });

  // 获取 NFT 元数据
  const fetchNFTMetadata = async (tokenId: bigint): Promise<NFTMetadata | undefined> => {
    try {
      const response = await fetch(`/api/ipfs/nft/metadata/${tokenId}`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error("Error fetching NFT metadata:", error);
    }
    return undefined;
  };

  // 处理购买 NFT（单个）
  const handleBuyNFT = async (listing: MarketplaceNFT) => {
    if (!connectedAddress) {
      alert("请先连接钱包");
      return;
    }

    try {
      // 购买前链上校验：卖家持有与授权
      if (publicClient) {
        const erc721Abi = [
          { inputs: [{ name: "tokenId", type: "uint256" }], name: "ownerOf", outputs: [{ type: "address" }], stateMutability: "view", type: "function" },
          { inputs: [{ name: "tokenId", type: "uint256" }], name: "getApproved", outputs: [{ type: "address" }], stateMutability: "view", type: "function" },
          { inputs: [{ name: "owner", type: "address" }, { name: "operator", type: "address" }], name: "isApprovedForAll", outputs: [{ type: "bool" }], stateMutability: "view", type: "function" },
        ] as const;
        const owner = (await publicClient.readContract({
          address: listing.nftContract as `0x${string}`,
          abi: erc721Abi,
          functionName: "ownerOf",
          args: [listing.tokenId],
        })) as `0x${string}`;
        if (owner?.toLowerCase() !== listing.seller.toLowerCase()) {
          alert("卖家已不持有该 NFT，请刷新列表后重试");
          return;
        }
        const marketAddr = marketplaceInfo?.address;
        if (marketAddr) {
          const approvedAll = (await publicClient.readContract({
            address: listing.nftContract as `0x${string}`,
            abi: erc721Abi,
            functionName: "isApprovedForAll",
            args: [listing.seller as `0x${string}`, marketAddr],
          })) as boolean;
          const approvedToken = (await publicClient.readContract({
            address: listing.nftContract as `0x${string}`,
            abi: erc721Abi,
            functionName: "getApproved",
            args: [listing.tokenId],
          })) as `0x${string}`;
          if (!approvedAll && approvedToken?.toLowerCase() !== marketAddr.toLowerCase()) {
            alert("卖家未授权市场合约，暂时无法购买。请联系卖家恢复授权或等待其恢复上架");
            return;
          }
        }
      }
      setBuyingTokenId(listing.tokenId.toString());
      await buyNFT({
        functionName: "buyNFT",
        args: [listing.listingId],
        value: listing.price,
      }, { blockConfirmations: 1 });
      alert("购买成功！");
      refetchListings();
    } catch (error) {
      const msg = String((error as any)?.message || "");
      console.error("Error buying NFT:", error);
      if (msg.includes("Listing not active")) {
        alert("该上架已暂停或取消，请刷新列表");
      } else if (msg.includes("Insufficient payment")) {
        alert("支付金额不足，请确保钱包中有足够的 ETH 并按标价支付");
      } else if (msg.includes("Cannot buy your own NFT")) {
        alert("不能购买自己的 NFT");
      } else if (/not owner.*approved|not token owner.*approved|caller is not token owner/i.test(msg)) {
        alert("卖家未授权市场合约，暂时无法购买");
      } else {
        alert("购买失败，请重试");
      }
    } finally {
      setBuyingTokenId(null);
    }
  };

  // 新增：改价
  const handleUpdatePrice = async (listing: MarketplaceNFT) => {
    const key = listing.listingId.toString();
    const priceStr = editPrices[key];
    if (!priceStr || isNaN(Number(priceStr)) || Number(priceStr) <= 0) {
      alert("请输入有效的新价格");
      return;
    }
    try {
      setUpdatingId(listing.listingId);
      const newPrice = parseEther(priceStr as any);
      await writeMarketplace({ functionName: "updatePrice", args: [listing.listingId, newPrice] }, { blockConfirmations: 1 });
      await refetchListings();
    } catch (e) {
      const msg = String((e as any)?.message || "");
      console.error("Update price failed", e);
      if (msg.includes("Only seller can update price")) {
        alert("只有卖家可以改价");
      } else if (msg.includes("Price must be greater than 0")) {
        alert("价格必须大于 0");
      } else {
        alert("改价失败，请检查输入并重试");
      }
    } finally {
      setUpdatingId(null);
    }
  };

  // 新增：暂停
  const handlePauseListing = async (listing: MarketplaceNFT) => {
    try {
      if (publicClient) {
        const erc721Abi = [
          { inputs: [{ name: "tokenId", type: "uint256" }], name: "ownerOf", outputs: [{ type: "address" }], stateMutability: "view", type: "function" },
        ] as const;
        const owner = (await publicClient.readContract({
          address: listing.nftContract as `0x${string}`,
          abi: erc721Abi,
          functionName: "ownerOf",
          args: [listing.tokenId],
        })) as `0x${string}`;
        if (owner?.toLowerCase() !== connectedAddress?.toLowerCase()) {
          alert("只有卖家可以暂停上架");
          return;
        }
      }
      setPausingId(listing.listingId);
      await writeMarketplace({ functionName: "pauseListing", args: [listing.listingId] }, { blockConfirmations: 1 });
      await refetchListings();
    } catch (e) {
      const err = e as any;
      const msg = String(err?.shortMessage || err?.details || err?.cause?.message || err?.message || "");
      console.error("Pause listing failed", e);
      if (msg.includes("Listing not active")) {
        alert("该上架已不活跃，可能已被取消或售出");
      } else if (msg.includes("Only seller can pause")) {
        alert("只有卖家可以暂停上架");
      } else if (/User rejected/i.test(msg)) {
        alert("已取消钱包签名");
      } else if (/insufficient funds/i.test(msg)) {
        alert("余额不足，无法支付交易手续费");
      } else {
        alert("暂停失败，请重试");
      }
    } finally {
      setPausingId(null);
    }
  };

  // 新增：提交报价
  const handleMakeOffer = async (listing: MarketplaceNFT) => {
    const key = listing.listingId.toString();
    const priceStr = offerPrices[key];
    const endTimeStr = offerEndTimes[key];
    
    if (!connectedAddress) {
      alert("请先连接钱包");
      return;
    }
    if (!priceStr || parseFloat(priceStr) <= 0) {
      alert("请输入有效的报价");
      return;
    }

    try {
      setOfferingId(listing.listingId);
      const parseLocalDateTimeToEpochSeconds = (s: string) => {
        const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s);
        if (!m) return null;
        const year = Number(m[1]);
        const month = Number(m[2]);
        const day = Number(m[3]);
        const hour = Number(m[4]);
        const minute = Number(m[5]);
        const ms = new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
        if (!Number.isFinite(ms)) return null;
        return Math.floor(ms / 1000);
      };

      const nowSec = Math.floor(Date.now() / 1000);
      const expirationSec = endTimeStr ? parseLocalDateTimeToEpochSeconds(endTimeStr) : nowSec + 24 * 3600;
      if (!expirationSec || expirationSec <= nowSec) {
        alert("报价结束时间必须晚于当前时间");
        return;
      }
      const expiration = BigInt(expirationSec);
      const txHash = await makeOffer(
        { functionName: "makeOffer", args: [listing.listingId, expiration], value: parseEther(priceStr as any) },
        { blockConfirmations: 1 },
      );
      if (!txHash) throw new Error("交易未发送");
      alert("报价已提交！");
      setOfferPrices(prev => ({ ...prev, [key]: "" }));
      setOfferEndTimes(prev => ({ ...prev, [key]: "" }));
      window.dispatchEvent(new Event("marketplace:listingsChanged"));
    } catch (e) {
      console.error("Make offer failed", e);
      alert("报价失败，请重试");
    } finally {
      setOfferingId(null);
    }
  };

  // 新增：接受报价
  const handleAcceptOffer = async (listingId: bigint, offerIndex: number) => {
    try {
      setAcceptingKey(`${listingId}-${offerIndex}`);
      await writeMarketplace({ functionName: "acceptOffer", args: [listingId, BigInt(offerIndex)] }, { blockConfirmations: 1 });
      alert("已接受报价并完成交易");
      await refetchListings();
      window.dispatchEvent(new Event("marketplace:listingsChanged"));
    } catch (e) {
      console.error("Accept offer failed", e);
      alert("接受报价失败，请重试");
    } finally {
      setAcceptingKey(null);
    }
  };

  // 新增：批量购买
  const handleBulkBuy = async () => {
    if (!connectedAddress || selectedListingIds.length === 0) return;
    try {
      setIsBulkBuying(true);
      setBulkProgress({ done: 0, total: selectedListingIds.length });
      for (let i = 0; i < selectedListingIds.length; i++) {
        const id = selectedListingIds[i];
        const listing = listings.find(l => l.listingId === id);
        if (!listing) continue;
        // 跳过自己的 NFT
        if (listing.seller.toLowerCase() === connectedAddress.toLowerCase()) continue;
        setBulkProgress({ done: i, total: selectedListingIds.length, current: id });
        await buyNFT({ functionName: "buyNFT", args: [id], value: listing.price }, { blockConfirmations: 1 });
      }
      setBulkProgress({ done: selectedListingIds.length, total: selectedListingIds.length });
      alert("批量购买完成");
      setSelectedListingIds([]);
      setBulkMode(false);
      refetchListings();
    } catch (e) {
      console.error("Bulk buy failed", e);
      alert("批量购买失败，请重试");
    } finally {
      setIsBulkBuying(false);
    }
  };

  useEffect(() => {
    if (!isClient) return;
    const onChanged = () => {
      refetchListings();
    };
    window.addEventListener("marketplace:listingsChanged", onChanged);
    return () => {
      window.removeEventListener("marketplace:listingsChanged", onChanged);
    };
  }, [refetchListings]);

  // 加载列表和元数据
  useEffect(() => {
    if (!isClient) return;
    
    const loadListings = async () => {
      if (!activeListings || activeListings.length === 0) {
        setLoading(false);
        return;
      }

      const listingsWithMetadata = await Promise.all(
        activeListings.map(async (listing: MarketplaceListing) => {
          const metadata = await fetchNFTMetadata(listing.tokenId);
          return {
            ...listing,
            metadata,
          };
        })
      );

      setListings(listingsWithMetadata);
      setLoading(false);
      setCurrentPage(1); // 数据更新后重置到第一页
      setSelectedListingIds([]); // 重置选择
    };

    loadListings();
  }, [activeListings]);

  // 新增：聚合筛选
  const filteredListings = useMemo(() => {
    let result = listings;
    // 价格过滤（输入为字符串 ETH）
    let min: bigint | null = null;
    let max: bigint | null = null;
    try { min = minPrice ? parseEther(minPrice as any) : null; } catch {}
    try { max = maxPrice ? parseEther(maxPrice as any) : null; } catch {}

    result = result.filter(l => {
      const priceOk = (min === null || l.price >= min) && (max === null || l.price <= max);
      const sellerOk = sellerQuery ? l.seller.toLowerCase().includes(sellerQuery.toLowerCase()) : true;
      const contractOk = contractQuery ? l.nftContract.toLowerCase() === contractQuery.toLowerCase() : true;
      const mineOk = excludeMine && connectedAddress ? l.seller.toLowerCase() !== connectedAddress.toLowerCase() : true;
      return priceOk && sellerOk && contractOk && mineOk;
    });

    return result;
  }, [listings, minPrice, maxPrice, sellerQuery, contractQuery, excludeMine, connectedAddress]);

  // 新增：排序
  const sortedListings = useMemo(() => {
    const arr = [...filteredListings];
    switch (sortBy) {
      case "priceAsc":
        arr.sort((a, b) => (a.price < b.price ? -1 : a.price > b.price ? 1 : 0));
        break;
      case "priceDesc":
        arr.sort((a, b) => (a.price > b.price ? -1 : a.price < b.price ? 1 : 0));
        break;
      case "tokenIdAsc":
        arr.sort((a, b) => (a.tokenId < b.tokenId ? -1 : a.tokenId > b.tokenId ? 1 : 0));
        break;
      case "tokenIdDesc":
        arr.sort((a, b) => (a.tokenId > b.tokenId ? -1 : a.tokenId < b.tokenId ? 1 : 0));
        break;
      case "recent":
      default:
        // 以 listingId 倒序近似“最近”
        arr.sort((a, b) => (a.listingId > b.listingId ? -1 : a.listingId < b.listingId ? 1 : 0));
        break;
    }
    return arr;
  }, [filteredListings, sortBy]);

  // 分页派生（基于排序后的结果）
  const pageCount = Math.max(1, Math.ceil(sortedListings.length / pageSize));
  const currentPageSafe = Math.min(currentPage, pageCount);
  const startIndex = (currentPageSafe - 1) * pageSize;
  const pageListings = sortedListings.slice(startIndex, startIndex + pageSize);

  const gotoPage = (p: number) => {
    const next = Math.max(1, Math.min(p, pageCount));
    setCurrentPage(next);
  };

  // 计算选中总价（用于提示）
  const totalSelectedPrice = useMemo(() => {
    return selectedListingIds.reduce((acc, id) => {
      const listing = listings.find(l => l.listingId === id);
      return acc + (listing?.price ?? 0n);
    }, 0n);
  }, [selectedListingIds, listings]);

  if (!isClient || loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <span className="loading loading-spinner loading-lg"></span>
        <p className="mt-4 text-lg">Loading marketplace...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold mb-4">NFT Marketplace</h1>
        <p className="text-lg opacity-70">Discover and buy unique NFTs</p>
      </div>

      <div className="mb-6 p-4 bg-base-200 rounded-xl">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="form-control">
            <label className="label"><span className="label-text">最低价格 (ETH)</span></label>
            <input className="input input-bordered input-sm" placeholder="0" value={minPrice} onChange={e => setMinPrice(e.target.value)} />
          </div>
          <div className="form-control">
            <label className="label"><span className="label-text">最高价格 (ETH)</span></label>
            <input className="input input-bordered input-sm" placeholder="" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} />
          </div>
          <div className="form-control">
            <label className="label"><span className="label-text">卖家地址包含</span></label>
            <input className="input input-bordered input-sm" placeholder="0x..." value={sellerQuery} onChange={e => setSellerQuery(e.target.value)} />
          </div>
          <div className="form-control">
            <label className="label"><span className="label-text">合约地址</span></label>
            <input className="input input-bordered input-sm" placeholder="0x..." value={contractQuery} onChange={e => setContractQuery(e.target.value)} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="form-control">
            <label className="label cursor-pointer">
              <span className="label-text mr-2">排除我的上架</span>
              <input type="checkbox" className="checkbox checkbox-sm" checked={excludeMine} onChange={e => setExcludeMine(e.target.checked)} />
            </label>
          </div>
          <select className="select select-bordered select-sm" value={sortBy} onChange={e => setSortBy(e.target.value as any)}>
            <option value="recent">最近</option>
            <option value="priceAsc">价格升序</option>
            <option value="priceDesc">价格降序</option>
            <option value="tokenIdAsc">TokenId升序</option>
            <option value="tokenIdDesc">TokenId降序</option>
          </select>
          <button className="btn btn-ghost btn-sm" onClick={() => { setMinPrice(""); setMaxPrice(""); setSellerQuery(""); setContractQuery(""); setExcludeMine(false); setSortBy("recent"); setCurrentPage(1); }}>清空筛选</button>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2 items-center">
        {!bulkMode ? (
          <button className="btn btn-primary btn-sm" onClick={() => setBulkMode(true)}>批量购买</button>
        ) : (
          <div className="flex flex-wrap gap-2 items-center w-full">
            <button className="btn btn-outline btn-sm" onClick={() => setSelectedListingIds(pageListings.map(i => i.listingId))}>
              全选本页
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => setSelectedListingIds([])}>
              清空选择
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setBulkMode(false); setSelectedListingIds([]); }}>
              退出批量
            </button>
            <button
              className="btn btn-primary btn-sm"
              disabled={!connectedAddress || isBulkBuying || selectedListingIds.length === 0}
              onClick={handleBulkBuy}
            >
              {isBulkBuying ? (
                <>
                  <span className="loading loading-spinner loading-xs mr-1"></span>
                  购买中...
                </>
              ) : (
                <>购买选中({selectedListingIds.length})</>
              )}
            </button>
            {selectedListingIds.length > 0 && (
              <span className="text-xs opacity-70">预估总价 ~ {formatEther(totalSelectedPrice)} ETH</span>
            )}
            {isBulkBuying && bulkProgress ? (
              <span className="text-xs opacity-70">进度 {bulkProgress.done}/{bulkProgress.total}</span>
            ) : null}
          </div>
        )}
      </div>

      {listings.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🏪</div>
          <h2 className="text-2xl font-bold mb-2">No NFTs for sale</h2>
          <p className="text-lg opacity-70">Be the first to list an NFT on the marketplace!</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {pageListings.map((listing) => (
              <div
                key={`${listing.nftContract}-${listing.tokenId}`}
                className="card bg-base-100 shadow-xl hover:shadow-2xl transition-all duration-300 border border-base-300 overflow-hidden group relative"
              >
                {bulkMode ? (
                  <div className="absolute top-3 left-3 z-10">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-primary checkbox-sm"
                      checked={selectedListingIds.includes(listing.listingId)}
                      disabled={listing.seller.toLowerCase() === connectedAddress?.toLowerCase()}
                      onChange={e => {
                        const checked = e.target.checked;
                        setSelectedListingIds(prev => {
                          const exists = prev.includes(listing.listingId);
                          if (checked) return exists ? prev : [...prev, listing.listingId];
                          return prev.filter(id => id !== listing.listingId);
                        });
                      }}
                    />
                  </div>
                ) : null}

                <figure className="relative overflow-hidden">
                  {listing.metadata?.image ? (
                    <img
                      src={listing.metadata.image}
                      alt={listing.metadata.name || "NFT"}
                      className="h-64 w-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="h-64 w-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                      <span className="text-4xl">🖼️</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <figcaption className="absolute bottom-4 left-4 bg-black/70 backdrop-blur-sm text-white px-3 py-2 rounded-lg">
                    <span className="font-bold">#{listing.tokenId.toString()}</span>
                  </figcaption>
                </figure>

                <div className="card-body p-6">
                  <h3 className="card-title text-xl font-bold mb-2 line-clamp-1">
                    {listing.metadata?.name || `NFT #${listing.tokenId.toString()}`}
                  </h3>
                  {listing.metadata?.description && (
                    <p className="text-sm opacity-70 line-clamp-2 mb-4">
                      {listing.metadata.description}
                    </p>
                  )}

                  {listing.metadata?.attributes && listing.metadata.attributes.length > 0 && (
                    <div className="mb-4">
                      <div className="flex flex-wrap gap-2">
                        {listing.metadata.attributes.slice(0, 2).map((attr, index) => (
                          <div key={index} className="badge badge-outline badge-sm">
                            <span className="text-xs">{attr.trait_type}: {attr.value}</span>
                          </div>
                        ))}
                        {listing.metadata.attributes.length > 2 && (
                          <div className="badge badge-ghost badge-sm">
                            {"+"}{listing.metadata.attributes.length - 2} more
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="mb-4 p-3 bg-base-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold opacity-70">Seller</span>
                      <Address address={listing.seller} size="sm" />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg">
                      <span className="text-sm font-semibold">Price</span>
                      <div className="text-right">
                        <div className="text-lg font-bold text-primary">
                          {formatEther(listing.price)} ETH
                        </div>
                      </div>
                    </div>

                    {connectedAddress && listing.seller.toLowerCase() === connectedAddress.toLowerCase() ? (
                      <div className="p-3 bg-base-200 rounded-lg space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            className="input input-bordered input-sm flex-1"
                            placeholder="新价格 (ETH)"
                            value={editPrices[listing.listingId.toString()] || ""}
                            onChange={e => setEditPrices(prev => ({ ...prev, [listing.listingId.toString()]: e.target.value }))}
                          />
                          <button
                            className="btn btn-sm btn-primary"
                            disabled={updatingId === listing.listingId}
                            onClick={() => handleUpdatePrice(listing)}
                          >
                            {updatingId === listing.listingId ? (
                              <>
                                <span className="loading loading-spinner loading-xs mr-1"></span>
                                改价中...
                              </>
                            ) : (
                              <>改价</>
                            )}
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            className="btn btn-sm btn-warning flex-1"
                            disabled={pausingId === listing.listingId}
                            onClick={() => handlePauseListing(listing)}
                          >
                            {pausingId === listing.listingId ? (
                              <>
                                <span className="loading loading-spinner loading-xs mr-1"></span>
                                暂停中...
                              </>
                            ) : (
                              <>暂停上架</>
                            )}
                          </button>
                        </div>
                        {/* 卖家查看报价并接受 */}
                        <SellerOffersPanel listingId={listing.listingId} onAccept={handleAcceptOffer} acceptingKey={acceptingKey} />
                      </div>
                    ) : (
                      <div className="p-3 bg-base-200 rounded-lg space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            className="input input-bordered input-sm flex-1"
                            placeholder="报价 (ETH)"
                            value={offerPrices[listing.listingId.toString()] || ""}
                            onChange={e => setOfferPrices(prev => ({ ...prev, [listing.listingId.toString()]: e.target.value }))}
                          />
                          <button
                            className="btn btn-sm btn-secondary"
                            disabled={offeringId === listing.listingId}
                            onClick={() => handleMakeOffer(listing)}
                          >
                            {offeringId === listing.listingId ? (
                              <>
                                <span className="loading loading-spinner loading-xs mr-1"></span>
                                提交中...
                              </>
                            ) : (
                              <>提交报价</>
                            )}
                          </button>
                        </div>
                        <input
                          type="datetime-local"
                          className="input input-bordered input-sm w-full"
                          value={offerEndTimes[listing.listingId.toString()] || ""}
                          onChange={e => setOfferEndTimes(prev => ({ ...prev, [listing.listingId.toString()]: e.target.value }))}
                        />
                        <button
                          className="btn btn-primary btn-sm w-full"
                          disabled={buyingTokenId === listing.tokenId.toString()}
                          onClick={() => handleBuyNFT(listing)}
                        >
                          {buyingTokenId === listing.tokenId.toString() ? (
                            <>
                              <span className="loading loading-spinner loading-xs mr-1"></span>
                              购买中...
                            </>
                          ) : (
                            <>立即购买</>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="join flex justify-center my-6">
            <button className="join-item btn" onClick={() => gotoPage(currentPageSafe - 1)} disabled={currentPageSafe <= 1}>
              «
            </button>
            <button className="join-item btn">第 {currentPageSafe} / {pageCount} 页</button>
            <button className="join-item btn" onClick={() => gotoPage(currentPageSafe + 1)} disabled={currentPageSafe >= pageCount}>
              »
            </button>
          </div>
        </>
      )}
    </div>
  );
}


