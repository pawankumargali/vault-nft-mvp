export const PORTFOLIO_VAULT_PACKAGE_ID = "0x7fa2eb45505a312af03493b28ad94828e5d28a17b8d3ef3702fb612a6e336774";
export const PORTFOLIO_VAULT_MODULE_NAME = "vault";
export const API_BASE_URL = 'http://localhost:8081/api'; // Or your deployed API URL

export const PREFERRED_STABLE_COIN = {
    symbol: 'USDCm', // The symbol we expect to see in APIs and for display
    // A fallback coin type. Ideally, the actual coin_type is found via apiSupportedTokens.
    // Example for Wormhole USDC on Sui Testnet (this might vary)
    defaultCoinType: '0x8c17b383e12e98e5d475c9d0ef8c10bf1cc11494b304038a9706fa6c10ff3a5a::usdcm::USDCM',
    // A more generic placeholder if the specific one isn't known or to be fetched dynamically:
    // defaultCoinType: 'placeholder::stablecoin::COIN'
  };
