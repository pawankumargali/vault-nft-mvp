import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { PORTFOLIO_VAULT_PACKAGE_ID } from '../config';

// Helper to convert string to a Uint8Array (vector<u8> in Move)
export function stringToVectorU8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

// This interface is for data collected by the UI
export interface CreateVaultUIData {
  name: string;
  // Description and iconUrl removed for MVP as per UI change
}

export interface TokenWeightData {
  coinType: string; // Full coin type string, e.g., "0x2::sui::SUI"
  weightBps: number; // Basis points, e.g., 5000 for 50%
}

// This interface is for coin data used in deposit operations
export interface CoinForDeposit {
  coinType: string;
  amount: bigint; // CRITICAL: Use bigint for precision
  decimals: number; // For UI display and potential calculations, not directly for TXB amount
}

// This interface is for policy arguments to the contract
export interface PolicyContractArgs {
  rebalanceIntervalDays: number; // u64 in Move (0 for Manual)
  rebalanceThresholdBps: number; // u16 in Move (0 for Manual)
  rebalanceType: number; // u8 in Move (0 for Manual)
  // policyType might be implicit if set_policy only takes interval,
  // or could be a separate u8 if a different set_policy function is used.
  // The provided contract's set_policy only takes rebalance_interval_days.
}

// Note: Full TransactionBlock constructor functions like `constructCreateVaultTx`
// are less emphasized here as V3 Dashboard will build the single, complex TXB directly.
// These interfaces primarily define data structures.

// If needed, a helper to fetch and prepare coin inputs for deposit within Dashboard.tsx
// This is more of a utility that Dashboard.tsx might use before building its txb.split/merge.
export async function getCoinInputObjectsForAmount(
    suiClient: SuiClient,
    owner: string,
    coinType: string,
    targetAmount: bigint
): Promise<{ objectIds: string[], totalBalance: bigint }> {
    console.log(`[getCoinInputObjectsForAmount] Fetching coins for owner: ${owner}, coinType: ${coinType}, targetAmount: ${targetAmount.toString()}`);
    const coins = await suiClient.getCoins({ owner, coinType });
    console.log(`[getCoinInputObjectsForAmount] Received coins response:`, JSON.stringify(coins, null, 2));

    let collectedBalance = BigInt(0);
    const objectIdsToUse: string[] = [];

    const availableCoinsSorted = coins.data.sort((a, b) => (BigInt(b.balance) < BigInt(a.balance) ? -1 : (BigInt(b.balance) > BigInt(a.balance) ? 1 : 0)));
    console.log(`[getCoinInputObjectsForAmount] Sorted available coins (${availableCoinsSorted.length} found):`, JSON.stringify(availableCoinsSorted, null, 2));

    for (const coinData of availableCoinsSorted) {
        console.log(`[getCoinInputObjectsForAmount] Processing coin object: ${coinData.coinObjectId}, Balance: ${coinData.balance}`);
        objectIdsToUse.push(coinData.coinObjectId);
        collectedBalance += BigInt(coinData.balance);
        console.log(`[getCoinInputObjectsForAmount] Current collectedBalance: ${collectedBalance.toString()}`);
        if (collectedBalance >= targetAmount) {
            console.log(`[getCoinInputObjectsForAmount] Collected enough balance. Breaking loop.`);
            break;
        }
    }

    if (collectedBalance < targetAmount) {
        console.error(`[getCoinInputObjectsForAmount] Insufficient balance for ${coinType}. Needed: ${targetAmount}, Available: ${collectedBalance}`);
        throw new Error(`Insufficient balance for ${coinType}. Needed: ${targetAmount}, Available: ${collectedBalance}`);
    }
    console.log(`[getCoinInputObjectsForAmount] Returning objectIds: [${objectIdsToUse.join(', ')}], totalBalance: ${collectedBalance.toString()}`);
    return { objectIds: objectIdsToUse, totalBalance: collectedBalance };
}


export interface ProcessedVaultToken {
  coinType: string;
  amount: string; // Store as string from BigInt
  weightBps: number; // Weight in basis points (0-10000)
  // Optional fields that will be enriched in the frontend:
  symbol?: string;
  decimals?: number;
  price?: number;
  usdValue?: number;
  amountNum?: number;
}

export interface ProcessedVaultPolicy {
  rebalanceType: number; // 0: Manual, 1: Time-based, 2: Drift-based
  rebalanceIntervalDays: number;
  rebalanceThresholdBps: number;
  // UI-derived type string for convenience
  derivedTypeString?: 'Manual' | 'Time-based' | 'Drift-based' | 'Unknown';
}

