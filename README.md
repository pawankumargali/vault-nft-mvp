# Portfolio-Vault-NFTs (MVP v0.0.1 Sui Testnet)

## Demo
[](https://www.loom.com/share/4e957581662744768d40751b213b0143)

Exploring Voltron: Crypto Portfolio Management Made Easy - Watch Video

[![](https://cdn.loom.com/sessions/thumbnails/4e957581662744768d40751b213b0143-b289746a8f296df4-full-play.gif)](https://www.loom.com/share/4e957581662744768d40751b213b0143)

## 1. Overview

Portfolio-Vault NFTs is a Minimum Viable Product (MVP) designed for the Sui testnet. It enables users, particularly large-fund entities like DAOs, hedge funds, and custodians, to bundle multiple fungible tokens into a single, atomic, and auditable Non-Fungible Token (NFT). This "Vault NFT" can be transferred as a single unit, representing the entire underlying portfolio.

The core functionality includes creating vaults, transferring them, withdrawing assets, setting target allocation weights for the bundled tokens, and **simulating** policy-driven portfolio rebalancing. Importantly, for this MVP version on the testnet, no live token swaps or DEX integrations are performed. Rebalancing is purely a simulation that plans proposed trades.

**Key Goals:**
*   Provide a single, transferable asset for complex portfolios.
*   Enable auditable tracking of portfolio composition and changes.
*   Allow users to define and simulate rebalancing strategies based on target weights and policies.

This project is designed with the intent that an autonomous engineering agent can use this documentation and the associated Product Requirements Document (PRD) to build the application.

## 2. Features (MVP v0.0.1-testnet)

*   **F-1: Create Vault:** Deposit ≥ 2 fungible tokens to mint a new Vault NFT.
*   **F-2: Transfer Vault:** Atomically transfer the entire portfolio by transferring the Vault NFT.
*   **F-3: Withdraw Assets:** Redeem any included token from the vault (partial or full withdrawal).
*   **F-4: Target Weights:** Record desired percentage weights for each token in the vault (must sum to 100%).
*   **F-5: Simulated Rebalance:** A "Rebalance Now" function computes hypothetical trades to align with target weights, validates against execution limits, and emits an event. **No tokens are actually moved or swapped.**
*   **F-6: Event Logging:** All key actions (creation, transfer, withdrawal, rebalance simulation, policy changes) emit structured, indexable events.


### Out of Scope for MVP:
*   Live token swaps or DEX integration.
*  Policy Engine: Create, Update, Pause, and Resume plug & play policies that govern vault strategies including Rebalancing, DCA and Yield Optimization.
*   Fractional vault ownership.
*   NFT or RWA deposits into vaults.
*   Heavy automation infrastructure beyond a lightweight keeper for triggers.
*   Cross-chain functionality.
*   Execution Limits:
    *   Maximum total slippage
    *   Per-trade slippage
    *   Trade-count cap
    *   Fee budget
    *   These limits are checked while attempting rebalance, and if breached, the rebalance is skipped.

## 3. Tech Stack

*   **Smart Contracts:** Sui Move
*   **Frontend:** React + Vite
*   **API Service:** Node.js API for pricing and Event Indexer
*   **Oracle Integration:** Relies on available SUI testnet price feeds for BTC, ETH, SUI from Hermes network (Pyth Oracle) exposed through the API service for off-chain calculations on frontend

## 4. Project Structure

```
/
├── api/                    # Node.js API Service (pricing, event indexing)
│   ├── src/                # API source code
├── contracts/              # Sui Move smart contracts
│   ├── portfolio_vault/    # Core vault NFT logic
│   │   └── sources/
│   │       └── portfolio_vault.move
│   ├── usdcm/              # Example USDC coin contract
│   ├── wbtcm/              # Example WBTC coin contract
│   ├── xautm/              # Example XAUT coin contract
│   ├── deploy_coins.sh     # Script to deploy mock coins
│   ├── deploy_vault.sh     # Script to deploy the vault contract
├── ui/                     # React Frontend (Vite)
│   ├── src/                # Frontend source code (pages, services)
│   ├── public/             # Static assets
│   ├── vite.config.ts
│   ├── package.json
├── pitch_deck/             # Project pitch deck
├── .gitignore
└── README.md               # This file
```

## 5. Getting Started

### Prerequisites

*   **Sui CLI:** Ensure the Sui command-line interface is installed and configured. Follow the official [Sui documentation](https://docs.sui.io/guides/developer/getting-started/sui-install).
*   **Node.js & Yarn (or npm):** Required for the API service and the UI.
    *   It's recommended to use Node.js version specified in `api/.nvmrc` or `ui/.nvmrc` (if present).

### Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd <project-directory-name> # e.g., vault-nft-mvp
    ```

2.  **Setup API Service:**
    ```bash
    cd api
    yarn install
    cp .env.example .env # Configure your .env file with necessary API keys, database URLs, etc.
    # Potentially run database migrations if using Prisma
    npx prisma generate
    npx prisma migrate dev # creates the tables on postgres db
    npx prisma db seed  # seeds supported coins data to `coin` table

    cd ..
    ```

3.  **Setup UI:**
    ```bash
    cd ui
    yarn install

    # Configure any config variables if needed (e.g., in the `src/config.ts` file)
    cd ..
    ```

4.  **Build Smart Contracts:**
    Navigate to the specific contract directory (e.g., `contracts/portfolio_vault`). Each contract is a separate Sui package.
    ```bash
    cd contracts/portfolio_vault
    sui move build
    ```

## 6. Deploying Smart Contracts

Contracts are deployed to the configured Sui network (testnet, localnet). The `contracts` directory contains shell scripts (`deploy_coins.sh`, `deploy_vault.sh`) to facilitate deployment.

1.  **Ensure your Sui CLI is configured for the target network (e.g., testnet, or a localnet instance).**

2.  **Deploy Mock Coins (if needed for testing):**
    ```bash
    cd contracts
    ./deploy_coins.sh
    ```
    Note the Object IDs of the deployed coins from `deployment.coins.log`.

3.  **Deploy Vault Contract:**
    ```bash
    cd contracts # if not already there
    ./deploy_vault.sh
    ```
    Note the Package ID and Object IDs (e.g., for the Vault Manager, Event Store) from `deployment.vault.log`. These will be needed by the API service and UI. Update your `.env` file in the `api` directory and potentially in the `ui` configuration with these new IDs.

## 7. Running the Application

1.  **Start the API Service:**
    ```bash
    cd api
    yarn start
    # Start the indexer
    # yarn start:indexer
    ```

2.  **Start the UI (Frontend):**
    ```bash
    cd ui
    yarn dev
    ```
    The UI should now be accessible in your browser, typically at `http://localhost:5173` (Vite's default).

3.  **Interacting with the Vault:**
    Use the UI to:
    *   Create new vaults by depositing mock fungible tokens.
    *   View vault details and balances.
    *   Set target weights for tokens within a vault.
    *   Initiate simulated rebalances.
    *   Transfer vault NFTs.
    *   Withdraw assets from vaults.

    The API service will handle price fetching (via Pyth/Hermes integration) for simulations and index events emitted by the smart contracts.

## 8. Event System

An event system is a core requirement for auditability. Key events implemented in `portfolio_vault.move` include:
*   `VaultCreated`: Vault ID, VaultCap ID, name, creator, policy.
*   `CoinDeposited`: Vault ID, depositor, coin type, amount, before balance, after balance.
*   `CoinWithdrawn`: Vault ID, withdrawer, recipient, coin type, amount, before balance, after balance.
*   `PolicySet`: Sender, Vault ID, rebalance type, rebalance interval days, rebalance threshold bps.
*   `TokenWeightsSet`: Sender, Vault ID, target coin types, target weights bps.
*   `VaultTransferred`: Vault ID, VaultCap ID, from address, to address.



The Node.js API service (`api/`) is responsible for listening to these on-chain events, indexing them (using Prisma and a PostgreSQL database). These events can be later exposed via API endpoints for the UI to consume if required
