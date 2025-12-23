"use client";

import Image from "next/image";
import Link from "next/link";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { BugAntIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { Address } from "~~/components/scaffold-eth";

const Home: NextPage = () => {
  const { address: connectedAddress } = useAccount();

  return (
    <>
      <div className="flex items-center flex-col grow pt-10">
        <div className="px-8 max-w-6xl mx-auto">
          <h1 className="text-center mb-6">
            <span className="block text-3xl mb-3 text-accent font-light">Welcome to</span>
            <span className="block text-5xl font-bold bg-gradient-to-r from-primary to-secondary text-transparent bg-clip-text mb-2">Scaffold-ETH 2</span>
            <span className="block text-xl font-semibold text-base-content/80">(SpeedRunEthereum Challenge: Simple NFT Example extension)</span>
          </h1>
          <div className="flex justify-center items-center space-x-2 flex-col bg-base-200 rounded-xl p-4 shadow-md mb-8 hover:shadow-lg transition-all duration-300">
            <p className="my-2 font-medium text-base-content/90">Connected Address:</p>
            <Address address={connectedAddress} />
          </div>

          <div className="flex items-center flex-col flex-grow mt-8">
            <div className="w-full">
              <h1 className="text-center mb-8">
                <span className="block text-4xl font-bold text-primary">Challenge: Simple NFT Example</span>
              </h1>
              <div className="flex flex-col items-center justify-center">
                <div className="relative group">
                  <Image
                    src="/hero.png"
                    width="727"
                    height="231"
                    alt="challenge banner"
                    className="rounded-xl border-4 border-primary shadow-lg group-hover:scale-[1.01] transition-all duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-secondary/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                </div>
                <div className="max-w-3xl mt-10">
                  <p className="text-center text-lg leading-relaxed mb-6">
                    🎫 Create a simple NFT to learn basics of 🏗️ Scaffold-ETH 2. You'll use 👷‍♀️
                    <a
                      href="https://hardhat.org/getting-started/"
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:text-secondary underline transition-colors duration-200"
                    >
                      HardHat
                    </a>{" "}
                    to compile and deploy smart contracts. Then, you'll use a template React app full of important
                    Ethereum components and hooks. Finally, you'll deploy an NFT to a public network to share with
                    friends! 🚀
                  </p>
                  <p className="text-center text-lg leading-relaxed">
                    🌟 The final deliverable is an app that lets users purchase and transfer NFTs. Deploy your contracts
                    to a testnet then build and upload your app to a public web server. Submit the url on{" "}
                    <a href="https://speedrunethereum.com/" target="_blank" rel="noreferrer" className="text-primary hover:text-secondary underline transition-colors duration-200">
                      SpeedRunEthereum.com
                    </a>{" "}
                    !
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grow bg-base-300 w-full mt-16 px-8 py-16">
          <h2 className="text-center text-3xl font-bold mb-10 text-base-content">Explore the Features</h2>
          <div className="flex justify-center items-stretch gap-8 flex-col md:flex-row max-w-5xl mx-auto">
            <div className="flex flex-col bg-base-100 px-8 py-10 text-center items-center rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 hover:translate-y-[-5px] flex-1">
              <div className="bg-primary/10 p-4 rounded-full mb-4">
                <BugAntIcon className="h-10 w-10 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-4">Debug Contracts</h3>
              <p className="mb-6">
                Tinker with your smart contract using our interactive debugging tools.
              </p>
              <Link href="/debug" passHref className="btn btn-primary btn-sm mt-auto">
                Debug Contracts
              </Link>
            </div>
            <div className="flex flex-col bg-base-100 px-8 py-10 text-center items-center rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 hover:translate-y-[-5px] flex-1">
              <div className="bg-secondary/10 p-4 rounded-full mb-4">
                <MagnifyingGlassIcon className="h-10 w-10 text-secondary" />
              </div>
              <h3 className="text-xl font-bold mb-4">Block Explorer</h3>
              <p className="mb-6">
                Explore your local transactions with our detailed block explorer.
              </p>
              <Link href="/blockexplorer" passHref className="btn btn-secondary btn-sm mt-auto">
                Block Explorer
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Home;