export interface ProcessedVault {
    id: string; // Vault Object ID
    name: string;
    creator: string;
    tokens: ProcessedVaultToken[];
    policy: ProcessedVaultPolicy;
    totalValueUsd?: number; // Will be calculated on the frontend
    lastUpdatedAt: string; // ISO string for timestamp
    version: string; // Add version
    capId?: string; // Add capId
}

/* ────────────────────────────── helpers ──────────────────────────────── */

/** Always store a coin type in `0xADDR::module::Name` form */
export const normalizeCoinType = (typeStr: string): string => {
  const parts = typeStr.trim().split('::');
  if (parts.length !== 3) return typeStr.trim();

  let [addr, module, name] = parts;
  if (/^[0-9a-fA-F]+$/.test(addr) && !addr.startsWith('0x')) addr = `0x${addr}`;
  module=module.toString();
  name=name.toString();
  return `${addr}::${module}::${name}`;
};

/** Pull the *aggregated* balances that live inside a `sui::bag::Bag` object */
const loadBalancesFromVaultDynamicFields = async ( // Renamed and adapted
  client: SuiClient,
  vaultId: string,
): Promise<Map<string, string>> => {
  // console.log('Loading balances for vaultId:', vaultId);
  const dynamicFieldsResponse = await client.getDynamicFields({ parentId: vaultId });
  // console.log(`Dynamic fields for vault ${vaultId}:`, JSON.stringify(dynamicFieldsResponse.data, null, 2));

  const coinDataForLookup: { coinTypeKey: string; objectId: string }[] = [];
  for (const df of dynamicFieldsResponse.data) {
    if (
      df.name.type === '0x1::string::String' && // Key type: std::string::String
      typeof df.name.value === 'string' &&     // Key value is the coin type string
      df.objectType.startsWith('0x2::coin::Coin<') // Value type is a Coin<T>
    ) {
      coinDataForLookup.push({
        coinTypeKey: df.name.value,
        objectId: df.objectId,
      });
    }
  }

  let balances: { coinType: string; totalBalance: string }[] = [];

  if (coinDataForLookup.length > 0) {
    const coinObjectIds = coinDataForLookup.map(c => c.objectId);
    const coinObjectsResponse = await client.multiGetObjects({
      ids: coinObjectIds,
      options: { showContent: true },
    });

    balances = coinObjectsResponse
      .map((coinObject, index) => {
        if (coinObject.data?.content?.dataType === 'moveObject') {
          const fields = coinObject.data.content.fields as { balance: string; id: { id: string } };
          if (typeof fields.balance === 'string') {
            return {
              coinType: coinDataForLookup[index].coinTypeKey,
              totalBalance: fields.balance,
            };
          }
        }
        console.warn(
          `Could not process coin object for ID ${coinDataForLookup[index].objectId} (key: ${coinDataForLookup[index].coinTypeKey}). Error:`,
          coinObject.error || "Object data, content, or balance field is missing/invalid."
        );
        return null;
      })
      .filter(b => b !== null) as { coinType: string; totalBalance: string }[];
  }

  // console.log('Balances derived from vault dynamic fields:', balances);
  const map = new Map<string, string>();
  for (const b of balances) map.set(normalizeCoinType(b.coinType), b.totalBalance);
  return map;
};

/** Turn the vault's on-chain weight list into a nice map for quick look-up */
const tokenWeightsMap = (
  // tokenWeights: { fields: { coin_type: string; weight_bps: number } }[], // original
  // Adjusted to expect the mapped structure if each item is { fields: { coin_type: string; weight_bps: number } }
   tokenWeightsInput: { fields: { coin_type: string; weight_bps: number } }[]
): Map<string, number> => {
  const m = new Map<string, number>();
  // for (const tw of tokenWeights) { // original
  for (const twEntry of tokenWeightsInput) { // changed
    // m.set(normalizeCoinType(tw.fields.coin_type), tw.fields.weight_bps); // original
    m.set(normalizeCoinType(twEntry.fields.coin_type), twEntry.fields.weight_bps); // changed
  }
  return m;
};

/* ──────────────────────────── main service ───────────────────────────── */

