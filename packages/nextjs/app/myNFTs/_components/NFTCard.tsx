import { useState } from "react";
import { parseEther } from "viem";
import { Collectible } from "./MyHoldings";
import { Address, AddressInput } from "~~/components/scaffold-eth";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth/useDeployedContractInfo";

export const NFTCard = ({ nft, selectable, selected, onSelectedChange }: { nft: Collectible; selectable?: boolean; selected?: boolean; onSelectedChange?: (checked: boolean) => void; }) => {
  const [transferToAddress, setTransferToAddress] = useState("");
  const [showTransfer, setShowTransfer] = useState(false);
  const [showSell, setShowSell] = useState(false);
  const [sellPrice, setSellPrice] = useState("");
  const [isListing, setIsListing] = useState(false);
  const [showBlind, setShowBlind] = useState(false);
  const [minBid, setMinBid] = useState("");
  const [commitDuration, setCommitDuration] = useState("3600");
  const [revealDuration, setRevealDuration] = useState("1800");
  const [isCreatingBlind, setIsCreatingBlind] = useState(false);

  const { writeContractAsync } = useScaffoldWriteContract({ contractName: "YourCollectible", disableSimulate: true });
  const { writeContractAsync: writeMarketplaceContract } = useScaffoldWriteContract({ contractName: "NFTMarketplace", disableSimulate: true });
  const { data: marketplaceInfo } = useDeployedContractInfo({ contractName: "NFTMarketplace" });
  const { data: collectibleInfo } = useDeployedContractInfo({ contractName: "YourCollectible" });

  const handleSellNFT = async () => {
    if (!sellPrice || parseFloat(sellPrice) <= 0) {
      alert("请输入有效的价格");
      return;
    }

    try {
      setIsListing(true);
      const marketplaceAddress = marketplaceInfo?.address || (process.env.NEXT_PUBLIC_NFT_MARKETPLACE_ADDRESS as `0x${string}` | undefined);
      const collectibleAddress = collectibleInfo?.address || (process.env.NEXT_PUBLIC_YOUR_COLLECTIBLE_ADDRESS as `0x${string}` | undefined);
      if (!marketplaceAddress || !collectibleAddress) {
        throw new Error("无法获取合约地址，请检查部署或网络/环境配置");
      }
      await writeContractAsync(
        {
          functionName: "approve",
          args: [marketplaceAddress, BigInt(nft.id.toString())],
        },
        { blockConfirmations: 1 },
      );
      await writeMarketplaceContract(
        {
          functionName: "listNFT",
          args: [collectibleAddress, BigInt(nft.id.toString()), parseEther(sellPrice)],
        },
        { blockConfirmations: 1 },
      );

      setShowSell(false);
      setSellPrice("");
      window.dispatchEvent(new Event("marketplace:listingsChanged"));
      alert("NFT 已成功上架到市场！");
    } catch (err) {
      console.error("Error listing NFT:", err);
      alert("上架失败，请重试");
    } finally {
      setIsListing(false);
    }
  };

  const handleCreateBlindAuction = async () => {
    if (!minBid || parseFloat(minBid) <= 0) {
      alert("请输入有效的最低出价");
      return;
    }
    if (!commitDuration || !revealDuration) {
      alert("请输入有效的提交/揭示时间");
      return;
    }

    try {
      setIsCreatingBlind(true);
      // 授权市场合约操作该 NFT
      const marketplaceAddress = marketplaceInfo?.address;
      if (!marketplaceAddress) {
        throw new Error("无法获取市场合约地址，请检查部署或网络配置");
      }
      await writeContractAsync({
        functionName: "approve",
        args: [marketplaceAddress, BigInt(nft.id.toString())],
      });

      // 在市场创建盲拍
      await writeMarketplaceContract({
        functionName: "createBlindAuction",
        args: [
          (() => {
            const envAddr = process.env.NEXT_PUBLIC_YOUR_COLLECTIBLE_ADDRESS as `0x${string}` | undefined;
            const resolved = (collectibleInfo?.address as `0x${string}` | undefined) || envAddr;
            if (!resolved) throw new Error("无法获取NFT合约地址，请检查部署或环境变量 NEXT_PUBLIC_YOUR_COLLECTIBLE_ADDRESS");
            return resolved;
          })(),
          BigInt(nft.id.toString()),
          parseEther(minBid),
          BigInt(commitDuration),
          BigInt(revealDuration),
        ],
      });

      setShowBlind(false);
      setMinBid("");
      setCommitDuration("3600");
      setRevealDuration("1800");
      window.dispatchEvent(new Event("marketplace:listingsChanged"));
      alert("盲拍创建成功！请至盲拍市场查看");
    } catch (err) {
      console.error("Error creating blind auction:", err);
      alert("盲拍创建失败，请重试");
    } finally {
      setIsCreatingBlind(false);
    }
  };

  return (
    <div className="card bg-base-100 shadow-xl hover:shadow-2xl transition-all duration-300 border border-base-300 overflow-hidden group relative">
      {/* 选择复选框（批量模式） */}
      {selectable ? (
        <div className="absolute top-3 left-3 z-10">
          <input
            type="checkbox"
            className="checkbox checkbox-primary checkbox-sm"
            checked={!!selected}
            onChange={(e) => onSelectedChange?.(e.target.checked)}
          />
        </div>
      ) : null}

      <figure className="relative overflow-hidden">
        {/* eslint-disable-next-line  */}
        <img 
          src={nft.image} 
          alt="NFT Image" 
          className="h-64 w-full object-cover group-hover:scale-105 transition-transform duration-300" 
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        <figcaption className="absolute bottom-4 left-4 bg-black/70 backdrop-blur-sm text-white px-3 py-2 rounded-lg">
          <span className="font-bold">#{nft.id}</span>
        </figcaption>
        {nft.attributes && nft.attributes.length > 0 && (
          <div className="absolute top-4 right-4">
            <div className="badge badge-primary badge-sm">
              {nft.attributes[0]?.value}
            </div>
          </div>
        )}
      </figure>
      
      <div className="card-body p-6">
        {/* NFT Title and Description */}
        <div className="mb-4">
          <h3 className="card-title text-xl font-bold mb-2 line-clamp-1">{nft.name}</h3>
          <p className="text-sm opacity-70 line-clamp-2">{nft.description}</p>
        </div>

        {/* Attributes */}
        {nft.attributes && nft.attributes.length > 0 && (
          <div className="mb-4">
            <div className="flex flex-wrap gap-2">
              {nft.attributes.slice(0, 3).map((attr, index) => (
                <div key={index} className="badge badge-outline badge-sm">
                  <span className="text-xs">{attr.trait_type}: {attr.value}</span>
                </div>
              ))}
              {nft.attributes.length > 3 && (
                <div className="badge badge-ghost badge-sm">
                  +{nft.attributes.length - 3} more
                </div>
              )}
            </div>
          </div>
        )}

        {/* Owner Info */}
        <div className="mb-4 p-3 bg-base-200 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold opacity-70">Owner</span>
            <Address address={nft.owner} size="sm" />
          </div>
        </div>

        {/* Action Buttons Section */}
        <div className="card-actions flex-col">
          {!showTransfer && !showSell && !showBlind ? (
            <div className="flex gap-2 w-full">
              <button
                className="btn btn-outline btn-sm flex-1"
                onClick={() => setShowTransfer(true)}
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                Transfer
              </button>
              <button
                className="btn btn-primary btn-sm flex-1"
                onClick={() => setShowSell(true)}
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
                Sell
              </button>
              <button
                className="btn btn-secondary btn-sm flex-1"
                onClick={() => setShowBlind(true)}
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6l4 2" />
                </svg>
                盲拍上架
              </button>
            </div>
          ) : showTransfer ? (
            <div className="w-full space-y-3">
              <div className="form-control">
                <label className="label">
                  <span className="label-text text-sm font-semibold">Transfer to:</span>
                </label>
                <AddressInput
                  value={transferToAddress}
                  placeholder="Enter recipient address"
                  onChange={newValue => setTransferToAddress(newValue)}
                />
              </div>
              <div className="flex gap-2">
                <button
                  className="btn btn-ghost btn-sm flex-1"
                  onClick={() => {
                    setShowTransfer(false);
                    setTransferToAddress("");
                  }}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary btn-sm flex-1"
                  disabled={!transferToAddress}
                  onClick={() => {
                    try {
                      writeContractAsync({
                        functionName: "transferFrom",
                        args: [nft.owner, transferToAddress, BigInt(nft.id.toString())],
                      });
                      setShowTransfer(false);
                      setTransferToAddress("");
                    } catch (err) {
                      console.error("Error calling transferFrom function", err);
                    }
                  }}
                >
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  Send
                </button>
              </div>
            </div>
          ) : showSell ? (
            <div className="w-full space-y-3">
              <div className="form-control">
                <label className="label">
                  <span className="label-text text-sm font-semibold">Sale Price (ETH):</span>
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="Enter price in ETH"
                  className="input input-bordered input-sm w-full"
                  value={sellPrice}
                  onChange={(e) => setSellPrice(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <button
                  className="btn btn-ghost btn-sm flex-1"
                  onClick={() => {
                    setShowSell(false);
                    setSellPrice("");
                  }}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary btn-sm flex-1"
                  disabled={!sellPrice || parseFloat(sellPrice) <= 0 || isListing}
                  onClick={handleSellNFT}
                >
                  {isListing ? (
                    <>
                      <span className="loading loading-spinner loading-xs mr-1"></span>
                      Listing...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                      </svg>
                      List for Sale
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : showBlind ? (
            <div className="w-full space-y-3">
              <div className="form-control">
                <label className="label">
                  <span className="label-text text-sm font-semibold">最低出价 (ETH):</span>
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="输入最低出价"
                  className="input input-bordered input-sm w-full"
                  value={minBid}
                  onChange={(e) => setMinBid(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text text-sm font-semibold">提交期 (秒):</span>
                  </label>
                  <input
                    type="number"
                    min="60"
                    placeholder="例如 3600"
                    className="input input-bordered input-sm w-full"
                    value={commitDuration}
                    onChange={(e) => setCommitDuration(e.target.value)}
                  />
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text text-sm font-semibold">揭示期 (秒):</span>
                  </label>
                  <input
                    type="number"
                    min="300"
                    placeholder="例如 1800"
                    className="input input-bordered input-sm w-full"
                    value={revealDuration}
                    onChange={(e) => setRevealDuration(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn btn-ghost btn-sm flex-1"
                  onClick={() => {
                    setShowBlind(false);
                    setMinBid("");
                    setCommitDuration("3600");
                    setRevealDuration("1800");
                  }}
                >
                  取消
                </button>
                <button
                  className="btn btn-secondary btn-sm flex-1"
                  disabled={!minBid || parseFloat(minBid) <= 0 || isCreatingBlind}
                  onClick={handleCreateBlindAuction}
                >
                  {isCreatingBlind ? (
                    <>
                      <span className="loading loading-spinner loading-xs mr-1"></span>
                      创建中...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6l4 2" />
                      </svg>
                      创建盲拍
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
