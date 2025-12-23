"use client";

import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { formatEther } from "viem";
import { Address } from "~~/components/scaffold-eth";

export function SellerOffersPanel({
  listingId,
  onAccept,
  acceptingKey,
}: {
  listingId: bigint;
  onAccept: (listingId: bigint, offerIndex: number) => void;
  acceptingKey: string | null;
}) {
  const { data: offers, isLoading } = useScaffoldReadContract({
    contractName: "NFTMarketplace",
    functionName: "getOffers",
    args: [listingId],
  });

  if (isLoading) return <div className="text-sm">加载报价...</div>;
  if (!offers || (offers as any[]).length === 0) return <div className="text-sm opacity-60">暂无报价</div>;

  return (
    <div className="space-y-2">
      <div className="font-semibold text-sm">收到的报价</div>
      {(offers as any[]).map((offer, idx) => {
        const amount = (offer.amount ?? offer[1]) as bigint;
        const offerer = (offer.offerer ?? offer[0]) as string;
        const expiration = (offer.expiration ?? offer[2]) as bigint;
        const active = (offer.active ?? offer[3]) as boolean;
        const expired = Number(expiration) * 1000 < Date.now();
        const key = `${listingId}-${idx}`;
        return (
          <div key={key} className="flex items-center justify-between text-sm bg-base-300 rounded px-2 py-1">
            <div className="flex items-center gap-2">
              <Address address={offerer} format="short" />
              <span className="opacity-70">{formatEther(amount)} ETH</span>
              <span className={`opacity-70 ${expired ? "text-error" : ""}`}>{expired ? "已过期" : "未过期"}</span>
              {!active && <span className="badge badge-outline">已取消</span>}
            </div>
            <button
              className="btn btn-xs btn-success"
              disabled={!active || expired || acceptingKey === key}
              onClick={() => onAccept(listingId, idx)}
            >
              {acceptingKey === key ? (
                <>
                  <span className="loading loading-spinner loading-xs mr-1"></span>
                  处理中...
                </>
              ) : (
                <>接受报价</>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