export async function getVaults(owner: string): Promise<ProcessedVault[]> {
  const client = new SuiClient({
    url: getFullnodeUrl('testnet')
  }); 

  /* ---- 1. grab every vault object owned by the user ------------------ */
  const { data: vaultObjs } = await client.getOwnedObjects({
    owner,
    filter: { StructType: `${PORTFOLIO_VAULT_PACKAGE_ID}::vault::Vault` },
    options: { showContent: true, showType: true },
  });

  if (!vaultObjs?.length) return [];

  const result: ProcessedVault[] = [];

  /* ---- 2. process each vault in parallel ----------------------------- */
  await Promise.all(
    vaultObjs.map(async (vo) => {
      if (vo.data?.content?.dataType !== 'moveObject' || !vo.data.objectId) return;

      // Define the structure of the policy field from the contract
      type RebalancePolicyOnChain = {
        type: string;
        fields: {
          rebalance_type: string; // u8
          rebalance_interval_days: string; // u64, comes as string
          rebalance_threshold_bps: number; // u16
        }
      };

      type VaultFields = {
        // balances: { fields: { id: { id: string } } }; // Removed, balances are now dynamic fields
        creator: string; // address
        // description: string; // Removed as per contract
        // icon_url: string;  // Removed as per contract
        id: { id: string }; // UID
        name: string; // String
        policy: RebalancePolicyOnChain; // Nested RebalancePolicy struct
        token_weights: { fields: { coin_type: string; weight_bps: number } }[];
      };

      const vaultFields = vo.data.content.fields as unknown as VaultFields;
      const vaultId = vo.data.objectId; // Use objectId from the outer vo.data

      /* ---- 2a. basic info & policy ------------------------------------------- */
      const policyData = vaultFields.policy;
      console.log('POLICY_DATA',policyData);
      let derivedTypeString: ProcessedVaultPolicy['derivedTypeString'] = 'Unknown';
      if (policyData.fields.rebalance_type == "0") derivedTypeString = 'Manual';
      else if (policyData.fields.rebalance_type === "1") derivedTypeString = 'Time-based';
      else if (policyData.fields.rebalance_type === "2") derivedTypeString = 'Drift-based';

      const policy: ProcessedVaultPolicy = {
        rebalanceType: parseInt(policyData.fields.rebalance_type),
        rebalanceIntervalDays: parseInt(policyData.fields.rebalance_interval_days, 10) || 0,
        rebalanceThresholdBps: policyData.fields.rebalance_threshold_bps || 0,
        derivedTypeString: derivedTypeString,
      };

      /* ---- 2b. balances from dynamic fields ------------------------------ */
      // const bagId = vaultFields.balances.fields.id.id; // Removed
      const balances = await loadBalancesFromVaultDynamicFields(client, vaultId); // Map<coinType, amount>

      /* ---- 2c. merge weight + balance lists ------------------------- */
      const weights = tokenWeightsMap(vaultFields.token_weights);

      const tokens: ProcessedVaultToken[] = [];
      const seen = new Set<string>();

      // first pass - coins defined by weights
      for (const [coinType, weightBps] of weights.entries()) {
        tokens.push({
          coinType,
          amount: balances.get(coinType) ?? '0',
          weightBps,
        });
        seen.add(coinType);
      }

      // second pass - stray coins present in bag but not in weights
      for (const [coinType, amt] of balances.entries()) {
        if (seen.has(coinType)) continue;
        tokens.push({ coinType, amount: amt, weightBps: 0 });
      }

      /* ---- 2d. assemble -------------------------------------------- */
      result.push({
        id: vaultId,
        name: vaultFields.name,
        creator: vaultFields.creator,
        tokens,
        policy,
        lastUpdatedAt: new Date().toISOString(),
        version: vo.data.version, // Add version
      });
    }),
  );
  console.log('FINAL_VAULTS', result);
  return result;
}


