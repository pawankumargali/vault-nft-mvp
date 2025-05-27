module portfolio_vault::vault {
    // --- Import Statements ---
    use std::string::{Self, String};
    use std::type_name;
    use sui::coin::{Self, Coin};
    use sui::event;
    use sui::dynamic_object_field;
    // use pyth::price;
    // use pyth::pyth;
    // use pyth::i64;
    // use pyth::i64::I64;
    // use pyth::price_info::PriceInfoObject;

    // --- Structs ---

    /// Represents a single token type and its desired weight in the vault.
    public struct TokenWeight has store, copy, drop {
        coin_type: String, // This is std::string::String
        weight_bps: u16,   // Weight in basis points (0-10000, summing to 10000)
    }

    /// The main Vault object.
    public struct Vault has key, store {
        id: UID,
        name: String,
        creator: address,
        // The types of coins allowed in this vault and their target weights.
        // This is set at creation and can be updated via policy.
        token_weights: vector<TokenWeight>,
        policy: RebalancePolicy
    }

    /// Capability object that grants administrative rights over a Vault.
    /// This includes rights like setting/updating policy, depositing/withdrawing, and transferring the cap.
    public struct VaultCap has key, store {
        id: UID
    }

    // public struct RebalanceCap has key, store {
    //     id: UID,
    // }

    public struct RebalancePolicy has store, copy, drop {
        rebalance_type: u8,
        rebalance_interval_days: u64,
        rebalance_threshold_bps: u16,
    }

    // Describes a single proposed trade.
    // public struct ProposedTrade has store, copy, drop {
    //     from_coin_type: String,
    //     to_coin_type: String,
    //     from_amount: u64,
    //     to_amount_expected: u64,
    // }

    // Holds calculated value information for an asset.
    // public struct AssetValueInfo has store, copy, drop {
    //     coin_type: String,
    //     current_balance: u64,
    //     price: u128,         // Price with decimals
    //     expo: I64,          // The exponent for the price
    //     current_value: u128 // The total value of the asset holding in the vault
    // }


    // --- Events ---

    /// Emitted when a new vault is created.
    public struct VaultCreated has copy, drop {
        vault_id: ID,
        vault_cap_id: ID,
        name: String,
        creator: address, // Initial creator and owner of the VaultCap.
        policy: RebalancePolicy,
    }

    /// Emitted when a coin is deposited into the vault.
    public struct CoinDeposited has copy, drop {
        vault_id: ID,
        depositor: address, // Address that authorized the deposit (current VaultCap owner)
        coin_type: String, // std::string::String
        amount: u64,
        before_balance: u64,
        after_balance: u64,
    }

    /// Emitted when a coin is withdrawn from the vault.
    public struct CoinWithdrawn has copy, drop {
        vault_id: ID,
        withdrawer: address, // Address that authorized the withdrawal (current VaultCap owner)
        recipient: address,  // Address that received the coins
        coin_type: String,   // std::string::String
        amount: u64,
        before_balance: u64,
        after_balance: u64,
    }

    /// Emitted when the vault's rebalancing policy is set or updated.
    public struct PolicySet has copy, drop {
        sender: address,
        vault_id: ID,
        rebalance_type: u8,
        rebalance_interval_days: u64,
        rebalance_threshold_bps: u16,
    }

    /// Emitted when the vault's target token weights are set or updated.
    public struct TokenWeightsSet has copy, drop {
        sender: address,
        vault_id: ID,
        target_coin_types: vector<String>, // Vector of fully qualified coin type names
        target_weights_bps: vector<u16>    // Vector of weights in basis points
    }

    /// Emitted when the VaultCap is transferred to a new owner.
    public struct VaultTransferred has copy, drop {
        vault_id: ID,
        vault_cap_id: ID,
        from: address,
        to: address
    }

    // Emitted when a rebalance is triggered, containing the calculated plan.
    // public struct RebalanceAttempted has copy, drop {
    //     vault_id: ID,
    //     caller: address,
    //     total_vault_value_usd: u128,
    //     proposed_trades: vector<ProposedTrade>,
    // }

    // --- Errors ---
    const E_WEIGHTS_DO_NOT_SUM_TO_10000: u64 = 1;
    const E_TOKEN_LIST_AND_WEIGHTS_MISMATCH: u64 = 2;
    const E_INVALID_WEIGHT: u64 = 3;
    const E_INSUFFICIENT_BALANCE: u64 = 4;
    const E_COIN_NOT_IN_VAULT: u64 = 5;
    const E_ZERO_DEPOSIT_AMOUNT: u64 = 6;
    const E_ZERO_WITHDRAW_AMOUNT: u64 = 7;
    const E_INVALID_NEW_OWNER_ADDRESS: u64 = 8;
    const E_CANNOT_TRANSFER_TO_SELF: u64 = 9;
    // const E_VAULT_IS_EMPTY: u64 = 10;
    // const E_TOKEN_NOT_SUPPORTED_IN_REBALANCE: u64 = 11;
    // const E_PRICE_UNAVAILABLE_OR_NEGATIVE: u64 = 12;
    // const E_DIVISION_BY_ZERO: u64 = 13;
    const E_INVALID_REBALANCE_TYPE: u64 = 14;
    const E_MANUAL_POLICY_REQUIRES_ZERO_PARAMS: u64 = 15;
    const E_TIME_POLICY_REQUIRES_POSITIVE_INTERVAL_AND_ZERO_THRESHOLD: u64 = 16;
    const E_DRIFT_POLICY_REQUIRES_VALID_THRESHOLD_AND_ZERO_INTERVAL: u64 = 17;

    // --- Constants ---
    const REBALANCE_TYPE_MANUAL: u8 = 0;
    const REBALANCE_TYPE_TIME_BASED: u8 = 1;
    const REBALANCE_TYPE_DRIFT_BASED: u8 = 2;
    // const MAX_PRICE_AGE_SECONDS: u64 = 60; // 1 minute

    // --- Public Functions ---

    /// Creates a new Vault and a corresponding VaultCap for the creator.
    public fun create_vault(
        name_vec: vector<u8>,
        ctx: &mut TxContext
    ): (Vault, VaultCap) {
        let vault_name = string::utf8(name_vec);

        let sender = tx_context::sender(ctx);
        let vault_uid = object::new(ctx);
        let default_policy = RebalancePolicy {
            rebalance_type: REBALANCE_TYPE_MANUAL,
            rebalance_interval_days: 0,
            rebalance_threshold_bps: 0,
        };
        let vault = Vault {
            id: vault_uid,
            name: vault_name,
            creator: sender,
            token_weights: vector::empty<TokenWeight>(),
            policy: default_policy
        };

        let vault_id = object::id(&vault);

        let vault_cap = VaultCap {
            id: object::new(ctx)
        };
        let vault_cap_id = object::id(&vault_cap);


        event::emit(VaultCreated {
            vault_id,
            vault_cap_id,
            name: vault_name,
            creator: sender,
            policy: default_policy
        });

        (vault, vault_cap,)
    }

    /// Deposits a Coin<T> into the vault.
    public entry fun deposit_coin<T>(
        _: &VaultCap,
        vault: &mut Vault,
        coin_to_deposit: Coin<T>,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);

        let deposit_amount = coin::value(&coin_to_deposit);
        assert!(deposit_amount > 0, E_ZERO_DEPOSIT_AMOUNT);

        let type_name_string = string::from_ascii(type_name::into_string(type_name::get<T>()));

        if (dynamic_object_field::exists_<String>(&vault.id, type_name_string)) {
            let existing_coin = dynamic_object_field::borrow_mut<String, Coin<T>>(&mut vault.id, type_name_string);
            let before_balance = coin::value(existing_coin);
            coin::join(existing_coin, coin_to_deposit);
            let after_balance = coin::value(existing_coin);

            event::emit(CoinDeposited {
                vault_id: object::id(vault),
                depositor: sender,
                coin_type: type_name_string,
                amount: deposit_amount,
                before_balance,
                after_balance,
            });
        } else {
            let before_balance = 0;
            let after_balance = deposit_amount;
            dynamic_object_field::add(&mut vault.id, type_name_string, coin_to_deposit);

            event::emit(CoinDeposited {
                vault_id: object::id(vault),
                depositor: sender,
                coin_type: type_name_string,
                amount: deposit_amount,
                before_balance,
                after_balance,
            });
        };
    }

    /// Withdraws a Coin<T> from the vault.
    public entry fun withdraw_coin<T>(
        _: &VaultCap,
        vault: &mut Vault,
        amount_to_withdraw: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        let vault_operator = tx_context::sender(ctx);

        assert!(amount_to_withdraw > 0, E_ZERO_WITHDRAW_AMOUNT);

        let type_name_string = string::from_ascii(type_name::into_string(type_name::get<T>()));

        assert!(dynamic_object_field::exists_<String>(&vault.id, type_name_string), E_COIN_NOT_IN_VAULT);

        let mut vault_coin_balance = dynamic_object_field::remove<String, Coin<T>>(&mut vault.id, type_name_string);
        let current_balance_value = coin::value(&vault_coin_balance);

        assert!(current_balance_value >= amount_to_withdraw, E_INSUFFICIENT_BALANCE);

        let withdrawn_coin = coin::split(&mut vault_coin_balance, amount_to_withdraw, ctx);
        let remaining_balance_value = coin::value(&vault_coin_balance);

        if (remaining_balance_value > 0) {
            dynamic_object_field::add(&mut vault.id, type_name_string, vault_coin_balance);
        } else {
            coin::destroy_zero(vault_coin_balance);
        };

        transfer::public_transfer(withdrawn_coin, recipient);

        event::emit(CoinWithdrawn {
            vault_id: object::id(vault),
            withdrawer: vault_operator,
            recipient,
            coin_type: type_name_string,
            amount: amount_to_withdraw,
            before_balance: current_balance_value,
            after_balance: remaining_balance_value,
        });
    }

    // --- Admin Functions (require VaultCap) ---

    /// Transfers the VaultCap to a new owner.
    public entry fun transfer_vault(
        vault_cap: VaultCap,
        vault: Vault,
        recipient: address,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(recipient != @0x0, E_INVALID_NEW_OWNER_ADDRESS);
        assert!(recipient != sender, E_CANNOT_TRANSFER_TO_SELF);

        event::emit(VaultTransferred {
            vault_id: object::id(&vault),
            vault_cap_id: object::id(&vault_cap),
            from: sender,
            to: recipient,
        });

        transfer::public_transfer(vault, recipient);
        transfer::transfer(vault_cap, recipient);

    }

    /// Sets or updates the target token weights for the vault.
    public entry fun set_token_weights(
        _: &VaultCap,
        vault: &mut Vault,
        target_coin_types: vector<vector<u8>>,
        target_weights_bps: vector<u16>,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);

        let num_target_tokens = vector::length(&target_coin_types);
        assert!(num_target_tokens == vector::length(&target_weights_bps), E_TOKEN_LIST_AND_WEIGHTS_MISMATCH);

        let mut new_token_weights_vec = vector::empty<TokenWeight>();
        let mut event_target_coin_type_names = vector::empty<String>();

        if (num_target_tokens > 0) {
            let mut total_weight_check = 0u16;
            let mut i = 0;
            while (i < num_target_tokens) {
                let coin_type_bytes = vector::borrow(&target_coin_types, i);
                let coin_type_string = string::utf8(*coin_type_bytes);
                let weight = *vector::borrow(&target_weights_bps, i);
                assert!(weight > 0 && weight <= 10000, E_INVALID_WEIGHT);
                total_weight_check = total_weight_check + weight;
                vector::push_back(&mut new_token_weights_vec, TokenWeight {
                    coin_type: coin_type_string,
                    weight_bps: weight,
                });
                 vector::push_back(&mut event_target_coin_type_names, string::utf8(*coin_type_bytes));
                i = i + 1;
            };
            assert!(total_weight_check == 10000, E_WEIGHTS_DO_NOT_SUM_TO_10000);
        };

        vault.token_weights = new_token_weights_vec;

        event::emit(TokenWeightsSet {
            vault_id: object::id(vault),
            target_coin_types: event_target_coin_type_names,
            target_weights_bps,
            sender,
        });
    }

    /// Sets or updates the rebalancing policy for the vault.
    public entry fun set_policy(
        _: &VaultCap,
        vault: &mut Vault,
        rebalance_type: u8,
        interval_days: u64,
        threshold_bps: u16,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);

        if (rebalance_type == REBALANCE_TYPE_MANUAL) {
            assert!(interval_days == 0 && threshold_bps == 0, E_MANUAL_POLICY_REQUIRES_ZERO_PARAMS);
        } else if (rebalance_type == REBALANCE_TYPE_TIME_BASED) {
            assert!(interval_days > 0 && threshold_bps == 0, E_TIME_POLICY_REQUIRES_POSITIVE_INTERVAL_AND_ZERO_THRESHOLD);
        } else if (rebalance_type == REBALANCE_TYPE_DRIFT_BASED) {
            assert!(threshold_bps > 0 && threshold_bps <= 10000 && interval_days == 0, E_DRIFT_POLICY_REQUIRES_VALID_THRESHOLD_AND_ZERO_INTERVAL);
        } else {
            abort E_INVALID_REBALANCE_TYPE
        };

        vault.policy = RebalancePolicy {
            rebalance_type,
            rebalance_interval_days: interval_days,
            rebalance_threshold_bps: threshold_bps,
        };

        event::emit(PolicySet {
            sender,
            vault_id: object::id(vault),
            rebalance_type,
            rebalance_interval_days: interval_days,
            rebalance_threshold_bps: threshold_bps,
        });
    }


    // --- Getter functions ---

    /// Returns the creator of the vault.
    public fun creator(vault: &Vault): address {
        vault.creator
    }

    /// Returns the Vault ID.
    public fun vault_id(vault: &Vault): ID {
        object::id(vault)
    }

    // --- Rebalance Functions ---

    // Helper function to find the minimum of two u128 values.
    // fun min_u128(x: u128, y: u128): u128 {
    //     if (x < y) { x } else { y }
    // }

    // fun get_price_safely(
    //     price_info_object: &PriceInfoObject,
    //     clock: &Clock
    // ): Price {
    //     pyth::get_price_no_older_than(price_info_object, clock, MAX_PRICE_AGE_SECONDS)
    // }

    // Converts a target USD value back into a token amount using its price data.
    // fun convert_value_to_amount(
    //     value_to_convert: u128,
    //     price_i64: &I64,
    //     expo_i64: &I64
    // ): u64 {
    //     assert!(!i64::get_is_negative(price_i64), E_PRICE_UNAVAILABLE_OR_NEGATIVE);
    //     let price_u64 = i64::get_magnitude_if_positive(price_i64);
    //     assert!(price_u64 > 0, E_PRICE_UNAVAILABLE_OR_NEGATIVE);

    //     let amount: u128;
    //     if (i64::get_is_negative(expo_i64)) {
    //         // Example: price is 30000, expo is -8. Real price is 30000 / 10^8.
    //         // amount = value / (price / 10^8) = (value * 10^8) / price
    //         let expo_mag = i64::get_magnitude_if_negative(expo_i64);
    //         let scaling_factor = math::pow(10, (expo_mag as u8));
    //         amount = value_to_convert * (scaling_factor as u128) / (price_u64 as u128);
    //     } else {
    //         // Example: price is 1, expo is 6. Real price is 1 * 10^6.
    //         // amount = value / (price * 10^6)
    //         let expo_mag = i64::get_magnitude_if_positive(expo_i64);
    //         let scaling_factor = math::pow(10, (expo_mag as u8));
    //         let divisor = (price_u64 as u128) * (scaling_factor as u128);
    //         assert!(divisor > 0, E_DIVISION_BY_ZERO);
    //         amount = value_to_convert / divisor;
    //     };
    //     (amount as u64)
    // }

    // Calculates and logs the required trades to rebalance the portfolio to its target weights.
    // This version is base-coin independent, proposing direct trades between imbalanced assets.
    // REFINED VERSION: This function has been updated to correctly handle asset ordering and
    // ensure that target weights are applied to the correct assets, even if some have a zero balance.
    // public entry fun rebalance<BTC, WBTC, XAUT, USDC, SUI: drop>( // NOTE: Actual coin types must be passed here.
    //     _: &RebalanceCap,
    //     vault: &Vault,
    //     btc_price_info_object: &PriceInfoObject,
    //     wbtc_price_info_object: &PriceInfoObject,
    //     xaut_price_info_object: &PriceInfoObject,
    //     sui_price_info_object: &PriceInfoObject,
    //     usdc_price_info_object: &PriceInfoObject,
    //     clock: &Clock,
    //     ctx: &mut TxContext
    // ) {
    //     let sender = tx_context::sender(ctx);
    //     let num_tokens = vector::length(&vault.token_weights);
    //     assert!(num_tokens > 0, E_VAULT_IS_EMPTY);

    //     // --- Step 1: Calculate current values for ALL assets defined in token_weights ---
    //     let mut asset_values = vector::empty<AssetValueInfo>();
    //     let mut total_vault_value = 0u128;

    //     // Get full type names from the generic parameters to match against strings
    //     let btc_type_name_str = type_name::into_string(type_name::get<BTC>());
    //     let wbtc_type_name_str = type_name::into_string(type_name::get<WBTC>());
    //     let xaut_type_name_str = type_name::into_string(type_name::get<XAUT>());
    //     let sui_type_name_str = type_name::into_string(type_name::get<SUI>());
    //     let usdc_type_name_str = type_name::into_string(type_name::get<USDC>());

    //     let mut i = 0;
    //     while (i < num_tokens) {
    //         let token_weight = vector::borrow(&vault.token_weights, i);
    //         let coin_type = token_weight.coin_type;
    //         let coin_type_ascii = string::to_ascii(coin_type);

    //         let mut balance: u64 = 0;
    //         let mut price_struct: Price;

    //         // Match the coin_type string from weights to the provided price objects
    //         if (coin_type_ascii == btc_type_name_str) {
    //             price_struct = get_price_safely(btc_price_info_object, clock);
    //             if (dynamic_object_field::exists_<String>(&vault.id, coin_type)) {
    //                 balance = coin::value(dynamic_object_field::borrow<String, Coin<BTC>>(&vault.id, coin_type));
    //             }
    //         } else if (coin_type_ascii == wbtc_type_name_str) {
    //             price_struct = get_price_safely(wbtc_price_info_object, clock);
    //             if (dynamic_object_field::exists_<String>(&vault.id, coin_type)) {
    //                 balance = coin::value(dynamic_object_field::borrow<String, Coin<WBTC>>(&vault.id, coin_type));
    //             }
    //         } else if (coin_type_ascii == xaut_type_name_str) {
    //             price_struct = get_price_safely(xaut_price_info_object, clock);
    //             if (dynamic_object_field::exists_<String>(&vault.id, coin_type)) {
    //                 balance = coin::value(dynamic_object_field::borrow<String, Coin<XAUT>>(&vault.id, coin_type));
    //             }
    //         } else if (coin_type_ascii == sui_type_name_str) {
    //             price_struct = get_price_safely(sui_price_info_object, clock);
    //             if (dynamic_object_field::exists_<String>(&vault.id, coin_type)) {
    //                 balance = coin::value(dynamic_object_field::borrow<String, Coin<SUI>>(&vault.id, coin_type));
    //             }
    //         } else if (coin_type_ascii == usdc_type_name_str) {
    //             price_struct = get_price_safely(usdc_price_info_object, clock);
    //             if (dynamic_object_field::exists_<String>(&vault.id, coin_type)) {
    //                 balance = coin::value(dynamic_object_field::borrow<String, Coin<USDC>>(&vault.id, coin_type));
    //             }
    //         } else {
    //             abort E_TOKEN_NOT_SUPPORTED_IN_REBALANCE
    //         };

    //         let price_val_i64 = price::get_price(&price_struct);
    //         let expo_i64 = price::get_expo(&price_struct);
    //         assert!(!i64::get_is_negative(&price_val_i64), E_PRICE_UNAVAILABLE_OR_NEGATIVE);
    //         let price_val_u64 = i64::get_magnitude_if_positive(&price_val_i64);
    //         let mut asset_total_value = 0u128;

    //         if (balance > 0) {
    //              if (i64::get_is_negative(&expo_i64)) {
    //                 let expo_mag = i64::get_magnitude_if_negative(&expo_i64);
    //                 let divisor = math::pow(10, (expo_mag as u8));
    //                 asset_total_value = (balance as u128) * (price_val_u64 as u128) / (divisor as u128);
    //             } else {
    //                 let expo_mag = i64::get_magnitude_if_positive(&expo_i64);
    //                 let multiplier = math::pow(10, (expo_mag as u8));
    //                 asset_total_value = (balance as u128) * (price_val_u64 as u128) * (multiplier as u128);
    //             };
    //         };

    //         // CRITICAL CHANGE: Push an info struct for EVERY asset in token_weights.
    //         // This maintains the 1-to-1 correspondence between asset_values and token_weights.
    //         vector::push_back(&mut asset_values, AssetValueInfo {
    //             coin_type: coin_type,
    //             current_balance: balance,
    //             price: price_val_i64,
    //             expo: expo_i64,
    //             current_value: asset_total_value,
    //         });
    //         total_vault_value = total_vault_value + asset_total_value;
    //         i = i + 1;
    //     };

    //     assert!(total_vault_value > 0, E_VAULT_IS_EMPTY);

    //     // --- Step 2: Identify imbalances (overweight and underweight assets) ---
    //     let mut overweight_assets = vector::empty<AssetImbalance>();
    //     let mut underweight_assets = vector::empty<AssetImbalance>();

    //     let mut k = 0;
    //     // The length of asset_values is now guaranteed to be the same as token_weights
    //     let asset_values_len = vector::length(&asset_values);
    //     while (k < asset_values_len) {
    //         let asset_info = vector::borrow(&asset_values, k);
    //         // This assumption is now SAFE because the vectors are synchronized.
    //         let target_weight = vector::borrow(&vault.token_weights, k);

    //         // Defensive check to ensure coin types still match (good practice)
    //         assert!(asset_info.coin_type == target_weight.coin_type, E_TOKEN_LIST_AND_WEIGHTS_MISMATCH);

    //         let target_value = (total_vault_value * (target_weight.weight_bps as u128)) / 10000u128;

    //         if (asset_info.current_value > target_value) {
    //             vector::push_back(&mut overweight_assets, AssetImbalance {
    //                 coin_type: asset_info.coin_type,
    //                 imbalance_value: asset_info.current_value - target_value,
    //                 price: asset_info.price,
    //                 expo: asset_info.expo,
    //             });
    //         } else if (asset_info.current_value < target_value) {
    //             vector::push_back(&mut underweight_assets, AssetImbalance {
    //                 coin_type: asset_info.coin_type,
    //                 imbalance_value: target_value - asset_info.current_value,
    //                 price: asset_info.price,
    //                 expo: asset_info.expo,
    //             });
    //         };
    //         k = k + 1;
    //     };

    //     // --- Step 3: Match overweight and underweight assets to create trades ---
    //     // This logic remains the same, but now operates on correctly calculated imbalances.
    //     let mut proposed_trades = vector::empty<ProposedTrade>();
    //     let mut seller_idx = 0;
    //     let mut buyer_idx = 0;

    //     while (seller_idx < vector::length(&overweight_assets) && buyer_idx < vector::length(&underweight_assets)) {
    //         let seller = vector::borrow_mut(&mut overweight_assets, seller_idx);
    //         let buyer = vector::borrow_mut(&mut underweight_assets, buyer_idx);

    //         let trade_value = min_u128(seller.imbalance_value, buyer.imbalance_value);

    //         if (trade_value > 0) {
    //             let from_amount = convert_value_to_amount(trade_value, &seller.price, &seller.expo);
    //             let to_amount_expected = convert_value_to_amount(trade_value, &buyer.price, &buyer.expo);

    //             if (from_amount > 0 && to_amount_expected > 0) {
    //                 vector::push_back(&mut proposed_trades, ProposedTrade {
    //                     from_coin_type: seller.coin_type,
    //                     to_coin_type: buyer.coin_type,
    //                     from_amount,
    //                     to_amount_expected,
    //                 });
    //             };

    //             seller.imbalance_value = seller.imbalance_value - trade_value;
    //             buyer.imbalance_value = buyer.imbalance_value - trade_value;
    //         };

    //         if (seller.imbalance_value == 0) {
    //             seller_idx = seller_idx + 1;
    //         };
    //         if (buyer.imbalance_value == 0) {
    //             buyer_idx = buyer_idx + 1;
    //         };
    //     };

    //     event::emit(RebalanceAttempted {
    //         vault_id: object::id(vault),
    //         caller: sender,
    //         total_vault_value_usd: total_vault_value,
    //         proposed_trades,
    //     });
    // }

    // public fun swap<T1, T2>(
    //     _: &RebalanceCap,
    //     _token_in: &mut Coin<T1>,
    //     _token_out: &mut Coin<T2>,
    //     _amount_in: u64,
    //     _ctx: &mut TxContext
    // ) {
    //     // TODO: Implement swapping logic
    // }
}
