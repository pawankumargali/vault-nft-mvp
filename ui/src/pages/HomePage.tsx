import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { /*ConnectButton,*/ useCurrentAccount } from '@mysten/dapp-kit';
import siteLogo from '../assets/logo.png'; // Import the logo

// Placeholder icons - replace with actual SVGs or a library like react-icons
// const PlaceholderIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
//   <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
//     <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
//   </svg>
// );

const FeatureIcon1 = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>;
const FeatureIcon2 = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>;
const FeatureIcon3 = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;


const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const currentAccount = useCurrentAccount();

  const handleLaunchApp = () => {
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-blue-50 text-gray-800 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <Link to="/" className="flex items-center space-x-2 transition-all duration-300 hover:scale-105">
              <img src={siteLogo} alt="Vaultron Logo" className="h-10 sm:h-12" />
            </Link>
            <nav className="flex items-center space-x-4 sm:space-x-6">
              <a href="#features" className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors">Features</a>
              <a href="#solution" className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors">Solution</a>
              {/* <a href="#pricing" className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors">Pricing</a> */}
              {/* <a href="#docs" className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors">Docs</a> */}
              {/* {currentAccount ? (
                <ConnectButton connectText="Connect Wallet" />
              ) : (
                 <ConnectButton connectText="Connect Wallet" className="!px-3 !py-1.5 !text-xs sm:!text-sm" />
              )} */}
               <button
                onClick={handleLaunchApp}
                className="text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
              >
                {currentAccount ? 'Go to Dashboard' : 'Launch App'}
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-grow">
        <section className="py-16 sm:py-24 bg-white">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold mb-6">
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-600">The Future of Portfolio Management</span>
              <span className="block text-gray-700 mt-2 sm:mt-3">Is Atomic & On-Chain.</span>
            </h1>
            <p className="max-w-xl lg:max-w-2xl mx-auto text-base sm:text-lg lg:text-xl text-gray-600 mb-10 leading-relaxed">
              Vaultron transforms your diverse token holdings into a single, transferable Vault NFT.
              Bundle, manage, and transfer entire portfolios with unprecedented ease and security on the Sui network.
            </p>
            <div className="flex flex-col sm:flex-row justify-center items-center space-y-4 sm:space-y-0 sm:space-x-6">
              <button
                onClick={handleLaunchApp}
                className="w-full sm:w-auto text-lg font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 px-8 py-3.5 rounded-lg transition-all duration-200 shadow-xl hover:shadow-2xl transform hover:-translate-y-1"
              >
                Create Your First Vault
              </button>
              <a
                href="#features"
                className="w-full sm:w-auto text-lg font-semibold text-blue-600 bg-white border-2 border-blue-500 hover:bg-blue-50 px-8 py-3.5 rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                Learn More
              </a>
            </div>
          </div>
        </section>

        {/* Solution Section */}
        <section id="solution" className="py-16 sm:py-20 bg-gradient-to-b from-blue-50 via-indigo-50 to-purple-50">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-4">Simplify Your Digital Asset Strategy</h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                Managing multiple tokens across different platforms can be complex and inefficient. Vaultron offers a streamlined solution.
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-8 lg:gap-12 items-center">
              <div className="space-y-6 pr-0 md:pr-8">
                {[
                  { title: "For DAOs & Treasuries", description: "Simplify signer rotations and reserve management. One NFT, one transfer." },
                  { title: "For Hedge Funds & Ops", description: "Abstract away spreadsheet rebalancing. Simulate strategies with auditable on-chain records." },
                  { title: "For Whale Investors", description: "Reduce gas costs and manage allocations efficiently. Portfolios become portable." },
                  { title: "For Custodians & Auditors", description: "Streamline proof of reserves and asset verification with a single, verifiable source." },
                ].map(item => (
                  <div key={item.title} className="p-5 bg-white rounded-xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow duration-300">
                    <h3 className="text-xl font-semibold text-blue-700 mb-2">{item.title}</h3>
                    <p className="text-gray-600 text-sm leading-relaxed">{item.description}</p>
                  </div>
                ))}
              </div>
              <div className="mt-8 md:mt-0">
                {/* Placeholder for an image or illustration */}
                <div className="bg-gradient-to-br from-indigo-400 to-purple-500 p-8 rounded-2xl shadow-2xl text-white aspect-video flex items-center justify-center">
                  <div className="text-center">
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-24 w-24 mx-auto mb-4 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                    <p className="text-2xl font-semibold">One Vault. Infinite Possibilities.</p>
                    {/* <p className="opacity-80 mt-1">Illustrative graphic placeholder.</p> */}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>


        {/* Features Section */}
        <section id="features" className="py-16 sm:py-20 bg-white">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-3">Core Features</h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                Vaultron is packed with powerful features to revolutionize your on-chain asset management.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {[
                {
                  icon: <FeatureIcon1 />,
                  title: "Bundle Tokens into NFTs",
                  description: "Consolidate various fungible tokens into a single, manageable Vault NFT. Simplify your holdings instantly.",
                },
                {
                  icon: <FeatureIcon2 />,
                  title: "Atomic Portfolio Transfers",
                  description: "Transfer entire multi-asset portfolios in one transaction by simply moving the Vault NFT. Efficient and secure.",
                },
                {
                  icon: <FeatureIcon3 />,
                  title: "Policy-Driven Simulations",
                  description: "Define target allocations and simulate rebalancing strategies (manual, time-based, drift-based) without live swaps on testnet.",
                },
                 {
                  icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>,
                  title: "Withdraw Individual Assets",
                  description: "Flexibly redeem any underlying token from your vault, partially or in full, whenever you need direct access.",
                },
                {
                  icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
                  title: "Target Weight Management",
                  description: "Easily set and adjust desired percentage weights for each asset within your vault, ensuring your portfolio aligns with your strategy.",
                },
                {
                  icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path fillRule="evenodd" clipRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.414-1.414L11 10.586V6z" strokeWidth="0" fill="currentColor" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.414-1.414L11 10.586V6z" /></svg>,
                  title: "Comprehensive Event Logging",
                  description: "All key actions—creations, transfers, simulations, policy changes—emit structured events for full auditability.",
                },
              ].map((feature) => (
                <div key={feature.title} className="p-6 bg-gradient-to-br from-white via-gray-50 to-white rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300 border border-gray-200/80">
                  <div className="flex items-center justify-center w-16 h-16 mb-5 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full">
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-semibold text-gray-800 mb-2">{feature.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Call to Action Section */}
        <section className="py-16 sm:py-20 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-700">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">Ready to Revolutionize Your Portfolio?</h2>
            <p className="max-w-xl lg:max-w-2xl mx-auto text-lg text-blue-100 mb-10">
              Step into the future of decentralized asset management. Create your Vaultron NFT today and experience the power of atomic, on-chain portfolios.
            </p>
            <button
              onClick={handleLaunchApp}
              className="text-xl font-semibold text-blue-700 bg-white hover:bg-blue-50 px-10 py-4 rounded-lg transition-all duration-200 shadow-2xl hover:shadow-blue-300/50 transform hover:scale-105"
            >
              {currentAccount ? 'Open Dashboard' : 'Launch App & Connect Wallet'}
            </button>
             <p className="mt-8 text-xs text-blue-200">
              Currently operating on Sui Testnet. All rebalancing actions are simulations only.
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-8 bg-white border-t border-gray-200">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex flex-col sm:flex-row justify-between items-center space-y-3 sm:space-y-0">
            <p className="text-sm text-gray-500">
              &copy; {new Date().getFullYear()} Vaultron. All rights reserved.
            </p>
            <div className="flex space-x-4 items-center">
               <img src={siteLogo} alt="Vaultron Mini Logo" className="h-6 opacity-70" />
               {/* <p className="text-sm text-gray-400 italic">Portfolio-as-NFT Protocol</p> */}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
