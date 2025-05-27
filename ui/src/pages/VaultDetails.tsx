import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ConnectButton,
  useCurrentAccount,
  useSuiClient,
  useSignAndExecuteTransaction,
} from '@mysten/dapp-kit';
import { type SuiTransactionBlockResponse } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { formatDistanceToNow } from 'date-fns';
// import { bcs } from '@mysten/bcs'; // Potentially needed for complex transactions

import { getVaultById, type ProcessedVault, type ProcessedVaultToken } from '../services/suiService'; // Assuming getVaultById is created
import { getSupportedTokens, getTokenPrices, type Token as ApiToken, type TokenPrices } from '../services/api';
import { PORTFOLIO_VAULT_PACKAGE_ID, PREFERRED_STABLE_COIN } from '../config'; // If needed for transactions
import siteLogo from '../assets/logo.png'; // Import the logo

// Helper to get a better icon (can be shared or defined locally)
const getTokenIcon = (symbol: string, coinType: string, metadataIconUrl?: string | null, apiIconUrl?: string | null): string => {
  if (apiIconUrl) return apiIconUrl;
  if (metadataIconUrl) return metadataIconUrl;
  const s = symbol.toUpperCase();
  if (s.includes('BTC')) return '₿';
  if (s.includes('ETH')) return '⟠';
  if (s.includes('USDC')) return '💲';
  if (s.includes('SOL')) return '◎';
  if (s.includes('SUI')) return '🔵';
  if (coinType.includes('wsolm')) return '◎';
  if (coinType.includes('wbtcm')) return '₿';
  if (coinType.includes('usdcm')) return '💲';
  return '🪙';
 };


type NotificationType = 'success' | 'error' | 'info';
interface Notification { type: NotificationType; message: string; }

interface EnrichedVaultToken extends ProcessedVaultToken {
  symbol: string;
  decimals: number;
  price: number;
  amountNum: number;
  usdValue: number;
  logo: string;
}

interface EnrichedProcessedVault extends Omit<ProcessedVault, 'tokens'> {
  tokens: EnrichedVaultToken[];
  displayTotalValue: string;
  displayLastRebalance: string;
  policyDisplay: string;
  capId?: string;
}

// Define the structure for a proposed trade
interface ProposedTrade {
  action: 'SELL' | 'BUY';
  // Details of the non-stablecoin asset being traded
  tradedTokenSymbol: string;
  tradedTokenCoinType: string;
  tradedTokenAmount: number;
  tradedTokenDecimals: number;
  // Details of the stablecoin used as the counter asset
  counterAssetSymbol: string;
  counterAssetCoinType: string;
  // The total USD equivalent value of this specific trade
  equivalentValueUsd: number;
}


