import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ConnectButton,
  useCurrentAccount,
  useSuiClient,
  useSignAndExecuteTransaction,
} from '@mysten/dapp-kit';
import { getFullnodeUrl, SuiClient, type SuiTransactionBlockResponse } from '@mysten/sui/client';
import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';
import { formatDistanceToNow } from 'date-fns';
import { bcs } from '@mysten/bcs';

import {
  getSupportedTokens,
  getTokenPrices,
  type Token as ApiToken,
  type TokenPrices,
} from '../services/api';
import {
 stringToVectorU8,
 type CoinForDeposit,
 type TokenWeightData,
 getCoinInputObjectsForAmount,
 getVaults,
  type ProcessedVault,
  type ProcessedVaultToken,
  normalizeCoinType
} from '../services/suiService';
import { PORTFOLIO_VAULT_PACKAGE_ID } from '../config';
import siteLogo from '../assets/logo.png'; // Import the logo

// Helper to get a better icon
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

const timeIntervals = [
 { value: '1h', label: 'Hourly' }, { value: '1d', label: 'Daily' }, { value: '7d', label: 'Weekly' },
 { value: '30d', label: 'Monthly' }, { value: '90d', label: 'Quarterly' },
];

type NotificationType = 'success' | 'error' | 'info';
interface Notification { type: NotificationType; message: string; }

interface PolicyConfig {
 type: 'manual' | 'time-based';
 timeInterval?: string;
}

interface WalletToken {
 id: string; coinType: string; name: string; symbol: string;
 balance: string; balanceNum: number;
 price: number; priceNum: number; usdValue: string;
 logo: string; supported: boolean; exceedsBalance: boolean;
 decimals: number; hasBalance: boolean;
 weight: number;
 depositAmount: string;
}

