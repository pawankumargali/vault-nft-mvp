module wbtcm::wbtcm ;

use sui::coin::{Self, Coin, TreasuryCap}; // CoinMetadata is implicitly handled by create_currency

/// The one-time witness for our WBTCM coin.
public struct WBTCM has drop {}

/// Module initializer. This function is called once when the module is published.
/// It creates the coin's metadata and the TreasuryCap (minting/burning authority).
fun init(witness: WBTCM, ctx: &mut TxContext) {
    let (treasury_cap, metadata) = coin::create_currency<WBTCM>(
        witness,
        8,
        b"WBTCm",
        b"Mock Wrapped Bitcoin",
        b"A mock version of Wrapped Bitcoin for Sui Testnet.",
        option::none(),
        ctx
    );

    // It's good practice to make the coin metadata immutable.
    transfer::public_freeze_object(metadata);

    // Transfer the TreasuryCap to the publisher of the module.
    // This address will then have the authority to mint new WBTCm coins.
    transfer::public_transfer(treasury_cap, tx_context::sender(ctx));
}

/// Public entry function to mint new WBTCm coins.
/// Requires the TreasuryCap for authorization.
/// The total supply is not capped by this function; it increases with each mint.
public entry fun mint(
    treasury_cap: &mut TreasuryCap<WBTCM>, // Use WBTCM
    amount: u64,
    recipient: address,
    ctx: &mut TxContext
) {
    let new_coin = coin::mint<WBTCM>(treasury_cap, amount, ctx); // Use WBTCM
    transfer::public_transfer(new_coin, recipient);
}

/// Public entry function to burn (destroy) WBTCm coins.
/// Requires the TreasuryCap to update the total supply.
/// The owner of the coin calls this function, passing their coin to be burned.
public entry fun burn(
    treasury_cap: &mut TreasuryCap<WBTCM>, // Use WBTCM
    coin_to_burn: Coin<WBTCM>,             // Use WBTCM
) {
    coin::burn<WBTCM>(treasury_cap, coin_to_burn); // Use WBTCM
}

/// Gets the current total supply of WBTCm.
/// Requires a reference to the TreasuryCap.
public entry fun total_supply(treasury_cap: &TreasuryCap<WBTCM>): u64 { // Use WBTCM
    coin::total_supply(treasury_cap)
}
