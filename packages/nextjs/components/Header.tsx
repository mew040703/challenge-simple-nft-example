"use client";

import React, { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { hardhat } from "viem/chains";
import { Bars3Icon, BugAntIcon } from "@heroicons/react/24/outline";
import { ArrowDownTrayIcon, ArrowPathIcon, ArrowUpTrayIcon, PhotoIcon, ShoppingBagIcon} from "@heroicons/react/24/outline";
import { FaucetButton, RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useOutsideClick, useTargetNetwork } from "~~/hooks/scaffold-eth";

type HeaderMenuLink = {
  label: string;
  href: string;
  icon?: React.ReactNode;
};

export const menuLinks: HeaderMenuLink[] = [
  {
    label: "Home",
    href: "/",
  },
  {
    label: "My NFTs",
    href: "/myNFTs",
    icon: <PhotoIcon className="h-4 w-4" />,
  },
  {
    label: "Marketplace",
    href: "/marketplace",
    icon: <ShoppingBagIcon className="h-4 w-4" />,
  },
  
  {
    label: "Blind Auctions",
    href: "/blind-auctions",
    icon: <ArrowPathIcon className="h-4 w-4" />,   
  },

  {
    label: "Transfers",
    href: "/transfers",
    icon: <ArrowPathIcon className="h-4 w-4" />,
  },
  {
    label: "IPFS Upload",
    href: "/ipfsUpload",
    icon: <ArrowUpTrayIcon className="h-4 w-4" />,
  },
  {
    label: "IPFS Download",
    href: "/ipfsDownload",
    icon: <ArrowDownTrayIcon className="h-4 w-4" />,
  },
  {
    label: "Debug Contracts",
    href: "/debug",
    icon: <BugAntIcon className="h-4 w-4" />,
  },
];

export const HeaderMenuLinks = () => {
  const pathname = usePathname();

  return (
    <>
      {menuLinks.map(({ label, href, icon }) => {
        const isActive = pathname === href;
        return (
          <li key={href}>
            <Link
              href={href}
              passHref
              className={`${
                isActive ? "bg-secondary text-secondary-content font-medium shadow-md" : "text-base-content/80"
              } hover:bg-secondary hover:text-secondary-content hover:shadow-md focus:!bg-secondary active:!text-neutral py-2 px-4 text-sm rounded-xl gap-2 grid grid-flow-col transition-all duration-200`}
            >
              {icon}
              <span>{label}</span>
            </Link>
          </li>
        );
      })}
    </>
  );
};

/**
 * Site header
 */
export const Header = () => {
  const { targetNetwork } = useTargetNetwork();
  const isLocalNetwork = targetNetwork.id === hardhat.id;

  const burgerMenuRef = useRef<HTMLDetailsElement>(null);
  useOutsideClick(burgerMenuRef, () => {
    burgerMenuRef?.current?.removeAttribute("open");
  });

  return (
    <div className="sticky top-0 navbar bg-base-100 min-h-0 shrink-0 justify-between z-20 shadow-lg shadow-secondary/20 px-2 sm:px-6 transition-all duration-200 backdrop-blur-sm bg-base-100/90">
      <div className="navbar-start w-auto lg:w-1/2">
        <Link href="/" passHref className="flex items-center gap-3 ml-2 mr-6 shrink-0 group">
          <div className="flex relative w-10 h-10 sm:w-12 sm:h-12 rounded-full overflow-hidden shadow-md group-hover:shadow-lg transition-all duration-300">
            <Image alt="SE2 logo" className="cursor-pointer group-hover:scale-110 transition-all duration-300" fill src="/logo.svg" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold leading-tight text-base sm:text-lg bg-gradient-to-r from-primary to-secondary text-transparent bg-clip-text">SRE Challenges</span>
            <span className="text-xs sm:text-sm text-base-content/70">Simple NFT Example</span>
          </div>
        </Link>
        <ul className="hidden md:flex md:flex-nowrap menu menu-horizontal px-1 gap-1 lg:gap-2">
          <HeaderMenuLinks />
        </ul>
      </div>
      <div className="navbar-end grow mr-2 sm:mr-4 flex items-center gap-2">
        <RainbowKitCustomConnectButton />
        {isLocalNetwork && <FaucetButton />}
        <details className="dropdown dropdown-end md:hidden" ref={burgerMenuRef}>
          <summary
            tabIndex={0}
            className="btn btn-ghost btn-sm hover:bg-base-200 rounded-xl"
            aria-label="Menu"
            data-testid="hamburger-button"
          >
            <Bars3Icon className="h-6 w-6 text-primary" />
          </summary>
          <ul
            tabIndex={0}
            className="menu dropdown-content mt-3 p-4 shadow-lg bg-base-100 rounded-xl w-60 border border-base-200 gap-2"
            data-testid="hamburger-menu"
            onClick={() => {
              burgerMenuRef?.current?.removeAttribute("open");
            }}
          >
            <HeaderMenuLinks />
          </ul>
        </details>
      </div>
    </div>
  );
};