export const getVaultById = async (
  vaultId: string,
  client: SuiClient
): Promise<ProcessedVault | null> => {
  try {
    const vaultObjectResponse = await client.getObject({
      id: vaultId,
      options: {
        showContent: true,
        showOwner: true,
        showType: true,
        // It's good practice to also request showBcs if you ever need to deserialize complex types
        // or if frontend needs to work with raw Move data structures.
        // For now, showContent should be sufficient if fields are simple or stringified.
      },
    });

    if (vaultObjectResponse.error || !vaultObjectResponse.data) {
      console.error(`Error fetching vault ${vaultId}:`, vaultObjectResponse.error);
      return null;
    }

    const vaultData = vaultObjectResponse.data;
    const content = vaultData.content;

    if (!content || content.dataType !== 'moveObject') {
      console.error(`Vault ${vaultId} is not a valid Move object or has no content.`);
      return null;
    }

    // Define the structure of the policy field from the contract
    type RebalancePolicyOnChain = {
        type: string; // This is the full type string of the RebalancePolicy struct
        fields: {
          rebalance_type: string; // u8, will be stringified number
          rebalance_interval_days: string; // u64, will be stringified number
          rebalance_threshold_bps: number; // u16, might be number or stringified
        }
      };

    type VaultFieldsOnChain = {
        creator: string; // address
        id: { id: string }; // UID wrapper
        name: string; // String
        policy: RebalancePolicyOnChain;
        // Assuming token_weights from RPC is an array of objects,
        // where each object has a 'type' and 'fields' (for the TokenWeight struct)
        token_weights: {
            type: string; // e.g., "0xPKG::module::TokenWeight"
            fields: { coin_type: string; weight_bps: number; };
        }[];
        // cap_id is NOT part of the Vault struct itself. It's obtained from events.
      };

    // The actual fields from the RPC response
    const vaultFields = content.fields as unknown as VaultFieldsOnChain;

    // Process Policy
    const policyData = vaultFields.policy;
    let derivedTypeString: ProcessedVaultPolicy['derivedTypeString'] = 'Unknown';
    // Ensure rebalance_type is treated as a string if it comes from JSON
    const rebalanceTypeStr = policyData.fields.rebalance_type.toString();
    if (rebalanceTypeStr === "0") derivedTypeString = 'Manual';
    else if (rebalanceTypeStr === "1") derivedTypeString = 'Time-based';
    else if (rebalanceTypeStr === "2") derivedTypeString = 'Drift-based';

    const policy: ProcessedVaultPolicy = {
        rebalanceType: parseInt(rebalanceTypeStr, 10),
        rebalanceIntervalDays: parseInt(policyData.fields.rebalance_interval_days, 10) || 0,
        rebalanceThresholdBps: policyData.fields.rebalance_threshold_bps || 0, // u16 can be number
        derivedTypeString: derivedTypeString,
    };

    // Process Balances (from dynamic fields)
    const balances = await loadBalancesFromVaultDynamicFields(client, vaultId); // Map<coinType, amount>

    // Process Token Weights and merge with Balances
    // The structure of vaultFields.token_weights needs to be handled carefully based on RPC output
    let actualTokenWeights: { fields: { coin_type: string; weight_bps: number } }[] = [];
    if (Array.isArray(vaultFields.token_weights)) { // Direct array case
        // actualTokenWeights = vaultFields.token_weights.map(tw => tw.fields ? tw : { fields: tw as any }); // Old problematic line
        // A safer approach if vaultFields.token_weights items are guaranteed to have .fields:
        // actualTokenWeights = vaultFields.token_weights.map(tw => tw.fields);
        // Given the type definition for vaultFields.token_weights,
        // each element 'tw' is { type: string, fields: { coin_type: string, weight_bps: number } }
        // tokenWeightsMap expects an array of { fields: { coin_type: string, weight_bps: number } }
        actualTokenWeights = vaultFields.token_weights.map(tw => ({ fields: tw.fields }));
    }

    const weightsMap = tokenWeightsMap(actualTokenWeights);
    const tokens: ProcessedVaultToken[] = [];
    const seenCoinTypes = new Set<string>();

    for (const [coinType, weightBps] of weightsMap.entries()) {
        tokens.push({
          coinType,
          amount: balances.get(coinType) ?? '0',
          weightBps,
        });
        seenCoinTypes.add(coinType);
    }

    for (const [coinType, amount] of balances.entries()) {
        if (!seenCoinTypes.has(coinType)) {
            tokens.push({ coinType, amount: amount, weightBps: 0 }); // 0 weight if only balance exists
        }
    }

    // Fetch VaultCap ID from VaultCreated event
    let capId: string | undefined = undefined;
    try {
      const eventType = `${PORTFOLIO_VAULT_PACKAGE_ID}::vault::VaultCreated`;

      // Define a type for the parsed JSON of VaultCreated event
      interface VaultCreatedEventParsedJson {
        vault_id: string;
        vault_cap_id: string;
        name: string; // Assuming name and creator are also part of the event
        creator: string;
        // policy: any; // Add if policy is part of the event and needed
      }

      const eventResponse = await client.queryEvents({
        query: { MoveEventType: eventType },
        order: 'ascending',
        cursor: null,
        limit: 10000
      });

      for (const event of eventResponse.data) {
        // Ensure parsedJson is not null and has the expected fields
        if (event.type === eventType && event.parsedJson) {
          const parsed = event.parsedJson as VaultCreatedEventParsedJson;
          if (parsed.vault_id === vaultId && typeof parsed.vault_cap_id === 'string') {
            capId = parsed.vault_cap_id;
            break; // Found the relevant event
          }
        }
      }
      if (!capId) {
        console.warn(`VaultCap ID not found for vault ${vaultId} from VaultCreated events. Operations requiring VaultCap might fail.`);
      }
      console.log('[vaultCapId]', capId);
    } catch (eventError) {
      console.error(`Error fetching VaultCreated event for vault ${vaultId}:`, eventError);
      // Decide if this is critical. For now, we proceed without capId.
    }

    return {
      id: vaultData.objectId,
      name: vaultFields.name,
      creator: vaultFields.creator,
      tokens,
      policy,
      lastUpdatedAt: new Date().toISOString(),
      version: vaultData.version,
      capId: capId, // Include the fetched capId
    };

  } catch (error) {
    console.error(`Failed to process vault ${vaultId}:`, error);
    return null;
  }
};