const VaultDetails = () => {
  const { id: vaultId } = useParams<{ id: string }>();

  const navigate = useNavigate();
  const currentAccount = useCurrentAccount();
  const suiClient = useSuiClient(); // Renamed from 'client' to 'suiClient' for clarity if 'client' from useSuiClient() is preferred.
  const { mutate: signAndExecuteTransaction, isPending: isSignAndExecutePending } = useSignAndExecuteTransaction({
		execute: async ({ bytes, signature }) =>
			await suiClient.executeTransactionBlock({ // Assuming suiClient is the one from useSuiClient()
				transactionBlock: bytes,
				signature,
				options: { showRawEffects: true, showObjectChanges: true, showEvents: true }
			}),
	});


  const [vaultDetails, setVaultDetails] = useState<EnrichedProcessedVault | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notification, setNotification] = useState<Notification | null>(null);
  const [apiSupportedTokens, setApiSupportedTokens] = useState<ApiToken[]>([]);
  const [tokenPrices, setTokenPrices] = useState<TokenPrices>({});

  // Modals
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [selectedTokenForWithdrawal, setSelectedTokenForWithdrawal] = useState<EnrichedVaultToken | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [transferRecipient, setTransferRecipient] = useState('');
  const [isProcessingLocalTx, setIsProcessingLocalTx] = useState(false); // Renamed to avoid conflict if isPending from useSignAndExecuteTransaction is used directly for UI
  const [portfolioWeightsDisturbed, setPortfolioWeightsDisturbed] = useState(false);

  // New state variables for rebalance modal and calculation
  const [isRebalanceModalOpen, setIsRebalanceModalOpen] = useState(false);
  const [proposedTrades, setProposedTrades] = useState<ProposedTrade[]>([]);
  const [isCalculatingRebalance, setIsCalculatingRebalance] = useState(false);


  const showNotification = (type: NotificationType, message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  useEffect(() => {
    const fetchApiData = async () => {
      try {
        const tokens = await getSupportedTokens();
        setApiSupportedTokens(tokens);
        if (tokens.length > 0) {
          const idsToFetch = tokens.map(t => t.id);
          const prices = await getTokenPrices(idsToFetch);
          setTokenPrices(prices);
        }
      } catch (error) {
        console.error("Failed to fetch API data for vault details:", error);
        showNotification('error', 'Could not fetch token catalog or prices.');
      }
    };
    fetchApiData();
  }, []);

  // Function to process raw vault data, enrich it, and set state
  const enrichAndSetVaultDetails = (rawVaultData: ProcessedVault | null) => {
    if (rawVaultData && apiSupportedTokens.length > 0 && Object.keys(tokenPrices).length > 0) {
      let calculatedTotalValueNumber = 0; // Sum of per-token values already rounded to N.XX

      const enrichedTokensWithRoundedUsd = rawVaultData.tokens.map((token: ProcessedVaultToken) => {
        const apiTokenInfo = apiSupportedTokens.find(apt => apt.coin_type === token.coinType);
        const priceInfo = apiTokenInfo ? tokenPrices[apiTokenInfo.id] : undefined;
        const decimals = apiTokenInfo?.decimals ?? 9;
        const price = priceInfo ? parseFloat(priceInfo.price) : 0;
        const amountBigInt = BigInt(token.amount || '0');
        const amountNum = Number(amountBigInt) / Math.pow(10, decimals);

        const rawUsdValue = amountNum * price; // The original, potentially high-precision USD value

        // Round the USD value for this token to 2 decimal places as a number.
        // This rounded number will be stored in the token and used for summing the total.
        const roundedNumericUsdValue = parseFloat(rawUsdValue.toFixed(2));

        calculatedTotalValueNumber += roundedNumericUsdValue;

        const symbol = apiTokenInfo?.symbol || token.coinType.split('::').pop()?.toUpperCase() || 'UNK';
        const logo = getTokenIcon(symbol, token.coinType, undefined, apiTokenInfo?.icon);
        return {
          ...token,
          symbol,
          decimals,
          price,
          amountNum,
          usdValue: roundedNumericUsdValue, // Store the numerically rounded USD value
          logo,
          capId: rawVaultData.capId,
        };
      });

      // Disturbance check logic uses token.usdValue, which is now the roundedNumericUsdValue
      let isDisturbedOnLoad = false;
      if (calculatedTotalValueNumber > 0) {
        for (const token of enrichedTokensWithRoundedUsd) {
          const targetWeightBps = token.weightBps || 0;
          // token.usdValue here is already roundedNumericUsdValue
          const actualWeightBps = (token.usdValue / calculatedTotalValueNumber) * 10000;
          if (Math.abs(actualWeightBps - targetWeightBps) > 10) {
            isDisturbedOnLoad = true;
            break;
          }
        }
      } else if (enrichedTokensWithRoundedUsd.some(token => (token.weightBps || 0) > 0)) {
        isDisturbedOnLoad = true;
      }
      if (enrichedTokensWithRoundedUsd.every(token => (token.weightBps || 0) === 0) && enrichedTokensWithRoundedUsd.length > 0) {
        isDisturbedOnLoad = false;
      }
      if (enrichedTokensWithRoundedUsd.length === 0) {
        isDisturbedOnLoad = false;
      }
      setPortfolioWeightsDisturbed(isDisturbedOnLoad);

      setVaultDetails({
        ...rawVaultData,
        tokens: enrichedTokensWithRoundedUsd,
        displayTotalValue: calculatedTotalValueNumber.toFixed(2),
        displayLastRebalance: rawVaultData.lastUpdatedAt ? formatDistanceToNow(new Date(rawVaultData.lastUpdatedAt), { addSuffix: true }) : 'N/A',
        policyDisplay: `${rawVaultData.policy.derivedTypeString}${rawVaultData.policy.derivedTypeString === 'Time-based' && rawVaultData.policy.rebalanceIntervalDays > 0 ? ` (${rawVaultData.policy.rebalanceIntervalDays}d)` : ''}`,
        capId: rawVaultData.capId,
      });
      setIsLoading(false);
    } else if (!rawVaultData) {
      showNotification('error', 'Vault not found or could not be loaded.');
      setVaultDetails(null);
      setIsLoading(false);
    } else {
      // API data might still be loading, don't nullify vault if raw data exists
      // The main useEffect will re-trigger enrichment when API data is ready.
      // console.log("Enrichment skipped, API data not ready yet. Raw vault data available.");
    }
  };

  useEffect(() => {
    const fetchVaultData = async () => {
      if (!vaultId || !currentAccount?.address) {
        setIsLoading(false);
        return; // Essential IDs missing, don't attempt to load.
      }
      // Wait for API data if not yet available
      if (!apiSupportedTokens.length || !Object.keys(tokenPrices).length) {
        // console.log("Vault fetch deferred: API data (tokens/prices) not ready.");
        // setIsLoading(true); // Optionally keep loading true if API data is essential before first render attempt
        return;
      }

      setIsLoading(true);
      try {
        const fetchedVault = await getVaultById(vaultId, suiClient);
        enrichAndSetVaultDetails(fetchedVault); // Use the centralized enrichment function
      } catch (error) {
        console.error("Failed to fetch vault details:", error);
        showNotification('error', 'Could not fetch vault details. Please try again later.');
        setVaultDetails(null);
        setIsLoading(false);
      }
    };

    fetchVaultData();
  }, [vaultId, currentAccount?.address, apiSupportedTokens, tokenPrices, suiClient]); // Added suiClient to deps, enrichAndSetVaultDetails is not memoized so it could be a dep if defined outside but it uses state variables
  // Removed enrichAndSetVaultDetails from dependency array as it's defined outside and causes re-runs. Alternative is to memoize it or include all its own dependencies if it were inside useEffect.
  // For simplicity here, assuming its dependencies (apiSupportedTokens, tokenPrices) are stable or trigger re-runs of this useEffect anyway.


  const handleWithdraw = async () => {
    if (!currentAccount?.address || !vaultDetails || !selectedTokenForWithdrawal || !withdrawAmount) {
      showNotification('error', 'Missing information for withdrawal.');
      return;
    }
    if (!vaultDetails.capId) {
      showNotification('error', 'Vault capability ID is missing, cannot withdraw.');
      return;
    }
    const amountNum = parseFloat(withdrawAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      showNotification('error', 'Invalid withdrawal amount.');
      return;
    }
    if (amountNum > selectedTokenForWithdrawal.amountNum) {
      showNotification('error', 'Withdrawal amount exceeds token balance in vault.');
      return;
    }

    setIsProcessingLocalTx(true);
    showNotification('info', 'Processing withdrawal...');

    try {
      const txb = new Transaction();
      txb.setSender(currentAccount.address);
      txb.setGasBudget(100000000); // Adjust as needed

      const amountBigInt = BigInt(Math.round(amountNum * Math.pow(10, selectedTokenForWithdrawal.decimals)));

      // Contract signature: withdraw_coin<T>(_: &VaultCap, vault: &mut Vault, amount: u64, recipient: address, ctx: &TxContext)
      txb.moveCall({
        target: `${PORTFOLIO_VAULT_PACKAGE_ID}::vault::withdraw_coin`,
        arguments: [
          txb.object(vaultDetails.capId), // Argument 1: VaultCap
          txb.object(vaultDetails.id),    // Argument 2: Vault object
          txb.pure.u64(amountBigInt.toString()), // Argument 3: amount_to_withdraw
          txb.pure.address(currentAccount.address), // Argument 4: recipient
        ],
        typeArguments: [selectedTokenForWithdrawal.coinType],
      });

      signAndExecuteTransaction(
        { transaction: txb, chain: 'sui:testnet' },
        {
          onSuccess: (result: SuiTransactionBlockResponse) => {
            console.log('Withdrawal successful', result);
            showNotification('success', `Successfully withdrew ${amountNum} ${selectedTokenForWithdrawal.symbol}.`);
            if (vaultId && currentAccount?.address) { // API data check removed
              getVaultById(vaultId, suiClient).then(v => {
                enrichAndSetVaultDetails(v); // Use the centralized enrichment function
              }).catch(e => {
                console.error("Error refetching vault post-withdraw:", e);
                showNotification('error', "Vault data refetch failed post-withdraw. Display may be stale.");
              });
            }
            setIsWithdrawModalOpen(false);
            setWithdrawAmount('');
            setSelectedTokenForWithdrawal(null);
          },
          onError: (error: Error | unknown) => {
            console.error('Withdrawal failed', error);
            const message = error instanceof Error ? error.message : "Withdrawal transaction failed.";
            showNotification('error', message);
          }
        }
      );
    } catch (error) {
      console.error("Error preparing withdrawal transaction:", error);
      const message = error instanceof Error ? error.message : "Could not prepare withdrawal.";
      showNotification('error', message);
    } finally {
      setIsProcessingLocalTx(false);
    }
  };

  const handleTransfer = async () => {
    if (!currentAccount?.address || !vaultDetails || !transferRecipient.trim()) {
      showNotification('error', 'Missing information for transfer.');
      return;
    }
    // Basic address validation (SUI addresses are 0x... and 66 chars long)
    if (!/^0x[a-fA-F0-9]{64}$/.test(transferRecipient.trim())) {
        showNotification('error', 'Invalid recipient SUI address.');
        return;
    }

    setIsProcessingLocalTx(true);
    showNotification('info', 'Processing transfer...');

    try {
      const txb = new Transaction();
      txb.setSender(currentAccount.address);
      txb.setGasBudget(100000000); // Adjust as needed

      // The vault object itself is the NFT.
      // We also need to transfer the VaultCap object if it's separate and owned by the user.
      // This depends on how your `create_vault` function and ownership are structured.
      // Assuming vaultDetails.id is the Vault NFT object ID.
      // And vaultDetails.capId (if it exists and is separate) is the VaultCap object ID.
      const objectsToTransfer = [txb.object(vaultDetails.id)];
      if (vaultDetails.capId) { // Add capId if it's a property on your enriched vault
        objectsToTransfer.push(txb.object(vaultDetails.capId));
      }

      txb.transferObjects(objectsToTransfer, txb.pure.address(transferRecipient.trim()));

      await signAndExecuteTransaction(
        { transaction: txb, chain: 'sui:testnet' },
        {
          onSuccess: (result: SuiTransactionBlockResponse) => {
            console.log('Transfer successful', result);
            showNotification('success', `Vault successfully transferred to ${transferRecipient.substring(0,10)}...`);
            setIsTransferModalOpen(false);
            setTransferRecipient('');
            // Navigate away as the user no longer owns this vault
            navigate('/dashboard');
          },
          onError: (error: Error | unknown) => {
            console.error('Transfer failed', error);
            const message = error instanceof Error ? error.message : "Transfer transaction failed.";
            showNotification('error', message);
          }
        }
      );
    } catch (error) {
      console.error("Error preparing transfer transaction:", error);
      const message = error instanceof Error ? error.message : "Could not prepare transfer.";
      showNotification('error', message);
    } finally {
      setIsProcessingLocalTx(false);
    }
  };

  const handleRebalance = async () => {
    if (!currentAccount?.address || !vaultDetails) {
      showNotification('error', 'Cannot rebalance: Missing vault details or wallet connection.');
      return;
    }
    if (vaultDetails.policy.derivedTypeString !== 'Manual') {
      // This case should ideally be prevented by disabling the button, but double-check.
      showNotification('info', 'Rebalance is only available for vaults with a Manual policy.');
      return;
    }

    setIsCalculatingRebalance(true);
    showNotification('info', 'Calculating rebalance plan...');

    try {
      const totalPortfolioValueUsd = parseFloat(vaultDetails.displayTotalValue);
      if (isNaN(totalPortfolioValueUsd) || totalPortfolioValueUsd < 0) { // allow 0
          showNotification('error', 'Invalid total portfolio value for rebalance calculation.');
          setIsCalculatingRebalance(false);
          return;
      }

      const trades: ProposedTrade[] = [];
      const imbalances: { token: EnrichedVaultToken; imbalanceUsd: number }[] = [];

      // Use the PREFERRED_STABLE_COIN constant
      const stableCoinSymbol = PREFERRED_STABLE_COIN.symbol;
      let stableCoinCoinType = PREFERRED_STABLE_COIN.defaultCoinType;

      const stableApiToken = apiSupportedTokens.find(t => t.symbol.toUpperCase() === stableCoinSymbol.toUpperCase());
      if (stableApiToken) {
        stableCoinCoinType = stableApiToken.coin_type;
      } else {
        console.warn(`Preferred stablecoin ${stableCoinSymbol} not found in apiSupportedTokens. Falling back to defaultCoinType: ${stableCoinCoinType}. Rebalance display might be correct, but execution would fail if this coin type is invalid.`);
        // Optionally, show a notification to the user if the stablecoin is critical and not found
        // showNotification('warning', `Configuration issue: ${stableCoinSymbol} details not found.`);
      }

      for (const token of vaultDetails.tokens) {
        const targetWeightBps = token.weightBps || 0;
        const currentValueUsd = token.usdValue;
        const targetValueUsd = (totalPortfolioValueUsd * targetWeightBps) / 10000;
        const imbalanceUsd = currentValueUsd - targetValueUsd;

        // Only consider imbalances greater than a small threshold (e.g., $0.01)
        if (Math.abs(imbalanceUsd) > 0.01) {
          imbalances.push({ token, imbalanceUsd });
        }
      }

      // Iterate through all calculated imbalances to generate trades.
      // The stablecoin acts as the intermediary.
      for (const { token, imbalanceUsd } of imbalances) {
        // If the current token in the imbalance list is the stablecoin itself,
        // its imbalance is implicitly addressed by other assets being sold for it or bought with it.
        if (token.symbol.toUpperCase() === PREFERRED_STABLE_COIN.symbol.toUpperCase()) {
          continue;
        }

        // Ensure the token has a valid price for calculation
        if (!token.price || token.price <= 0) {
          console.warn(`Token ${token.symbol} has a zero or invalid price ($${token.price}), skipping rebalance trade generation for it.`);
          continue;
        }

        const tradeUsdValue = parseFloat(Math.abs(imbalanceUsd).toFixed(2));
        const tokenAmountToTrade = parseFloat((tradeUsdValue / token.price).toFixed(token.decimals));

        if (imbalanceUsd > 0) { // Token is overweight (and it's not the stablecoin) -> SELL
          trades.push({
            action: 'SELL',
            tradedTokenSymbol: token.symbol,
            tradedTokenCoinType: token.coinType,
            tradedTokenAmount: tokenAmountToTrade,
            tradedTokenDecimals: token.decimals,
            counterAssetSymbol: PREFERRED_STABLE_COIN.symbol,
            counterAssetCoinType: stableCoinCoinType, // Derived earlier in the function
            equivalentValueUsd: tradeUsdValue,
          });
        } else if (imbalanceUsd < 0) { // Token is underweight (and it's not the stablecoin) -> BUY
          trades.push({
            action: 'BUY',
            tradedTokenSymbol: token.symbol,
            tradedTokenCoinType: token.coinType,
            tradedTokenAmount: tokenAmountToTrade,
            tradedTokenDecimals: token.decimals,
            counterAssetSymbol: PREFERRED_STABLE_COIN.symbol,
            counterAssetCoinType: stableCoinCoinType, // Derived earlier in the function
            equivalentValueUsd: tradeUsdValue,
          });
        }
      }

      // Sort trades: SELL orders first, then BUY orders
      trades.sort((a, b) => {
        if (a.action === 'SELL' && b.action === 'BUY') {
          return -1; // a (SELL) comes before b (BUY)
        }
        if (a.action === 'BUY' && b.action === 'SELL') {
          return 1; // b (SELL) comes before a (BUY)
        }
        // Optional: secondary sort by USD value (e.g., largest SELLs first, smallest BUYs first)
        // if (a.action === 'SELL') return b.equivalentValueUsd - a.equivalentValueUsd; // Largest SELLs first
        // if (a.action === 'BUY') return a.equivalentValueUsd - b.equivalentValueUsd; // Smallest BUYs first
        return 0; // Keep original order if actions are the same and no secondary sort
      });

      // After generating and sorting trades, check conditions for notifications
      if (imbalances.length === 0) {
        // This means all assets were within the $0.01 threshold initially.
        showNotification('success', 'Portfolio already balanced. No trades needed.');
      } else if (trades.length === 0 && imbalances.length > 0) {
        // This can happen if the *only* imbalanced asset was the stablecoin itself (which we skip for trade generation),
        // or if all non-stablecoin imbalances were too small to generate a trade.
        showNotification('success', 'Portfolio is effectively balanced. Any minor deviations are within tolerance or involve only the stablecoin reserve.');
      } else if (trades.length > 0) {
        setProposedTrades(trades);
        setIsRebalanceModalOpen(true); // This will trigger the modal display
        // FR4.1 states: "Upon successful calculation, the system shall trigger a visual, non-blocking notification on the user interface containing the exact text: "Rebalancing Triggered"."
        // However, the user's latest instruction is: "On "Execute" button click we show them a success notification - "Rebalance initiated""
        // So, no notification here. The modal itself is the output.
      }

    } catch (error) {
      console.error("Error during rebalance calculation:", error);
      const message = error instanceof Error ? error.message : "Could not calculate rebalance plan.";
      showNotification('error', message);
    } finally {
      setIsCalculatingRebalance(false);
    }
  };


  if (isLoading) {
    return <div className="container mx-auto px-4 py-8 max-w-3xl text-center"><div className="p-16 text-gray-500">Loading vault details...</div></div>;
  }

  if (!currentAccount) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-3xl text-center">
        <div className="bg-white rounded-xl shadow-md border border-gray-100 p-12 mt-8">
          <h2 className="text-2xl font-bold mb-4">Please connect your wallet</h2>
          <p className="mb-6 text-gray-600">Connect your wallet to view vault details.</p>
          <ConnectButton />
        </div>
      </div>
    );
  }

  if (!vaultDetails) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-3xl text-center">
         <header className="flex justify-between items-center mb-12 bg-gradient-to-r from-white via-blue-50 to-white p-4 rounded-2xl shadow-sm">
          <Link to="/" className="transition-all duration-300 hover:opacity-80 flex items-center">
            <img src={siteLogo} alt="Vaultron Logo" className="h-10 sm:h-12" />
          </Link>
          <ConnectButton />
        </header>
        <div className="bg-white rounded-xl shadow-md border border-gray-100 p-12 mt-8">
          <h2 className="text-2xl font-bold mb-4">Vault Not Found</h2>
          <p className="mb-6 text-gray-600">The requested vault could not be loaded or you may not have access.</p>
          <Link to="/dashboard" className="text-blue-600 hover:text-blue-800 font-medium py-2 px-4 rounded-lg border border-blue-600 hover:bg-blue-50 transition">
            &larr; Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const openWithdrawModal = (token: EnrichedVaultToken) => {
    setSelectedTokenForWithdrawal(token);
    setWithdrawAmount('');
    setIsWithdrawModalOpen(true);
  };

  const isProcessingAnything = isProcessingLocalTx || isSignAndExecutePending || isCalculatingRebalance;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <header className="flex justify-between items-center mb-12 bg-gradient-to-r from-white via-blue-50 to-white p-4 rounded-2xl shadow-sm">
        <Link to="/" className="transition-all duration-300 hover:opacity-80 flex items-center">
            <img src={siteLogo} alt="Vaultron Logo" className="h-10 sm:h-12 mr-2" />
            <span className="text-xl font-semibold text-gray-700">Vault Details</span>
        </Link>
        <ConnectButton />
      </header>

      {notification && (
         <div className={`fixed top-5 right-5 p-4 rounded-lg shadow-lg z-[100] flex items-center
         ${notification.type === 'success' ? 'bg-gradient-to-r from-green-50 to-green-100 text-green-800 border-l-4 border-green-500' :
           notification.type === 'error' ? 'bg-gradient-to-r from-red-50 to-red-100 text-red-800 border-l-4 border-red-500' :
           'bg-gradient-to-r from-blue-50 to-blue-100 text-blue-800 border-l-4 border-blue-500'}
         transform transition-all duration-300 ease-in-out animate-fade-in-slide`}>
         <span className={`mr-2 text-lg flex items-center justify-center w-7 h-7 rounded-full
           ${notification.type === 'success' ? 'bg-green-200 text-green-600' :
             notification.type === 'error' ? 'bg-red-200 text-red-600' :
             'bg-blue-200 text-blue-600'}`}>
           {notification.type === 'success' ? '✓' : notification.type === 'error' ? '✗' : 'ℹ'}
         </span>
         <span className="font-medium">{notification.message}</span>
         <button className="ml-4 text-gray-500 hover:text-gray-700 transition-colors duration-200"
           onClick={() => setNotification(null)}
           aria-label="Close notification">×</button>
       </div>
      )}

      <div className="mb-6">
        <Link to="/dashboard" className="inline-flex items-center text-blue-600 hover:text-blue-800 transition-colors duration-200 group">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          Back to Dashboard
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        {/* Vault Header */}
        <div className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-200">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-1">{vaultDetails.name}</h1>
              <p className="text-sm text-gray-500 font-mono bg-gray-100 px-2 py-0.5 rounded inline-block" title={vaultDetails.id}>
                ID: {vaultDetails.id.substring(0,12)}...{vaultDetails.id.substring(vaultDetails.id.length - 8)}
              </p>
            </div>
            <div className="mt-4 sm:mt-0 text-right">
              <p className="text-sm text-gray-600">Total Value</p>
              <p className="text-3xl font-bold text-indigo-600">${vaultDetails.displayTotalValue}</p>
            </div>
          </div>
        </div>

        {/* Vault Info Grid */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gray-50 p-4 rounded-lg shadow-sm border border-gray-100">
            <h3 className="text-xs text-gray-500 uppercase font-semibold mb-1">Policy</h3>
            <p className="text-lg font-medium text-gray-800">{vaultDetails.policyDisplay}</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg shadow-sm border border-gray-100">
            <h3 className="text-xs text-gray-500 uppercase font-semibold mb-1">Last Rebalance</h3>
            <p className="text-lg font-medium text-gray-800">{vaultDetails.displayLastRebalance}</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg shadow-sm border border-gray-100">
            <h3 className="text-xs text-gray-500 uppercase font-semibold mb-1">Asset Count</h3>
            <p className="text-lg font-medium text-gray-800">{vaultDetails.tokens.length} Tokens</p>
          </div>
        </div>

        {/* Asset Allocation Table */}
        <div className="px-6 pb-6">
          <h2 className="text-xl font-semibold text-gray-700 mb-4">Asset Allocation</h2>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Asset</th>
                  <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Balance</th>
                  <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Price</th>
                  <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Value (USD)</th>
                  <th scope="col" className={`px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider ${portfolioWeightsDisturbed ? 'text-yellow-600' : 'text-gray-500'}`}>Target Weight</th>
                  {portfolioWeightsDisturbed && (
                    <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-green-600 uppercase tracking-wider">Actual Weight</th>
                  )}
                  <th scope="col" className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {vaultDetails.tokens.map(token => {
                  const actualWeightBps = portfolioWeightsDisturbed && parseFloat(vaultDetails.displayTotalValue) > 0
                    ? (token.usdValue / parseFloat(vaultDetails.displayTotalValue)) * 10000
                    : token.weightBps; // Default to target if not disturbed or no total value

                  return (
                    <tr key={token.coinType} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center">
                          {token.logo?.startsWith('http') || token.logo?.startsWith('/')
                            ? <img src={token.logo} alt={token.symbol} className="w-7 h-7 rounded-full object-cover border border-gray-200 mr-2.5 shadow-sm" />
                            : <span className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 text-md mr-2.5 shadow-sm border border-gray-200">{token.logo}</span>
                          }
                          <div>
                            <div className="text-sm font-medium text-gray-900">{token.symbol}</div>
                            <div className="text-xs text-gray-500 truncate max-w-[150px] sm:max-w-[200px]" title={token.coinType}>{token.coinType.split('::')[2]}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 text-right">{token.amountNum.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits: Math.min(6, token.decimals)})}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 text-right">${token.price.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits: 2})}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-800 font-medium text-right">${token.usdValue.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits: 2})}</td>
                      <td className={`px-4 py-3 whitespace-nowrap text-sm text-right ${portfolioWeightsDisturbed ? 'text-yellow-700 font-medium' : 'text-gray-700'}`}>{(token.weightBps / 100).toFixed(1)}%</td>
                      {portfolioWeightsDisturbed && (
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-green-700 font-medium text-right">{(actualWeightBps / 100).toFixed(1)}%</td>
                      )}
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                        <button
                          onClick={() => openWithdrawModal(token)}
                          disabled={isProcessingAnything || token.amountNum === 0}
                          className="text-blue-600 hover:text-blue-800 font-medium text-xs px-2.5 py-1 rounded-md bg-blue-50 hover:bg-blue-100 border border-blue-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Withdraw
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Actions Section */}
        <div className="p-6 bg-gray-50 border-t border-gray-200">
          <h2 className="text-xl font-semibold text-gray-700 mb-4">Manage Vault</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => setIsTransferModalOpen(true)}
              disabled={isProcessingAnything}
              className="w-full flex items-center justify-center text-white bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 font-medium py-3 px-5 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 disabled:opacity-60"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              Transfer Vault NFT
            </button>
            <button
              onClick={handleRebalance}
              disabled={vaultDetails.policy.derivedTypeString !== 'Manual' || isProcessingAnything}
              className={`w-full flex items-center justify-center text-white bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 font-medium py-3 px-5 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed ${vaultDetails.policy.derivedTypeString === 'Manual' && portfolioWeightsDisturbed && !isProcessingAnything ? 'ring-2 ring-offset-2 ring-yellow-400 animate-pulse' : ''}`}
              title={vaultDetails.policy.derivedTypeString === 'Manual' ? (portfolioWeightsDisturbed ? "Portfolio weights disturbed! Click to rebalance." : "Trigger manual rebalance") : "Rebalancing is automatic or policy is not Manual"}
            >
              {isCalculatingRebalance ? (
                <svg className="animate-spin h-5 w-5 mr-2 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m-15.357-2a8.001 8.001 0 0015.357 2m0 0H15" /></svg>
              )}
              {isCalculatingRebalance ? 'Calculating...' : (vaultDetails.policy.derivedTypeString === 'Manual' ? 'Rebalance Now' : 'Rebalance (Auto)')}
            </button>
          </div>
           {portfolioWeightsDisturbed && vaultDetails && (
            <div className="mt-4 p-3 bg-yellow-100 border border-yellow-300 rounded-md text-yellow-800 text-sm shadow-sm">
                <p className="font-semibold">Attention: Portfolio Weights Disturbed</p>
                <p className="mt-1">
                    {(() => {
                        let disturbanceMessage = "Your portfolio's asset allocation may have deviated from the target weights due to recent activity.";
                        if (vaultDetails.policy.derivedTypeString === 'Manual') {
                            disturbanceMessage += " Please consider rebalancing manually to realign with your targets.";
                        } else if (vaultDetails.policy.derivedTypeString === 'Time-based') {
                            disturbanceMessage += " It will be automatically adjusted at the next scheduled rebalance (details for next rebalance not yet implemented).";
                        } else if (vaultDetails.policy.derivedTypeString === 'Drift-based') {
                            disturbanceMessage += " It will be automatically adjusted if the deviation exceeds the set threshold.";
                        } else {
                            disturbanceMessage += " Please review your vault's policy for rebalancing details.";
                        }
                        return disturbanceMessage;
                    })()}
                </p>
            </div>
           )}
        </div>
      </div>


      {/* Withdraw Modal */}
      {isWithdrawModalOpen && selectedTokenForWithdrawal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex justify-between items-center p-5 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200 rounded-t-xl">
              <h3 className="text-lg font-semibold text-gray-800">Withdraw {selectedTokenForWithdrawal.symbol}</h3>
              <button onClick={() => setIsWithdrawModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100" disabled={isProcessingAnything}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                Available in vault: <span className="font-medium">{selectedTokenForWithdrawal.amountNum.toFixed(Math.min(6, selectedTokenForWithdrawal.decimals))} {selectedTokenForWithdrawal.symbol}</span>
                {selectedTokenForWithdrawal.price > 0 &&
                  <span className="text-xs text-gray-500 ml-2">
                    (approx. {(selectedTokenForWithdrawal.amountNum * selectedTokenForWithdrawal.price).toFixed(2) + ' USD'})
                  </span>
                }
              </p>
              <div>
                <label htmlFor="withdrawAmount" className="block text-sm font-medium text-gray-700 mb-1">Amount to withdraw:</label>
                <div className="relative">
                  <input
                    type="number"
                    id="withdrawAmount"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    min="0"
                    step="any"
                    max={selectedTokenForWithdrawal.amountNum.toString()}
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 shadow-sm text-sm pr-20"
                    placeholder={`0.0 ${selectedTokenForWithdrawal.symbol}`}
                    disabled={isProcessingAnything}
                  />
                  <button
                    onClick={() => setWithdrawAmount(selectedTokenForWithdrawal.amountNum.toFixed(selectedTokenForWithdrawal.decimals))}
                    className="absolute right-1 top-1/2 transform -translate-y-1/2 text-xs text-blue-600 hover:text-blue-800 font-medium bg-blue-100 hover:bg-blue-200 px-2.5 py-1.5 rounded-md"
                    disabled={isProcessingAnything}
                  >
                    Max
                  </button>
                </div>
                 {parseFloat(withdrawAmount) > selectedTokenForWithdrawal.amountNum && <p className="text-xs text-red-500 mt-1">Amount exceeds balance in vault.</p>}
                 {selectedTokenForWithdrawal.price > 0 && withdrawAmount && parseFloat(withdrawAmount) > 0 &&
                  <p className="text-xs text-gray-500 mt-1">
                    Approx. Value: <span className="font-medium">{(parseFloat(withdrawAmount) * selectedTokenForWithdrawal.price).toFixed(2) + ' USD'}</span>
                  </p>
                }
              </div>
            </div>
            <div className="p-5 bg-gray-50 border-t border-gray-200 rounded-b-xl flex justify-end space-x-3">
              <button onClick={() => setIsWithdrawModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50" disabled={isProcessingAnything}>
                Cancel
              </button>
              <button
                onClick={handleWithdraw}
                disabled={isProcessingAnything || !withdrawAmount || parseFloat(withdrawAmount) <= 0 || parseFloat(withdrawAmount) > selectedTokenForWithdrawal.amountNum}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 flex items-center"
              >
                {isProcessingAnything && <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"></circle><path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" className="opacity-75"></path></svg>}
                {isProcessingAnything ? 'Processing...' : 'Confirm Withdraw'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex justify-between items-center p-5 bg-gradient-to-r from-purple-50 to-pink-50 border-b border-gray-200 rounded-t-xl">
              <h3 className="text-lg font-semibold text-gray-800">Transfer Vault NFT</h3>
              <button onClick={() => setIsTransferModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100" disabled={isProcessingAnything}>
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                You are about to transfer the entire vault <span className="font-medium">{vaultDetails.name}</span> (ID: {vaultDetails.id.substring(0,6)}...) including all its assets. This action is irreversible.
              </p>
              <div>
                <label htmlFor="transferRecipient" className="block text-sm font-medium text-gray-700 mb-1">Recipient SUI Address:</label>
                <input
                  type="text"
                  id="transferRecipient"
                  value={transferRecipient}
                  onChange={(e) => setTransferRecipient(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500 shadow-sm text-sm"
                  placeholder="0x..."
                  disabled={isProcessingAnything}
                />
                 {transferRecipient && !/^0x[a-fA-F0-9]{64}$/.test(transferRecipient.trim()) && <p className="text-xs text-red-500 mt-1">Invalid SUI address format.</p>}
              </div>
            </div>
            <div className="p-5 bg-gray-50 border-t border-gray-200 rounded-b-xl flex justify-end space-x-3">
              <button onClick={() => setIsTransferModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50" disabled={isProcessingAnything}>
                Cancel
              </button>
              <button
                onClick={handleTransfer}
                disabled={isProcessingAnything || !transferRecipient.trim() || !/^0x[a-fA-F0-9]{64}$/.test(transferRecipient.trim())}
                className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg disabled:opacity-50 flex items-center"
              >
                {isProcessingAnything && <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"></circle><path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" className="opacity-75"></path></svg>}
                {isProcessingAnything ? 'Processing...' : 'Confirm Transfer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rebalance Modal Placeholder - to be implemented next */}
      {isRebalanceModalOpen && proposedTrades.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="flex justify-between items-center p-5 bg-gradient-to-r from-teal-50 to-cyan-50 border-b border-gray-200 rounded-t-xl">
              <h3 className="text-lg font-semibold text-gray-800">Proposed Rebalance Trades</h3>
              <button
                onClick={() => {
                  setIsRebalanceModalOpen(false);
                  setProposedTrades([]); // Clear trades when closing
                }}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100"
                // disabled={isExecutingModalRebalance} // Add this if a loading state for execute is added
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              <p className="text-sm text-gray-600">Review the proposed trades to rebalance your portfolio. Clicking "Execute Rebalance" will simulate the action and show a confirmation.</p>
              <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-md">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Token</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Direction</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Counter Asset</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Value (USD)</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {proposedTrades.map((trade, index) => (
                    <tr key={index} className={`hover:bg-gray-50 ${trade.action === 'SELL' ? 'bg-red-50/50' : 'bg-green-50/50'}`}>
                      <td className={`px-3 py-2 whitespace-nowrap text-xs font-medium ${trade.action === 'SELL' ? 'text-red-700' : 'text-green-700'}`}>{trade.action}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-800 font-medium">{trade.tradedTokenSymbol}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 text-right">
                        {trade.tradedTokenAmount.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: Math.max(2, Math.min(8, trade.tradedTokenDecimals)) // Show reasonable precision
                        })}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">{trade.action === 'SELL' ? 'for' : 'with'}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-800 font-medium">{trade.counterAssetSymbol}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-800 text-right font-medium">${trade.equivalentValueUsd.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-5 bg-gray-50 border-t border-gray-200 rounded-b-xl flex justify-end space-x-3">
              <button
                onClick={() => {
                  setIsRebalanceModalOpen(false);
                  setProposedTrades([]);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                // disabled={isExecutingModalRebalance}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // Simulate execution: show notification and close modal
                  showNotification('success', 'Rebalance initiated.');
                  setIsRebalanceModalOpen(false);
                  setProposedTrades([]);
                  // Here, you would typically set a loading state like isExecutingModalRebalance if the "Execute" had an async operation
                }}
                // disabled={isExecutingModalRebalance}
                className="px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg disabled:opacity-50 flex items-center"
              >
                {/* Add spinner here if isExecutingModalRebalance is used */}
                Execute Rebalance
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VaultDetails;
