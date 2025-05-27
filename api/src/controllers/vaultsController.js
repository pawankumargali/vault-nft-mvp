import { PrismaClient } from '@prisma/client';
import { VAULT_PACKAGE_ID as PACKAGE_ID, VAULT_MODULE_NAME } from '../../config.js'; // Assuming config is in root

const prisma = new PrismaClient();

// Helper to safely parse JSON, especially for BigInt
function safeJsonParse(jsonString) {
    try {
        return JSON.parse(jsonString, (key, value) => {
            if (typeof value === 'string' && /^-?\d+n$/.test(value)) {
                return BigInt(value.slice(0, -1));
            }
            return value;
        });
    } catch (e) {
        console.error("Failed to parse JSON:", jsonString, e);
        return {}; // Return empty object or handle error as appropriate
    }
}

export async function getVaultsController(req, res, next) {
    try {
        const events = await prisma.event.findMany({
            where: {
                package_id: PACKAGE_ID,
                txn_module: VAULT_MODULE_NAME,
                evt_type: {
                    in: [
                        `${PACKAGE_ID}::${VAULT_MODULE_NAME}::VaultCreated`,
                        `${PACKAGE_ID}::${VAULT_MODULE_NAME}::CoinDeposited`,
                        `${PACKAGE_ID}::${VAULT_MODULE_NAME}::CoinWithdrawn`,
                        `${PACKAGE_ID}::${VAULT_MODULE_NAME}::PolicySet`,
                        `${PACKAGE_ID}::${VAULT_MODULE_NAME}::TokenWeightsSet`,
                        `${PACKAGE_ID}::${VAULT_MODULE_NAME}::VaultTransferred`
                    ]
                }
            },
            orderBy: [
                { timestamp_ms: 'asc' },
                { seq: 'asc' }
            ]
        });

        const vaultsMap = new Map();

        for (const event of events) {
            const payload = event.payload_json ? safeJsonParse(JSON.stringify(event.payload_json)) : {};
            const vaultId = payload.vault_id;

            if (!vaultId) continue;

            if (!vaultsMap.has(vaultId)) {
                if (event.evt_type.endsWith('::VaultCreated')) {
                    const policyPayload = payload.policy || {};
                    vaultsMap.set(vaultId, {
                        id: vaultId,
                        name: payload.name || 'Unnamed Vault',
                        creator: payload.creator,
                        currentAdmin: payload.creator,
                        tokens: [],
                        balances: {},
                        allocations: {},
                        policy: {
                            rebalanceType: policyPayload.rebalance_type,
                            rebalanceIntervalDays: parseInt(policyPayload.rebalance_interval_days || 0, 10),
                            rebalanceThresholdBps: parseInt(policyPayload.rebalance_threshold_bps || 0, 10),
                        },
                        createdAt: new Date(Number(event.timestamp_ms)).toISOString(),
                        lastUpdatedAt: new Date(Number(event.timestamp_ms)).toISOString(),
                    });
                } else {
                    console.warn(`Skipping event for vault ${vaultId} as VaultCreated event not encountered first.`);
                    continue;
                }
            }

            const vaultData = vaultsMap.get(vaultId);
            if (!vaultData) continue; // Should not happen if the above logic is correct
            vaultData.lastUpdatedAt = new Date(Number(event.timestamp_ms)).toISOString();

            if (event.evt_type.endsWith('::CoinDeposited')) {
                const coinType = payload.coin_type;
                const amount = BigInt(payload.amount || 0);
                if (coinType) {
                    const currentBalance = vaultData.balances[coinType]?.amount || BigInt(0);
                    vaultData.balances[coinType] = {
                        ...vaultData.balances[coinType],
                        amount: currentBalance + amount
                    };
                }
            } else if (event.evt_type.endsWith('::CoinWithdrawn')) {
                const coinType = payload.coin_type;
                const amount = BigInt(payload.amount || 0);
                if (coinType && vaultData.balances[coinType]) {
                    vaultData.balances[coinType].amount -= amount;
                    if (vaultData.balances[coinType].amount < BigInt(0)) {
                        console.warn(`Vault ${vaultId} coin ${coinType} balance went negative after withdrawal.`);
                        vaultData.balances[coinType].amount = BigInt(0);
                    }
                }
            } else if (event.evt_type.endsWith('::PolicySet')) {
                vaultData.policy = {
                    rebalanceType: payload.rebalance_type,
                    rebalanceIntervalDays: parseInt(payload.rebalance_interval_days || 0, 10),
                    rebalanceThresholdBps: parseInt(payload.rebalance_threshold_bps || 0, 10),
                };
            } else if (event.evt_type.endsWith('::TokenWeightsSet')) {
                vaultData.allocations = {};
                const coinTypes = payload.target_coin_types || [];
                const weightsBps = payload.target_weights_bps || [];

                for (let i = 0; i < coinTypes.length; i++) {
                    const coinType = coinTypes[i];
                    const weight = parseInt(weightsBps[i] || 0, 10);
                    if (coinType) {
                        vaultData.allocations[coinType] = weight;
                    }
                }
            } else if (event.evt_type.endsWith('::VaultTransferred')) {
                if (payload.to) {
                    vaultData.currentAdmin = payload.to;
                }
            }
        }

        const resultVaults = Array.from(vaultsMap.values()).map(vault => {
            const uiTokens = [];
            const allCoinTypes = new Set([...Object.keys(vault.balances), ...Object.keys(vault.allocations)]);

            for (const coinType of allCoinTypes) {
                const balanceInfo = vault.balances[coinType] || { amount: BigInt(0) };
                uiTokens.push({
                    coinType: coinType,
                    amount: balanceInfo.amount.toString(),
                    weightBps: vault.allocations[coinType] || 0,
                });
            }
            uiTokens.sort((a,b) => (a.coinType || "").localeCompare(b.coinType || ""));

            return {
                id: vault.id,
                name: vault.name,
                creator: vault.creator,
                currentAdmin: vault.currentAdmin,
                tokens: uiTokens,
                policy: vault.policy,
                createdAt: vault.createdAt,
                lastUpdatedAt: vault.lastUpdatedAt,
                totalValue: '0',
            };
        });

        resultVaults.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        res.status(200).json(resultVaults);
    } catch (error) {
        console.error("Error in getVaultsController:", error);
        next(error);
    }
}
