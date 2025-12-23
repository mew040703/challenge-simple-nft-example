"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { useScaffoldWriteContract, useScaffoldContract } from "~~/hooks/scaffold-eth";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { formatEther } from "viem";
// 新增：写合约与价格解析
import { parseEther } from "viem";
import { getMetadataFromIPFS } from "~~/utils/simpleNFT/ipfs-fetch";
import { SellerOffersPanel } from "~~/components/SellerOffersPanel";

interface ListingWithId {
  listingId: bigint;
  tokenId: bigint;
  nftContract: `0x${string}`;
  seller: `0x${string}`;
  price: bigint;
  active: boolean;
}

interface NFTMetadata {
  name?: string;
  description?: string;
  image?: string;
  attributes?: Array<{ trait_type?: string; value?: string }>;
}

interface MyListingItem extends ListingWithId {
  metadata?: NFTMetadata;
}

export const MyListings = () => {
  const { address: connectedAddress } = useAccount();
  const [myListings, setMyListings] = useState<MyListingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<bigint | null>(null);
  const [sellerListings, setSellerListings] = useState<ListingWithId[]>([]);
  const [reloadNonce, setReloadNonce] = useState(0);
  // 新增：批量下架状态
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedListingIds, setSelectedListingIds] = useState<bigint[]>([]);
  const [isBulkCancelling, setIsBulkCancelling] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; current?: bigint } | null>(null);
  // 新增：改价/暂停状态
  const [editPrices, setEditPrices] = useState<Record<string, string>>({});
  const [updatingId, setUpdatingId] = useState<bigint | null>(null);
  const [pausingId, setPausingId] = useState<bigint | null>(null);
  const [resumingId, setResumingId] = useState<bigint | null>(null);
  const [acceptingKey, setAcceptingKey] = useState<string | null>(null);

  const { data: marketplaceInfo } = useDeployedContractInfo({ contractName: "NFTMarketplace" });

  const { writeContractAsync: cancelListing } = useScaffoldWriteContract({ contractName: "NFTMarketplace", disableSimulate: true });
  const { writeContractAsync: writeMarketplace } = useScaffoldWriteContract({ contractName: "NFTMarketplace", disableSimulate: true });
  const { data: yourCollectibleContract } = useScaffoldContract({ contractName: "YourCollectible" });
  const publicClient = usePublicClient();
  const collectibleContractRef = useRef<typeof yourCollectibleContract | undefined>(undefined);

  useEffect(() => {
    collectibleContractRef.current = yourCollectibleContract;
  }, [yourCollectibleContract]);

  useEffect(() => {
    const onChanged = () => setReloadNonce(n => n + 1);
    window.addEventListener("marketplace:listingsChanged", onChanged);
    return () => {
      window.removeEventListener("marketplace:listingsChanged", onChanged);
    };
  }, []);

  useEffect(() => {
    if (!connectedAddress || !publicClient || !marketplaceInfo?.address) return;

    let cancelled = false;

    const marketplaceAbi = [
      {
        inputs: [],
        name: "nextListingId",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
      },
      {
        inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        name: "listings",
        outputs: [
          { internalType: "uint256", name: "tokenId", type: "uint256" },
          { internalType: "address", name: "nftContract", type: "address" },
          { internalType: "address", name: "seller", type: "address" },
          { internalType: "uint256", name: "price", type: "uint256" },
          { internalType: "bool", name: "active", type: "bool" },
        ],
        stateMutability: "view",
        type: "function",
      },
      {
        inputs: [
          { internalType: "address", name: "", type: "address" },
          { internalType: "uint256", name: "", type: "uint256" },
        ],
        name: "tokenToListing",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
      },
    ] as const;

    const loadSellerListings = async () => {
      try {
        const nextListingId = (await publicClient.readContract({
          address: marketplaceInfo.address,
          abi: marketplaceAbi,
          functionName: "nextListingId",
        })) as bigint;

        const max = Number(nextListingId);
        const sellerLower = connectedAddress.toLowerCase();
        const result: ListingWithId[] = [];

        for (let i = 1; i < max; i++) {
          const listingId = BigInt(i);
          const listing = (await publicClient.readContract({
            address: marketplaceInfo.address,
            abi: marketplaceAbi,
            functionName: "listings",
            args: [listingId],
          })) as readonly [bigint, `0x${string}`, `0x${string}`, bigint, boolean];

          const [tokenId, nftContract, seller, price, active] = listing;
          if (seller.toLowerCase() !== sellerLower) continue;

          const current = (await publicClient.readContract({
            address: marketplaceInfo.address,
            abi: marketplaceAbi,
            functionName: "tokenToListing",
            args: [nftContract, tokenId],
          })) as bigint;

          if (current !== listingId) continue;

          result.push({ listingId, tokenId, nftContract, seller, price, active });
        }

        result.sort((a, b) => (a.listingId === b.listingId ? 0 : a.listingId < b.listingId ? -1 : 1));
        if (!cancelled) setSellerListings(result);
      } catch {
        if (!cancelled) setSellerListings([]);
      }
    };

    loadSellerListings();

    return () => {
      cancelled = true;
    };
  }, [connectedAddress, marketplaceInfo?.address, publicClient, reloadNonce]);

  // 仅展示与当前用户相关的上架记录
  const filteredActiveListings = useMemo(() => {
    return sellerListings;
  }, [sellerListings]);

  // 使用稳定 key 作为依赖，避免数组引用变化导致无限循环
  const listingsKey = useMemo(() => filteredActiveListings.map(l => String(l.listingId)).join(","), [filteredActiveListings]);

  useEffect(() => {
    const contract = collectibleContractRef.current;
    if (!contract) return;

    let cancelled = false;

    const loadMetadata = async () => {
      try {
        setLoading(true);
        const promises = filteredActiveListings.map(async l => {
          try {
            // 仅处理我们合约的NFT
            const tokenURI = (await contract.read.tokenURI([l.tokenId])) as string;
            const ipfsHash = tokenURI.replace("https://green-payable-guan-79.mypinata.cloud/ipfs/", "");
            const metadata = await getMetadataFromIPFS(ipfsHash);
            return { ...l, metadata };
          } catch (e) {
            // 即使元数据失败也保留记录
            console.error(`Failed to load metadata for listing ${l.listingId}`, e);
            return { ...l };
          }
        });

        const result = await Promise.all(promises);
        
        if (!cancelled) {
          setMyListings(result);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    loadMetadata();

    return () => {
      cancelled = true;
    };
  }, [filteredActiveListings, listingsKey, yourCollectibleContract?.address]);

  const handleCancel = async (listingId: bigint) => {
    try {
      setCancellingId(listingId);
      const target = myListings.find(i => i.listingId === listingId);
      if (target && !target.active) {
        await writeMarketplace({ functionName: "resumeListing", args: [listingId] }, { blockConfirmations: 1 });
      }
      await cancelListing({ functionName: "cancelListing", args: [listingId] }, { blockConfirmations: 1 });
      setReloadNonce(n => n + 1);
    } catch (e) {
      const msg = String((e as any)?.message || "");
      if (msg.includes("Only seller can cancel")) {
        alert("只有卖家可以下架该上架记录");
      } else if (msg.includes("Listing not active")) {
        alert("该上架已不活跃或已被取消（如果已暂停，请先恢复上架）");
      } else {
        alert("下架失败，请重试");
      }
    } finally {
      setCancellingId(null);
    }
  };

  // 新增：改价
  const handleUpdatePrice = async (listingId: bigint) => {
    const key = listingId.toString();
    const priceStr = editPrices[key];
    if (!priceStr || isNaN(Number(priceStr)) || Number(priceStr) <= 0) {
      alert("请输入有效的新价格");
      return;
    }
    try {
      setUpdatingId(listingId);
      const newPrice = parseEther(priceStr as any);
      await writeMarketplace({ functionName: "updatePrice", args: [listingId, newPrice] }, { blockConfirmations: 1 });
      setReloadNonce(n => n + 1);
      setEditPrices(prev => ({ ...prev, [key]: "" }));
    } catch (e) {
      const msg = String((e as any)?.message || "");
      if (msg.includes("Only seller can update price")) {
        alert("只有卖家可以改价");
      } else if (msg.includes("Price must be greater than 0")) {
        alert("价格必须大于 0");
      } else if (msg.includes("Listing not active")) {
        alert("当前上架已暂停/不活跃，无法改价（请先恢复上架）");
      } else {
        alert("改价失败，请检查输入并重试");
      }
    } finally {
      setUpdatingId(null);
    }
  };

  // 新增：暂停
  const handlePauseListing = async (listingId: bigint) => {
    try {
      const target = myListings.find(i => i.listingId === listingId);
      if (!target) {
        alert("未找到该上架记录");
        return;
      }
      if (publicClient) {
        const erc721Abi = [
          { inputs: [{ name: "tokenId", type: "uint256" }], name: "ownerOf", outputs: [{ type: "address" }], stateMutability: "view", type: "function" },
        ] as const;
        const owner = (await publicClient.readContract({
          address: target.nftContract,
          abi: erc721Abi,
          functionName: "ownerOf",
          args: [target.tokenId],
        })) as `0x${string}`;
        if (owner?.toLowerCase() !== (connectedAddress || "").toLowerCase()) {
          alert("只有卖家可以暂停上架");
          return;
        }
      }
      setPausingId(listingId);
      await writeMarketplace({ functionName: "pauseListing", args: [listingId] }, { blockConfirmations: 1 });
      setReloadNonce(n => n + 1);
    } catch (e) {
      const err = e as any;
      const msg = String(err?.shortMessage || err?.details || err?.cause?.message || err?.message || "");
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

  const handleResumeListing = async (listingId: bigint) => {
    try {
      const target = myListings.find(i => i.listingId === listingId);
      if (!target) {
        alert("未找到该上架记录");
        return;
      }
      if (publicClient) {
        const erc721Abi = [
          { inputs: [{ name: "tokenId", type: "uint256" }], name: "ownerOf", outputs: [{ type: "address" }], stateMutability: "view", type: "function" },
        ] as const;
        const owner = (await publicClient.readContract({
          address: target.nftContract,
          abi: erc721Abi,
          functionName: "ownerOf",
          args: [target.tokenId],
        })) as `0x${string}`;
        if (owner?.toLowerCase() !== (connectedAddress || "").toLowerCase()) {
          alert("只有卖家可以恢复上架");
          return;
        }
      }
      setResumingId(listingId);
      await writeMarketplace({ functionName: "resumeListing", args: [listingId] }, { blockConfirmations: 1 });
      setReloadNonce(n => n + 1);
    } catch (e) {
      const err = e as any;
      const msg = String(err?.shortMessage || err?.details || err?.cause?.message || err?.message || "");
      if (msg.includes("Marketplace not approved")) {
        alert("未授权市场合约，请先重新授权");
      } else if (msg.includes("Seller no longer owns")) {
        alert("你已不再拥有该NFT，无法恢复上架");
      } else if (msg.includes("Listing not active")) {
        alert("该记录不是暂停状态或已被取消/售出");
      } else if (/User rejected/i.test(msg)) {
        alert("已取消钱包签名");
      } else if (/insufficient funds/i.test(msg)) {
        alert("余额不足，无法支付交易手续费");
      } else {
        alert("恢复上架失败，请重试");
      }
    } finally {
      setResumingId(null);
    }
  };

  // 新增：批量下架
  const handleBulkCancel = async () => {
    if (selectedListingIds.length === 0) return;
    try {
      setIsBulkCancelling(true);
      setBulkProgress({ done: 0, total: selectedListingIds.length });
      for (let i = 0; i < selectedListingIds.length; i++) {
        const id = selectedListingIds[i];
        setBulkProgress({ done: i, total: selectedListingIds.length, current: id });
        await cancelListing({ functionName: "cancelListing", args: [id] }, { blockConfirmations: 1 });
      }
      setBulkProgress({ done: selectedListingIds.length, total: selectedListingIds.length });
      setReloadNonce(n => n + 1);
      setSelectedListingIds([]);
      setBulkMode(false);
    } catch (e) {
      console.error("Bulk cancel failed", e);
    } finally {
      setIsBulkCancelling(false);
    }
  };

  // 新增：接受报价
  const handleAcceptOffer = async (listingId: bigint, offerIndex: number) => {
    try {
      setAcceptingKey(`${listingId}-${offerIndex}`);
      await writeMarketplace({ functionName: "acceptOffer", args: [listingId, BigInt(offerIndex)] }, { blockConfirmations: 1 });
      alert("已接受报价并完成交易");
      setReloadNonce(n => n + 1);
      window.dispatchEvent(new Event("marketplace:listingsChanged"));
    } catch (e) {
      alert("接受报价失败，请重试");
    } finally {
      setAcceptingKey(null);
    }
  };

  if (!connectedAddress) {
    return null;
  }

  return (
    <div className="px-5 mt-8">
      <h2 className="text-xl font-bold mb-4">我的上架记录</h2>

      {/* 批量下架面板 */}
      <div className="mb-4 flex flex-wrap gap-2 items-center">
        {!bulkMode ? (
          <button className="btn btn-primary btn-sm" onClick={() => setBulkMode(true)}>批量下架</button>
        ) : (
          <div className="flex flex-wrap gap-2 items-center w-full">
            <button className="btn btn-outline btn-sm" onClick={() => setSelectedListingIds(myListings.map(i => i.listingId))}>
              全选全部
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => setSelectedListingIds([])}>
              清空选择
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setBulkMode(false); setSelectedListingIds([]); }}>
              退出批量
            </button>
            <button
              className="btn btn-error btn-sm"
              disabled={isBulkCancelling || selectedListingIds.length === 0}
              onClick={handleBulkCancel}
            >
              {isBulkCancelling ? (
                <>
                  <span className="loading loading-spinner loading-xs mr-1"></span>
                  下架中...
                </>
              ) : (
                <>下架选中({selectedListingIds.length})</>
              )}
            </button>
            {isBulkCancelling && bulkProgress ? (
              <span className="text-xs opacity-70">进度 {bulkProgress.done}/{bulkProgress.total}</span>
            ) : null}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center items-center mt-6">
          <span className="loading loading-spinner loading-lg"></span>
        </div>
      ) : myListings.length === 0 ? (
        <div className="alert alert-info">
          <span>当前没有活跃的上架记录。</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {myListings.map(item => (
            <div key={String(item.listingId)} className="card bg-base-100 shadow-xl border border-base-300 relative">
              {/* 批量模式下选择复选框 */}
              {bulkMode ? (
                <div className="absolute top-3 left-3 z-10">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-primary checkbox-sm"
                    checked={selectedListingIds.includes(item.listingId)}
                    onChange={e => {
                      const checked = e.target.checked;
                      setSelectedListingIds(prev => {
                        const exists = prev.includes(item.listingId);
                        if (checked) return exists ? prev : [...prev, item.listingId];
                        return prev.filter(id => id !== item.listingId);
                      });
                    }}
                  />
                </div>
              ) : null}

              <figure className="h-48 overflow-hidden bg-base-200">
                {/* eslint-disable-next-line */}
                <img src={item.metadata?.image} alt={item.metadata?.name || `#${String(item.tokenId)}`} className="w-full h-full object-cover" />
              </figure>
              <div className="card-body">
                <div className="flex items-center justify-between">
                  <h3 className="card-title text-lg">{item.metadata?.name || `Token #${String(item.tokenId)}`}</h3>
                  <div className="badge badge-outline">#{String(item.tokenId)}</div>
                </div>
                {item.metadata?.description && (
                  <p className="text-sm opacity-70 line-clamp-2">{item.metadata.description}</p>
                )}
                <div className="mt-2">
                  <div className="text-sm">价格: <span className="font-semibold">{formatEther(item.price)} ETH</span></div>
                  <div className="text-xs opacity-70">上架ID: {String(item.listingId)}</div>
                  <div className="text-xs opacity-70">状态: {item.active ? "上架中" : "已暂停"}</div>
                </div>

                {/* 新增：改价/暂停操作面板 */}
                <div className="mt-3 p-3 bg-base-200 rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      className="input input-bordered input-sm flex-1"
                      placeholder="新价格 (ETH)"
                      value={editPrices[item.listingId.toString()] || ""}
                      onChange={e => setEditPrices(prev => ({ ...prev, [item.listingId.toString()]: e.target.value }))}
                    />
                    <button
                      className="btn btn-sm btn-primary"
                      disabled={updatingId === item.listingId}
                      onClick={() => handleUpdatePrice(item.listingId)}
                    >
                      {updatingId === item.listingId ? (
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
                    {item.active ? (
                      <button
                        className="btn btn-sm btn-warning flex-1"
                        disabled={pausingId === item.listingId}
                        onClick={() => handlePauseListing(item.listingId)}
                      >
                        {pausingId === item.listingId ? (
                          <>
                            <span className="loading loading-spinner loading-xs mr-1"></span>
                            暂停中...
                          </>
                        ) : (
                          <>暂停上架</>
                        )}
                      </button>
                    ) : (
                      <button
                        className="btn btn-sm btn-success flex-1"
                        disabled={resumingId === item.listingId}
                        onClick={() => handleResumeListing(item.listingId)}
                      >
                        {resumingId === item.listingId ? (
                          <>
                            <span className="loading loading-spinner loading-xs mr-1"></span>
                            恢复中...
                          </>
                        ) : (
                          <>恢复上架</>
                        )}
                      </button>
                    )}
                    <button
                      className="btn btn-error btn-sm"
                      disabled={cancellingId === item.listingId}
                      onClick={() => handleCancel(item.listingId)}
                    >
                      {cancellingId === item.listingId ? (
                        <>
                          <span className="loading loading-spinner loading-xs mr-1"></span>
                          取消中...
                        </>
                      ) : (
                        <>下架</>
                      )}
                    </button>
                  </div>
                </div>

                {/* 接收到的报价面板 */}
                <div className="mt-3 pt-3 border-t border-base-300">
                  <SellerOffersPanel
                    listingId={item.listingId}
                    onAccept={handleAcceptOffer}
                    acceptingKey={acceptingKey}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