const Dashboard = () => {
  const currentAccount = useCurrentAccount();
  console.log('currentAccount');
  console.log(currentAccount);

  // const { mutate: signAndExecuteTransactionInternal, isPending: isSigningAndExecuting } = useSignAndExecuteTransaction();
  const client = useSuiClient();
  const { mutate: signAndExecuteTransaction, isPending: isSigningAndExecuting } = useSignAndExecuteTransaction({
		execute: async ({ bytes, signature }) =>
			await client.executeTransactionBlock({
				transactionBlock: bytes,
				signature,
				options: {
					// Raw effects are required so the effects can be reported back to the wallet
					showRawEffects: true,
					// Select additional data to return
					showObjectChanges: true,
          // Events
          showEvents: true
				}
			}),
	});
  const navigate = useNavigate();
  const suiClient = useMemo(() => new SuiClient({
    url: getFullnodeUrl('testnet')
  }), []);

  const [apiSupportedTokens, setApiSupportedTokens] = useState<ApiToken[]>([]);
  const [tokenPrices, setTokenPrices] = useState<TokenPrices>({});
  const [walletTokens, setWalletTokens] = useState<WalletToken[]>([]);
  const [isCreateVaultModalOpen, setIsCreateVaultModalOpen] = useState(false);
  const [createVaultStep, setCreateVaultStep] = useState(1);

  const [vaultName, setVaultName] = useState('');
  const [selectedTokens, setSelectedTokens] = useState<WalletToken[]>([]);
  const [totalVaultValue, setTotalVaultValue] = useState(0);
  const [policyConfig, setPolicyConfig] = useState<PolicyConfig>({ type: 'manual' });

  const [notification, setNotification] = useState<Notification | null>(null);
  const [isProcessingVaultCreation, setIsProcessingVaultCreation] = useState(false);

  const [userVaults, setUserVaults] = useState<ProcessedVault[]>([]);
  const [isLoadingVaults, setIsLoadingVaults] = useState<boolean>(true);
  const [vaultCreationCount, setVaultCreationCount] = useState(0);

  const showNotification = useCallback((type: NotificationType, message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  }, []);

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
        console.error("Failed to fetch API data:", error);
        showNotification('error', 'Could not fetch token catalog or prices.');
      }
    };
    fetchApiData();
  }, [showNotification]);

  useEffect(() => {
    const fetchVaultsData = async () => {
      if (!currentAccount?.address) {
        setUserVaults([]);
        setIsLoadingVaults(false);
        return;
      }
      setIsLoadingVaults(true);
      try {
        const fetchedVaults = await getVaults(currentAccount.address);
        setUserVaults(fetchedVaults);
      } catch (error) {
        console.error("Failed to fetch user vaults:", error);
        showNotification('error', 'Could not fetch your vaults. Please try again later.');
        setUserVaults([]);
      }
      setIsLoadingVaults(false);
    };
    fetchVaultsData();
  }, [currentAccount?.address, showNotification, vaultCreationCount]);

  useEffect(() => {
    if (apiSupportedTokens.length > 0 && Object.keys(tokenPrices).length > 0 && currentAccount?.address) {
      const buildTokenList = async () => {
        try {

          const activeApiTokens = apiSupportedTokens.filter(t => t.is_active);
          const userCoinsMap = new Map<string, string>();

          const allUserCoins = await suiClient.getAllCoins({ owner: currentAccount.address });
          console.log('allUserCoins');
          console.log(allUserCoins);
          allUserCoins.data?.forEach(suiCoin => {
            // Normalize the coin type from the chain to ensure consistent map keys.
            // suiCoin.coinType is expected to be in the canonical 3-part form (e.g., 0xPKG::MOD::NAME).
            const keyCoinType = normalizeCoinType(suiCoin.coinType.trim());
            const existingBalance = userCoinsMap.get(keyCoinType) || '0';
            userCoinsMap.set(keyCoinType, (BigInt(existingBalance) + BigInt(suiCoin.balance)).toString());
          });

          const processedTokensPromises = activeApiTokens.map(async (apiToken) => {
            let metadata: { name: string, symbol: string, decimals: number, iconUrl?: string | null } | null = null;

            try {
              // Use the raw apiToken.coin_type for fetching metadata, as that's what the RPC expects.
              metadata = await suiClient.getCoinMetadata({ coinType: apiToken.coin_type });
            } catch (metaError) {
              console.warn(`Metadata fetch failed for ${apiToken.coin_type}:`, metaError);
            }

            // Normalize the coin type from the API token data for map lookup.
            // The userCoinsMap stores keys in a canonical 3-part form (e.g., 0xPKG::MOD::NAME),
            // derived from `suiClient.getAllCoins()`.
            // However, `apiToken.coin_type` (from our backend API) might include additional segments
            // (e.g., `::synthetic` as in 0xPKG::MOD::NAME::synthetic).
            // To ensure a correct lookup, we first truncate `apiToken.coin_type` to its
            // base 3 segments (if it has more), then normalize that.
            const apiCoinTypeParts = apiToken.coin_type.trim().split('::');
            // Take the first 3 parts if available, or fewer if the type string has fewer.
            // This handles cases like "0xPKG::MOD::NAME" and "0xPKG::MOD::NAME::synthetic".
            const baseApiCoinType = apiCoinTypeParts.slice(0, 3).join('::');
            const normalizedLookupKey = normalizeCoinType(baseApiCoinType);

            const decimals = metadata?.decimals ?? apiToken.decimals ?? 9;
            const userBalanceStr = userCoinsMap.get(normalizedLookupKey) || '0';
            const balanceNum = parseFloat(userBalanceStr) / Math.pow(10, decimals);

            const priceInfo = tokenPrices[apiToken.id];
            const priceNum = priceInfo ? parseFloat(priceInfo.price) : 0;
            const logo = getTokenIcon(apiToken.symbol, apiToken.coin_type, metadata?.iconUrl, apiToken.icon);

            return {
              id: apiToken.coin_type, // Keep original coin_type as ID if it's used elsewhere as such
              coinType: apiToken.coin_type, // Store original coin_type
              name: metadata?.name || apiToken.name,
              symbol: metadata?.symbol || apiToken.symbol,
              balance: balanceNum.toFixed(Math.min(6, decimals)),
              balanceNum,
              price: priceNum,
              priceNum,
              usdValue: (balanceNum * priceNum).toFixed(2),
              logo,
              supported: true,
              hasBalance: balanceNum > 0,
              exceedsBalance: false,
              decimals,
              weight: 0,
              depositAmount: '0',
            } as WalletToken;
          });

          const resolvedTokens = await Promise.all(processedTokensPromises);
          resolvedTokens.sort((a, b) => {
            if (a.hasBalance !== b.hasBalance) return a.hasBalance ? -1 : 1;
            const valueA = a.balanceNum * a.priceNum;
            const valueB = b.balanceNum * b.priceNum;
            if (valueB !== valueA) return valueB - valueA;
            return a.name.localeCompare(b.name);
          });
          setWalletTokens(resolvedTokens);
        } catch (error) {
          console.error("Error building token list:", error);
          showNotification('error', "Could not fetch/process wallet balances.");
        }
      };
      buildTokenList();
    } else if (!currentAccount?.address) {
      setWalletTokens([]);
    }
  }, [currentAccount, suiClient, apiSupportedTokens, tokenPrices, showNotification]);

  useEffect(() => {
    const totalVal = selectedTokens.reduce((sum, token) => {
      const amount = parseFloat(token.depositAmount) || 0;
      return sum + (amount * token.priceNum);
    }, 0);
    setTotalVaultValue(totalVal);
  }, [selectedTokens]);

  const resetCreateVaultForm = useCallback(() => {
    setCreateVaultStep(1);
    setVaultName('');
    setSelectedTokens([]);
    setPolicyConfig({ type: 'manual', timeInterval: undefined });
    setIsProcessingVaultCreation(false);
    setTotalVaultValue(0);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsCreateVaultModalOpen(false);
    resetCreateVaultForm();
  }, [resetCreateVaultForm]);

  const handleStep1_Next = () => {
    if (!vaultName.trim()) {
      showNotification('error', 'Vault Name is required.');
      return;
    }
    setCreateVaultStep(2);
  };

  const toggleTokenSelection = (token: WalletToken) => {
    if (!token.supported || !token.hasBalance) {
      console.warn(`Attempted to select token ${token.symbol}, but it's not selectable.`);
      return;
    }
    setSelectedTokens(prev =>
      prev.some(st => st.id === token.id)
        ? prev.filter(st => st.id !== token.id)
        : [...prev, { ...token, weight: 0, depositAmount: '0', exceedsBalance: false }]
    );
  };

  const handleStep2_Next = () => {
    if (selectedTokens.length < 2) {
      showNotification('error', 'Please select at least 2 tokens.');
      return;
    }
    setSelectedTokens(currentSelected => currentSelected.map(t => ({
      ...t,
      depositAmount: t.depositAmount || '0',
      weight: t.weight || 0,
      exceedsBalance: t.exceedsBalance || false,
    })));
    setCreateVaultStep(3);
  };

  const handleDepositAmountChange = (tokenId: string, amountStr: string) => {
    const updatedTokens = selectedTokens.map(token => {
      if (token.id === tokenId) {
        let validatedAmount = amountStr;
        const numAmount = parseFloat(amountStr);
        if (amountStr === "" || amountStr.endsWith(".") || /^\d+\.$/.test(amountStr)) {
          return { ...token, depositAmount: amountStr, exceedsBalance: false };
        }
        if (isNaN(numAmount) || numAmount < 0) validatedAmount = '0';
        const exceeds = !isNaN(numAmount) ? numAmount > token.balanceNum : false;
        return { ...token, depositAmount: validatedAmount, exceedsBalance: exceeds };
      }
      return token;
    });

    const newTotalUsdValue = updatedTokens.reduce((sum, t) => (sum + (parseFloat(t.depositAmount) || 0) * t.priceNum), 0);
    const finalTokensWithWeights = updatedTokens.map(t => {
      const tokenValue = (parseFloat(t.depositAmount) || 0) * t.priceNum;
      const weight = newTotalUsdValue > 0 ? parseFloat(((tokenValue / newTotalUsdValue) * 100).toFixed(1)) : 0;
      return { ...t, weight };
    });

    if (finalTokensWithWeights.length > 0) {
      const currentWeightSum = finalTokensWithWeights.reduce((sum, t) => sum + t.weight, 0);
      const diff = parseFloat((100 - currentWeightSum).toFixed(1));
      if (Math.abs(diff) > 0.05 && finalTokensWithWeights.some(t => t.weight > 0)) {
        const tokenToAdjust = finalTokensWithWeights.find(t => t.weight > 0 && (t.weight + diff >= 0)) || finalTokensWithWeights.find(t => t.weight > 0) || finalTokensWithWeights[0];
        if (tokenToAdjust) {
          const newWeight = parseFloat((tokenToAdjust.weight + diff).toFixed(1));
          tokenToAdjust.weight = Math.max(0, Math.min(100, newWeight));
        }
      }
    }
    if (finalTokensWithWeights.filter(t => t.weight > 0).length === 1) {
      const singleWeightedToken = finalTokensWithWeights.find(t => t.weight > 0);
      if (singleWeightedToken) singleWeightedToken.weight = 100;
    }
    setSelectedTokens(finalTokensWithWeights);
  };

  const handleWeightChange = (tokenId: string, newSliderWeight: number) => {
    let updatedTokens = selectedTokens.map(t => t.id === tokenId ? { ...t, weight: newSliderWeight } : t);
    const changedToken = updatedTokens.find(t => t.id === tokenId)!;
    const otherTokensTotalWeight = updatedTokens.filter(t => t.id !== tokenId).reduce((sum, t) => sum + t.weight, 0);
    const remainingPercentage = 100 - changedToken.weight;

    if (updatedTokens.length > 1) {
      updatedTokens = updatedTokens.map(t => {
        if (t.id === tokenId) return t;
        if (otherTokensTotalWeight === 0 && remainingPercentage > 0) {
          return { ...t, weight: parseFloat((remainingPercentage / (updatedTokens.length - 1)).toFixed(1)) };
        } else if (otherTokensTotalWeight > 0 && remainingPercentage >= 0) {
          return { ...t, weight: parseFloat(((t.weight / otherTokensTotalWeight) * remainingPercentage).toFixed(1)) };
        }
        return { ...t, weight: 0 };
      });
    }

    const currentTotalWeight = updatedTokens.reduce((sum, t) => sum + (t.weight || 0), 0);
    const weightDiff = parseFloat((100 - currentTotalWeight).toFixed(1));
    if (Math.abs(weightDiff) > 0.05 && updatedTokens.length > 0) {
      const tokenToAdjust = updatedTokens.find(t => t.id === tokenId && t.weight + weightDiff >= 0) ||
        updatedTokens.find(t => t.weight > 0 && t.weight + weightDiff >= 0 && t.id !== tokenId) ||
        updatedTokens.find(t => t.weight > 0) || updatedTokens[0];
      if (tokenToAdjust) {
        const adjustedWeight = parseFloat((tokenToAdjust.weight + weightDiff).toFixed(1));
        tokenToAdjust.weight = Math.max(0, Math.min(100, adjustedWeight));
      }
    }
    if (updatedTokens.length === 1 && updatedTokens[0]) updatedTokens[0].weight = 100;
    setSelectedTokens(updatedTokens);
  };

  const distributeUSDValueEvenly = () => {
    const tokensWithAttemptedDeposit = selectedTokens.filter(token => {
      const amount = parseFloat(token.depositAmount);
      return !isNaN(amount) && amount > 0 && token.priceNum > 0 && !token.exceedsBalance;
    });

    if (tokensWithAttemptedDeposit.length === 0) {
      showNotification('info', 'Enter valid deposit amounts for at least one token.'); return;
    }
    const minUsdToEvenOutTo = Math.min(...tokensWithAttemptedDeposit.map(token => (parseFloat(token.depositAmount) || 0) * token.priceNum));
    if (minUsdToEvenOutTo <= 0 || !isFinite(minUsdToEvenOutTo)) {
      showNotification('error', 'Could not determine minimum USD value.'); return;
    }

    let actualTotalPortfolioUsdValue = 0;
    const updatedTokensWithDeposits = selectedTokens.map(token => {
      if (token.priceNum > 0) {
        const idealDepositAmountNum = minUsdToEvenOutTo / token.priceNum;
        const finalDepositAmountNum = Math.min(idealDepositAmountNum, token.balanceNum);
        actualTotalPortfolioUsdValue += finalDepositAmountNum * token.priceNum;
        return { ...token, depositAmount: finalDepositAmountNum.toFixed(Math.min(6, token.decimals)), exceedsBalance: false };
      }
      if (!tokensWithAttemptedDeposit.some(td => td.id === token.id) || token.priceNum <= 0) {
        actualTotalPortfolioUsdValue += (parseFloat(token.depositAmount) || 0) * token.priceNum;
        return { ...token, depositAmount: '0', exceedsBalance: false };
      }
      actualTotalPortfolioUsdValue += (parseFloat(token.depositAmount) || 0) * token.priceNum;
      return { ...token, depositAmount: '0', exceedsBalance: false };
    });

    const finalTokensWithWeightsAfterDistribution = updatedTokensWithDeposits.map(token => {
      const tokenValue = (parseFloat(token.depositAmount) || 0) * token.priceNum;
      const weight = actualTotalPortfolioUsdValue > 0 ? parseFloat(((tokenValue / actualTotalPortfolioUsdValue) * 100).toFixed(1)) : 0;
      return { ...token, weight };
    });

    if (finalTokensWithWeightsAfterDistribution.length > 0) {
      const currentTotalWeight = finalTokensWithWeightsAfterDistribution.reduce((sum, t) => sum + (t.weight || 0), 0);
      const weightDiff = parseFloat((100 - currentTotalWeight).toFixed(1));
      if (Math.abs(weightDiff) > 0.05 && finalTokensWithWeightsAfterDistribution.some(t => t.weight > 0)) {
        const tokenToAdjust = finalTokensWithWeightsAfterDistribution.find(t => t.weight > 0 && (t.weight + weightDiff >= 0)) || finalTokensWithWeightsAfterDistribution.find(t => t.weight > 0) || finalTokensWithWeightsAfterDistribution[0];
        if (tokenToAdjust) {
          const adjustedWeight = parseFloat((tokenToAdjust.weight + weightDiff).toFixed(1));
          tokenToAdjust.weight = Math.max(0, Math.min(100, adjustedWeight));
        }
      }
    }
    if (finalTokensWithWeightsAfterDistribution.filter(t => t.weight > 0).length === 1) {
      const singleWeightedToken = finalTokensWithWeightsAfterDistribution.find(t => t.weight > 0);
      if (singleWeightedToken) singleWeightedToken.weight = 100;
    }
    setSelectedTokens(finalTokensWithWeightsAfterDistribution);
    showNotification('success', 'Deposits and weights adjusted.');
  };

  const handleStep3_Next = () => {
    const tokensWithDeposits = selectedTokens.filter(token => parseFloat(token.depositAmount) > 0);
    if (tokensWithDeposits.length < 2) {
      showNotification('error', 'Deposit for at least two tokens.'); return;
    }
    const totalWeight = selectedTokens.reduce((sum, token) => sum + token.weight, 0);
    if (Math.abs(totalWeight - 100) > 0.5) {
      showNotification('error', 'Weights must sum to 100%.'); return;
    }
    if (selectedTokens.some(t => parseFloat(t.depositAmount) > 0 && t.exceedsBalance)) {
      showNotification('error', 'Deposit exceeds balance.'); return;
    }
    setCreateVaultStep(4);
  };

  const handlePolicyTypeChange = (type: 'manual' | 'time-based') => {
    setPolicyConfig(prev => ({ ...prev, type, timeInterval: type === 'manual' ? undefined : prev.timeInterval }));
  };

  const handleTimeIntervalChange = (interval: string) => {
    setPolicyConfig(prev => ({ ...prev, timeInterval: interval }));
  };

  const handleStep4_Next = () => {
    setCreateVaultStep(5);
  };

  const handleFinalSubmitAllInOne = async () => {
    if (!currentAccount?.address) { showNotification('error', 'Wallet not connected.'); return; }
    if (!vaultName.trim()) { showNotification('error', 'Vault name missing.'); setCreateVaultStep(1); return; }

    const tokensToDepositAndWeight = selectedTokens.filter(t => {
      const depositNum = parseFloat(t.depositAmount);
      return !isNaN(depositNum) && depositNum > 0 && !t.exceedsBalance && t.weight > 0;
    });
    const tokensWithAnyDeposit = selectedTokens.filter(t => {
      const depositNum = parseFloat(t.depositAmount);
      return !isNaN(depositNum) && depositNum > 0 && !t.exceedsBalance;
    });

    if (tokensWithAnyDeposit.length < 2) { showNotification('error', 'At least two assets must have deposits.'); setCreateVaultStep(3); return; }
    if (tokensToDepositAndWeight.length < 2 && tokensWithAnyDeposit.length >=2) {
      showNotification('error', 'At least two assets with deposits must have weights > 0.'); setCreateVaultStep(3); return;
    }
    const totalWeight = selectedTokens.reduce((sum, token) => sum + token.weight, 0);
    if (Math.abs(totalWeight - 100) > 0.5) { showNotification('error', 'Weights must sum to 100%.'); setCreateVaultStep(3); return; }
    if (selectedTokens.some(t => parseFloat(t.depositAmount) > 0 && t.exceedsBalance)) { showNotification('error', 'Deposit exceeds balance.'); setCreateVaultStep(3); return; }

    setIsProcessingVaultCreation(true);
    showNotification('info', 'Processing vault creation...');

    try {
      const txb = new Transaction();
      txb.setSender(currentAccount.address);
      txb.setGasBudget(1000000000); // Consider making this dynamic based on complexity

      // create_vault now returns (Vault object, VaultCap object)
      const [vaultObject, vaultCapObject] = txb.moveCall({
        target: `${PORTFOLIO_VAULT_PACKAGE_ID}::vault::create_vault`,
        arguments: [
          txb.pure(bcs.vector(bcs.u8()).serialize(Array.from(stringToVectorU8(vaultName.trim())))),
        ],
      });

      console.log('[Vault Creation] Result of create_vault call:');
      console.log('[Vault Creation] vaultObject (direct result):', vaultObject);
      console.log('[Vault Creation] vaultCapObject (direct result):', vaultCapObject);

      const coinsToEffectivelyDeposit: CoinForDeposit[] = [];
      for (const token of selectedTokens) {
        const depositAmountNum = parseFloat(token.depositAmount);
        if (!isNaN(depositAmountNum) && depositAmountNum > 0 && !token.exceedsBalance) {
          console.log(`[Vault Creation] Token: ${token.symbol}, User Input Deposit Amount: ${token.depositAmount}, Decimals: ${token.decimals}`);
          const amountBigInt = BigInt(Math.round(depositAmountNum * Math.pow(10, token.decimals)));
          console.log(`[Vault Creation] Token: ${token.symbol}, Calculated BigInt Amount for contract: ${amountBigInt.toString()}`);
          coinsToEffectivelyDeposit.push({
            coinType: token.coinType,
            amount: amountBigInt,
            decimals: token.decimals,
          });
        }
      }

      for (const coinToDeposit of coinsToEffectivelyDeposit) {
        if (coinToDeposit.amount === BigInt(0)) continue;
        console.log(`[Vault Creation] Processing deposit for ${coinToDeposit.coinType}, Amount: ${coinToDeposit.amount.toString()}`);

        const { objectIds: coinObjectIdsToUse, totalBalance: balanceAvailableFromSelectedCoins } = await getCoinInputObjectsForAmount(
          suiClient,
          currentAccount.address,
          coinToDeposit.coinType,
          coinToDeposit.amount
        );

        const coinInputsPTB = coinObjectIdsToUse.map(id => txb.object(id));
        if (coinInputsPTB.length === 0) throw new Error(`No coin objects for ${coinToDeposit.coinType}`);

        const primaryCoinPTB = coinInputsPTB[0];
        if (coinInputsPTB.length > 1) {
          txb.mergeCoins(primaryCoinPTB, coinInputsPTB.slice(1) as TransactionObjectArgument[]);
        }

        let coinToDepositArg: TransactionObjectArgument;
        if (balanceAvailableFromSelectedCoins > coinToDeposit.amount) {
          console.log(`[Vault Creation] Token: ${coinToDeposit.coinType}, Splitting coin. Input total: ${balanceAvailableFromSelectedCoins}, Deposit amount: ${coinToDeposit.amount}`);
          const [splitCoin] = txb.splitCoins(primaryCoinPTB, [txb.pure.u64(coinToDeposit.amount)]);
          coinToDepositArg = splitCoin;
        } else {
          console.log(`[Vault Creation] Token: ${coinToDeposit.coinType}, Not splitting. Input total: ${balanceAvailableFromSelectedCoins}, Deposit amount: ${coinToDeposit.amount}`);
          coinToDepositArg = primaryCoinPTB;
        }

        // Pass the actual vaultCapObject and vaultObject obtained from create_vault
        txb.moveCall({
          target: `${PORTFOLIO_VAULT_PACKAGE_ID}::vault::deposit_coin`,
          arguments: [vaultCapObject, vaultObject, coinToDepositArg], // <-- CORRECTED: Use the direct results
          typeArguments: [coinToDeposit.coinType],
        });
      }

      const tokenWeightsForContract: TokenWeightData[] = selectedTokens
        .filter(t => t.weight > 0)
        .map(t => ({
          coinType: t.coinType,
          weightBps: Math.round(t.weight * 100),
        }));

      if (tokenWeightsForContract.length > 0) {
        txb.moveCall({
          target: `${PORTFOLIO_VAULT_PACKAGE_ID}::vault::set_token_weights`,
          arguments: [
            vaultCapObject, vaultObject, // <-- CORRECTED: Use the direct results
            txb.pure(bcs.vector(bcs.vector(bcs.u8())).serialize(tokenWeightsForContract.map(tw => Array.from(stringToVectorU8(tw.coinType))))),
            txb.pure(bcs.vector(bcs.u16()).serialize(tokenWeightsForContract.map(tw => tw.weightBps))),
          ],
        });
      }

      const REBALANCE_TYPE_MANUAL_ON_CONTRACT = 0;
      const REBALANCE_TYPE_TIME_BASED_ON_CONTRACT = 1;

      let rebalanceTypeArg: number;
      let intervalDaysArg: bigint = BigInt(0);
      const thresholdBpsArg: number = 0;

      if (policyConfig.type === 'manual') {
        rebalanceTypeArg = REBALANCE_TYPE_MANUAL_ON_CONTRACT;
      } else if (policyConfig.type === 'time-based') {
        rebalanceTypeArg = REBALANCE_TYPE_TIME_BASED_ON_CONTRACT;
        if (!policyConfig.timeInterval) {
          showNotification('error', 'Time interval is required for time-based policy.');
          setIsProcessingVaultCreation(false); return;
        }
        const match = policyConfig.timeInterval.match(/^(\d+)[dD]$/);
        if (!match) {
          showNotification('error', 'Invalid time interval format. Expected format like "7d".');
          setIsProcessingVaultCreation(false); return;
        }
        const days = parseInt(match[1]);
        if (days <= 0) {
          showNotification('error', 'Time interval must be a positive number of days.');
          setIsProcessingVaultCreation(false); return;
        }
        intervalDaysArg = BigInt(days);
      } else {
        console.error("Unsupported policy type in handleFinalSubmitAllInOne:", policyConfig.type);
        showNotification('error', 'An unsupported policy type was selected. Please refresh and try again.');
        setIsProcessingVaultCreation(false); return;
      }

      txb.moveCall({
        target: `${PORTFOLIO_VAULT_PACKAGE_ID}::vault::set_policy`,
        arguments: [
          vaultCapObject,
          vaultObject, // <-- CORRECTED: Use the direct results
          txb.pure.u8(rebalanceTypeArg),
          txb.pure.u64(intervalDaysArg),
          txb.pure.u16(thresholdBpsArg),
        ],
      });

      // Finally, transfer the created Vault and VaultCap to the sender's address
      txb.transferObjects([vaultObject, vaultCapObject], txb.pure.address(currentAccount.address));

      signAndExecuteTransaction(
        {
          transaction: txb,
          chain: 'sui:testnet',
        },
        {
          onSuccess: (result: SuiTransactionBlockResponse) => {
            // The transaction was successful if this callback is executed.
            // No need to check for result.effects.status.status again.
            console.log('SUCCESS_RESULT', result);

            let finalVaultId: string | undefined;
            const txDigest = result.digest;

            // Find the vault ID from the events
            const vaultCreatedEvent = result.events?.find(
              (e) => e?.type?.endsWith('::vault::VaultCreated')
            );
            if (vaultCreatedEvent?.parsedJson && typeof vaultCreatedEvent.parsedJson === 'object') {
              const parsed = vaultCreatedEvent.parsedJson as { vault_id?: string };
              finalVaultId = parsed.vault_id;
            }

            // Display success notifications
            showNotification('success', `Vault "${vaultName}" created! ${finalVaultId ? `ID: ${finalVaultId.substring(0, 10)}...` : ''}`);
            showNotification('success', `digest: ${txDigest}`);

            // Update UI state
            setVaultCreationCount(count => count + 1);
            handleCloseModal();

            setIsProcessingVaultCreation(false);
          },
          onError: (error: Error | unknown) => {
            // All transaction failures will be caught here.
            console.error('ERROR during transaction execution:', error);

            let message = "An unexpected error occurred. Please try again.";
            if (error instanceof Error) {
              // This will now correctly show the detailed error message from the wallet/RPC
              message = error.message;
            } else if (typeof error === 'string') {
              message = error;
            } else if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
              message = error.message;
            }

            showNotification('error', `Vault creation failed: ${message}`);
            setIsProcessingVaultCreation(false);
          }
        }
      );

    } catch (error: unknown) {
      console.error("Synchronous error in final vault submission process:", error);
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      showNotification('error', `Vault creation process error: ${message}`);
      setIsProcessingVaultCreation(false);
    }
  };

  const navigateToVault = (vaultId: string) => navigate(`/vault/${vaultId}`);

    const progressSteps = [
      { s: 1, l: "Name" }, { s: 2, l: "Select Assets" }, { s: 3, l: "Make Allocations" }, { s: 4, l: "Set Policy" }, { s: 5, l: "Review" }
    ];

  const enrichedUserVaults = useMemo(() => {
    if (!apiSupportedTokens.length || !Object.keys(tokenPrices).length) {
      return userVaults.map(vault => ({
        ...vault,
        tokens: vault.tokens.map((token: ProcessedVaultToken) => ({
          ...token,
          symbol: token.coinType.split('::').pop()?.toUpperCase() || 'UNK',
          decimals: 9,
          price: 0,
          usdValue: 0,
          weight: token.weightBps / 100,
        })),
        displayTotalValue: '0.00',
        displayLastRebalance: vault.lastUpdatedAt ? formatDistanceToNow(new Date(vault.lastUpdatedAt), { addSuffix: true }) : 'N/A',
        policyDisplay: `${vault.policy.derivedTypeString}${vault.policy.derivedTypeString === 'Time-based' && vault.policy.rebalanceIntervalDays > 0 ? ` (${vault.policy.rebalanceIntervalDays}d)` : ''}`
      }));
    }
    return userVaults.map(vault => {
      let calculatedTotalValue = 0;
      const enrichedTokens = vault.tokens.map((token: ProcessedVaultToken) => {
        const apiTokenInfo = apiSupportedTokens.find(apt => apt.coin_type === token.coinType);
        const priceInfo = apiTokenInfo ? tokenPrices[apiTokenInfo.id] : undefined;
        const decimals = apiTokenInfo?.decimals ?? 9;
        const price = priceInfo ? parseFloat(priceInfo.price) : 0;
        const amountBigInt = BigInt(token.amount || '0');
        const amountNum = Number(amountBigInt) / Math.pow(10, decimals);
        const usdValue = amountNum * price;
        calculatedTotalValue += usdValue;
        return {
          ...token,
          symbol: apiTokenInfo?.symbol || token.coinType.split('::').pop()?.toUpperCase() || 'UNK',
          decimals,
          price,
          amountNum,
          usdValue,
          weight: token.weightBps / 100,
        };
      });
      return {
        ...vault,
        tokens: enrichedTokens,
        displayTotalValue: calculatedTotalValue.toFixed(2),
        displayLastRebalance: vault.lastUpdatedAt ? formatDistanceToNow(new Date(vault.lastUpdatedAt), { addSuffix: true }) : 'N/A',
        policyDisplay: `${vault.policy.derivedTypeString}${vault.policy.derivedTypeString === 'Time-based' && vault.policy.rebalanceIntervalDays > 0 ? ` (${vault.policy.rebalanceIntervalDays}d)` : ''}`
      };
    });
  }, [userVaults, apiSupportedTokens, tokenPrices]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <header className="flex justify-between items-center mb-12 bg-gradient-to-r from-white via-blue-50 to-white p-4 rounded-2xl shadow-sm">
        <div className="transition-all duration-300 hover:opacity-80 flex items-center">
          <img src={siteLogo} alt="Vaultron Logo" className="h-10 sm:h-12" />
          {/* <p className="text-sm text-gray-500 mt-1 pl-1">Portfolio-as-NFT Protocol</p> */}
        </div>
        {currentAccount && <ConnectButton />}
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

      {!currentAccount ? (
        <div className="bg-white rounded-xl shadow-md border border-gray-100 p-12 text-center mt-8 bg-gradient-to-b from-white to-blue-50 transform transition-all duration-300">
          <div className="inline-block p-4 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full mb-8 shadow-lg transition-transform duration-300 hover:rotate-12">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
          </div>
          <h2 className="text-4xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-600">Welcome to Vaultron</h2>
          <p className="mb-8 text-gray-600 max-w-md mx-auto text-lg leading-relaxed">Bundle multiple tokens into a single NFT. Transfer entire portfolios atomically.</p>
          <div className="transition-transform hover:scale-105 duration-200"><ConnectButton /></div>
        </div>
      ) : (
        <section>
          <div className="flex justify-end mb-8">
            <button onClick={() => setIsCreateVaultModalOpen(true)} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium py-2.5 px-5 rounded-lg transition-all duration-200 hover:shadow-md transform hover:-translate-y-0.5">
              <div className="flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                Create Vault
              </div>
            </button>
          </div>
          <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden transform transition-all duration-300">
            {isLoadingVaults ? (
              <div className="p-16 text-center text-gray-500">Loading vaults...</div>
            ) : enrichedUserVaults.length > 0 ? (
              <div>
                <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100"><p className="text-sm text-blue-800 font-medium">Each vault is an NFT containing multiple tokens.</p></div>
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50"><tr><th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Vault</th><th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Allocation</th><th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Value</th><th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Policy</th><th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Last Updated</th></tr></thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {enrichedUserVaults.map((vault) => (
                      <tr key={vault.id} className="hover:bg-gradient-to-r hover:from-blue-50 hover:to-transparent cursor-pointer transition-colors duration-200" onClick={() => navigateToVault(vault.id)}>
                        <td className="px-6 py-4"><div className="font-medium text-gray-900">{vault.name}</div><div className="text-sm text-gray-500 truncate max-w-xs" title={vault.id}><code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{vault.id.substring(0,12)}...</code></div></td>
                        <td className="px-6 py-4"><div className="space-y-2">{vault.tokens.filter(t => t.weightBps > 0).map(token => (<div key={`${vault.id}-${token.coinType}`} className="flex items-center justify-between max-w-[150px] bg-gray-50 rounded-full px-3 py-1 text-sm"><span className="text-gray-600 font-medium">{token.symbol}</span><span className="text-gray-900 font-semibold bg-white px-1.5 py-0.5 rounded-full text-xs shadow-sm border border-gray-100">{token.weight}%</span></div>))}</div></td>
                        <td className="px-6 py-4 font-semibold text-gray-900">${vault.displayTotalValue}</td>
                        <td className="px-6 py-4"><span className={`px-3 py-1.5 text-xs font-medium rounded-full ${vault.policy.derivedTypeString === 'Manual' ? 'bg-gradient-to-r from-blue-100 to-blue-50 text-blue-800 border border-blue-200' : 'bg-gradient-to-r from-green-100 to-green-50 text-green-800 border border-green-200'}`}>{vault.policyDisplay}</span></td>
                        <td className="px-6 py-4 text-sm text-gray-500">{'NA'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-16 text-center">
                <div className="flex justify-center"><div className="text-7xl mb-6 bg-gradient-to-r from-blue-100 to-purple-100 p-8 rounded-full inline-block shadow-inner transition-transform duration-300 hover:scale-105">🏦</div></div>
                <h3 className="text-2xl font-semibold mb-4 text-gray-700 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">No Vaults Yet</h3>
                <p className="text-gray-500 mb-8 max-w-md mx-auto">Create your first vault to bundle tokens.</p>
                <button onClick={() => setIsCreateVaultModalOpen(true)} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium py-3 px-8 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-1">Create Your First Vault</button>
              </div>
            )}
          </div>
        </section>
      )}

      {isCreateVaultModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 backdrop-blur-sm transition-all duration-300 animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-gray-200">
            <div className="flex justify-between items-center p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200 rounded-t-xl">
              <h2 className="text-2xl font-semibold bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-indigo-600">Create New Vault</h2>
              <button onClick={handleCloseModal} className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100 transition-colors duration-200" disabled={isProcessingVaultCreation || isSigningAndExecuting}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex px-6 pt-6 pb-4 text-xs sm:text-sm">
              {progressSteps.map(item => (
                <div key={item.s} className={`flex-1 text-center pb-3 relative ${createVaultStep >= item.s ? 'text-blue-600 font-semibold' : 'text-gray-400'}`}>
                  <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${createVaultStep >= item.s ? 'bg-blue-600' : 'bg-gray-300'} transform transition-all duration-300`}></div>
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs mb-1 shadow-sm border ${createVaultStep >= item.s ? 'bg-blue-600 text-white border-blue-700' : 'bg-gray-100 text-gray-500 border-gray-300'} mr-1 transition-all duration-300`}>{item.s}</span>
                  <span className="transition-all duration-200 text-xs">{item.l}</span>
                </div>
              ))}
            </div>

            <div className="p-8 overflow-y-auto flex-grow space-y-6">
              {createVaultStep === 1 && (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="vaultName" className="block text-sm font-medium text-gray-700 mb-2">Vault Name</label>
                    <div className="relative">
                      <input type="text" id="vaultName" className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 shadow-sm transition-all duration-200 pl-10" placeholder="My DeFi Vault" value={vaultName} onChange={(e) => setVaultName(e.target.value)} />
                      <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-gray-500 flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      Give your vault a descriptive name.
                    </p>
                  </div>
                </div>
              )}

              {createVaultStep === 2 && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    {walletTokens
                      .filter(t => t.supported)
                      .map(token => {
                        const isSelected = selectedTokens.some(st => st.id === token.id);
                        const disabled = !token.hasBalance;

                        return (
                          <button
                            key={token.id}
                            onClick={() => !disabled && toggleTokenSelection(token)}
                            disabled={disabled}
                            className={[
                              'w-full flex items-center justify-between px-4 py-3 rounded-lg border transition',
                              disabled
                                ? 'bg-gray-50 text-gray-400 cursor-not-allowed'
                                : isSelected
                                ? 'border-blue-500 bg-blue-50/70'
                                : 'border-gray-200 hover:bg-gray-50'
                            ].join(' ')}
                          >
                            <div className="flex items-center gap-3">
                              {token.logo?.startsWith('http') || token.logo?.startsWith('/')
                                ? (
                                  <img
                                    src={token.logo}
                                    alt={token.symbol}
                                    className="w-8 h-8 rounded-full object-cover border border-gray-200"
                                  />
                                )
                                : (
                                  <span className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-lg">
                                    {token.logo}
                                  </span>
                                )}

                              <div className="text-left">
                                <p className="font-medium text-gray-900 leading-none">
                                  {token.symbol}
                                </p>
                                <p className="text-xs text-gray-500 leading-none">
                                  {token.balance} • ${token.usdValue}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {disabled && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600 font-medium">
                                  No Balance
                                </span>
                              )}
                              <input
                                type="checkbox"
                                disabled={disabled}
                                readOnly
                                checked={isSelected}
                                className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                              />
                            </div>
                          </button>
                        );
                      })}
                  </div>

                  {selectedTokens.length > 0 && (
                    <div className="pt-5 mt-5 border-t border-gray-200">
                      <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Selected Assets ({selectedTokens.length})
                      </h4>

                      <div className="flex flex-wrap gap-2.5">
                        {selectedTokens.map(token => (
                          <div
                            key={token.id}
                            className="bg-blue-600 text-white text-xs font-medium pl-3 pr-1.5 py-1.5 rounded-full flex items-center shadow-md group"
                          >
                            {token.logo?.startsWith('http') || token.logo?.startsWith('/')
                              ? (
                                <img src={token.logo} alt="" className="w-4 h-4 mr-1.5 rounded-full object-cover" />
                              )
                              : (
                                <span className="text-sm mr-1.5 -ml-0.5">{token.logo}</span>
                              )}
                            <span>{token.symbol}</span>
                            <button
                              onClick={() => toggleTokenSelection(token)}
                              className="ml-2 text-blue-300 group-hover:text-white hover:bg-blue-500 rounded-full p-0.5"
                              aria-label={`Deselect ${token.symbol}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedTokens.length > 0 && selectedTokens.length < 2 && (
                    <p className="mt-4 text-xs text-red-600 flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      Please select at least 2 assets to proceed.
                    </p>
                  )}
                </div>
              )}

              {createVaultStep === 3 && (
                <div className="space-y-6">
                  {selectedTokens.length < 2 ? (
                    <div className="text-center py-6 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mx-auto text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      <p className="text-xs text-gray-500">Please go back and select at least two tokens.</p>
                    </div>
                  ) : (
                    <div className="max-h-[calc(90vh-450px)] overflow-y-auto border border-gray-200 rounded-lg bg-gray-50 shadow-inner">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-100 sticky top-0 z-10">
                          <tr>
                            <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-600 uppercase">Token</th>
                            <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-600 uppercase">Balance / Price</th>
                            <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-600 uppercase whitespace-nowrap">Deposit Amount</th>
                            <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-600 uppercase whitespace-nowrap">Target Weight (%)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                          {selectedTokens.map(token => (
                            <tr key={token.id} className="hover:bg-gray-50 transition-colors duration-150">
                              <td className="px-3 py-3 align-top">
                                <div className="flex items-center">
                                  {token.logo && (token.logo.startsWith('http') || token.logo.startsWith('/')) ? (
                                    <img src={token.logo} alt={`${token.symbol} logo`} className="w-7 h-7 mr-2.5 rounded-full object-cover border shadow-sm" />
                                  ) : (
                                    <span className="text-xl mr-2.5 w-7 h-7 flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 text-gray-600 rounded-full border shadow-sm">{token.logo || '🪙'}</span>
                                  )}
                                  <div>
                                    <div className="font-medium text-gray-800 text-xs">{token.name}</div>
                                    <div className="text-xs text-gray-500">{token.symbol}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-3 text-xs text-gray-700 align-top">
                                <div className="font-medium">{token.balance} {token.symbol}</div>
                                <div className="text-xs text-gray-500">${token.priceNum.toFixed(2)} / token</div>
                                <div className="text-xs text-blue-600 mt-0.5">Value: ${(parseFloat(token.depositAmount) * token.priceNum).toFixed(2)}</div>
                              </td>
                              <td className="px-3 py-3 align-top w-48">
                                <div className="flex items-center">
                                  <input
                                    type="number"
                                    id={`deposit-${token.id}`}
                                    min="0"
                                    step="any"
                                    value={token.depositAmount}
                                    onChange={(e) => handleDepositAmountChange(token.id, e.target.value)}
                                    className={`w-full p-2 border ${token.exceedsBalance ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300'} rounded-md text-xs shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white`}
                                    placeholder="0.0"
                                  />
                                  <button onClick={() => handleDepositAmountChange(token.id, token.balanceNum.toFixed(token.decimals))} className="ml-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium bg-blue-50 hover:bg-blue-100 px-1.5 py-0.5 rounded whitespace-nowrap">Max</button>
                                </div>
                                {token.exceedsBalance && <p className="mt-1 text-xs text-red-600 flex items-center"><svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>Exceeds balance</p>}
                              </td>
                              <td className="px-3 py-3 align-top w-52">
                                <div className="flex items-center">
                                  <input
                                    type="range"
                                    id={`weight-${token.id}`}
                                    min="0"
                                    max="100"
                                    step="0.1"
                                    value={token.weight}
                                    onChange={(e) => handleWeightChange(token.id, parseFloat(e.target.value))}
                                    className="w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-300"
                                  />
                                  <span className="ml-2 text-xs font-semibold text-gray-800 bg-white px-1.5 py-0.5 rounded-full shadow-sm border border-gray-200 w-12 text-center">
                                    {token.weight.toFixed(1)}%
                                  </span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="mt-6 flex justify-between items-center">
                    <div className="mb-2 flex  bg-gray-50 p-2.5 rounded-lg sticky top-0 z-10 shadow-sm">
                      <div>
                        <span className="text-xs mr-2 text-gray-600">Total Est. Deposit: <strong className="text-blue-700">${totalVaultValue.toFixed(2)}</strong></span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${Math.abs(100 - selectedTokens.reduce((sum, token) => sum + token.weight, 0)) <= 0.5 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-600'}`}>
                          Total Weight: {selectedTokens.reduce((sum, token) => sum + token.weight, 0).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={distributeUSDValueEvenly}
                      className="text-xs bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white font-medium py-2.5 px-5 rounded-lg transition-all duration-200 flex items-center shadow-md hover:shadow-lg transform hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:transform-none"
                      disabled={selectedTokens.filter(t => t.balanceNum > 0 && t.priceNum > 0).length === 0}
                      title={"Distribute deposit value evenly based on the token with the lowest max possible deposit (or entered deposit), adjusting weights accordingly."}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                      Distribute Evenly
                    </button>
                  </div>
                  {Math.abs(selectedTokens.reduce((s, t) => s + t.weight, 0) - 100) > 0.5 && selectedTokens.length > 0 && (
                    <p className="mt-2 text-xs text-red-500 flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      Total weight must be 100%. Current: {selectedTokens.reduce((s, t) => s + t.weight, 0).toFixed(1)}%
                    </p>
                  )}
                </div>
              )}

              {createVaultStep === 4 && (
                <div className="space-y-6">
                  <p className="text-sm text-gray-600">Configure the rebalancing policy for your vault.</p>
                  <div className="space-y-4">
                    <div className={`border rounded-lg p-4 cursor-pointer transition-colors ${policyConfig.type === 'manual' ? 'border-blue-500 bg-blue-50 shadow-md' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`} onClick={() => handlePolicyTypeChange('manual')}>
                      <div className="flex items-start">
                        <input type="radio" name="policyType" id="manualPolicyRadio" checked={policyConfig.type === 'manual'} onChange={() => handlePolicyTypeChange('manual')} className="mt-1 mr-3 h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"/>
                        <div><h5 className="font-medium text-gray-800">Manual Rebalancing</h5><p className="text-sm text-gray-600">You will need to trigger rebalancing actions yourself.</p></div></div></div>
                    <div className={`border rounded-lg p-4 transition-colors opacity-50 cursor-not-allowed ${policyConfig.type === 'time-based' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`} title="Time-based rebalancing is coming soon.">
                      <div className="flex items-start">
                        <input type="radio" name="policyType" id="timebasedPolicyRadio" checked={policyConfig.type === 'time-based'} disabled className="mt-1 mr-3 h-4 w-4 text-gray-400 border-gray-300"/>
                        <div><h5 className="font-medium text-gray-500">Time-based Rebalancing <span className="text-xs text-orange-500">(Coming Soon)</span></h5><p className="text-sm text-gray-500">Rebalance automatically at specified time intervals.</p></div></div>
                        {policyConfig.type === 'time-based' && (
                          <div className="mt-4 pl-8">
                            <label htmlFor="timeIntervalSelect" className="font-medium text-gray-500 mb-2 block text-sm">Rebalance Frequency</label>
                            <select id="timeIntervalSelect" className="w-full p-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-gray-100 cursor-not-allowed text-sm" value={policyConfig.timeInterval || ''} onChange={(e) => handleTimeIntervalChange(e.target.value)} disabled>
                              <option value="" disabled>Select frequency</option>
                              {timeIntervals.map(interval => (<option key={interval.value} value={interval.value}>{interval.label}</option>))}
                            </select>
                          </div>
                        )}
                    </div>
                  </div>
                </div>
              )}

              {createVaultStep === 5 && (
                <div className="space-y-6">
                  <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 space-y-4">
                    <h5 className="font-semibold text-gray-800 text-md">Vault Configuration Summary:</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                      <div><p className="text-gray-500">Vault Name:</p><p className="font-medium text-gray-700 break-words">{vaultName}</p></div>
                      <div><p className="text-gray-500">Total Deposit Value:</p><p className="font-medium text-gray-700">${totalVaultValue.toFixed(2)}</p></div>
                      <div><p className="text-gray-500">Number of Assets:</p><p className="font-medium text-gray-700">{selectedTokens.filter(token => parseFloat(token.depositAmount) > 0).length} tokens</p></div>
                      <div><p className="text-gray-500">Rebalancing Policy:</p><p className="font-medium text-gray-700">{policyConfig.type === 'manual' ? 'Manual' : `Time-based (${policyConfig.timeInterval ? timeIntervals.find(t=>t.value===policyConfig.timeInterval)?.label : 'N/A'})`}</p></div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="text-gray-500 text-sm mb-2">Target Allocations:</p>
                      <ul className="space-y-1 max-h-32 overflow-y-auto text-xs">
                        {selectedTokens.filter(t => t.weight > 0).map(token => (
                          <li key={token.id} className="flex justify-between items-center text-gray-600 py-1">
                            <span className="flex items-center">
                              {token.logo && (token.logo.startsWith('http') || token.logo.startsWith('/')) ? (<img src={token.logo} alt="" className="w-5 h-5 mr-2 rounded-full object-cover" />) : (<span className="text-md mr-2">{token.logo || '🪙'}</span>)}
                              {token.symbol}
                            </span>
                            <span className="font-medium bg-gray-100 px-1.5 py-0.5 rounded-full">{token.weight.toFixed(1)}%</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center p-6 border-t border-gray-200 bg-gradient-to-r from-gray-50 to-white rounded-b-xl">
              <button onClick={() => { if (createVaultStep > 1) setCreateVaultStep(s => s - 1); else handleCloseModal(); }}
                className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200 shadow-sm hover:shadow"
                disabled={isProcessingVaultCreation || isSigningAndExecuting}>
                {createVaultStep === 1 ? 'Cancel' : 'Back'}
              </button>

              {createVaultStep < progressSteps.length && (
                <button onClick={() => {
                  if (createVaultStep === 1) handleStep1_Next();
                  else if (createVaultStep === 2) handleStep2_Next();
                  else if (createVaultStep === 3) handleStep3_Next();
                  else if (createVaultStep === 4) handleStep4_Next();
                }}
                disabled={
                  (createVaultStep === 1 && !vaultName.trim()) ||
                  (createVaultStep === 2 && selectedTokens.length < 2) ||
                  (createVaultStep === 3 && (selectedTokens.filter(t=>parseFloat(t.depositAmount)>0 && !t.exceedsBalance).length < 2 || Math.abs(selectedTokens.reduce((s,t)=>s+t.weight,0)-100) > 0.5 || selectedTokens.some(t=>parseFloat(t.depositAmount)>0 && t.exceedsBalance) )) ||
                  isProcessingVaultCreation || isSigningAndExecuting
                }
                className="px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-lg transition-all duration-200 disabled:opacity-50 shadow-sm hover:shadow transform hover:-translate-y-0.5 disabled:hover:transform-none">
                <div className="flex items-center">Next <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></div>
              </button>
            )}
            {createVaultStep === progressSteps.length && (
              <button onClick={handleFinalSubmitAllInOne}
                disabled={isProcessingVaultCreation || isSigningAndExecuting || !vaultName.trim() || selectedTokens.filter(t => parseFloat(t.depositAmount) > 0 && !t.exceedsBalance && t.weight > 0).length < 2 || Math.abs(selectedTokens.reduce((s, t) => s + t.weight, 0) - 100) > 0.5 || selectedTokens.some(t=>parseFloat(t.depositAmount)>0 && t.exceedsBalance)}
                className="px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 rounded-lg transition-all duration-200 disabled:opacity-50 shadow-sm hover:shadow transform hover:-translate-y-0.5 disabled:hover:transform-none flex items-center">
                {(isProcessingVaultCreation || isSigningAndExecuting) && <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"></circle><path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" className="opacity-75"></path></svg>}
                {(isProcessingVaultCreation || isSigningAndExecuting) ? 'Processing...' : 'Create Vault'}
              </button>
            )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
