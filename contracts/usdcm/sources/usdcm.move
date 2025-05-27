module usdcm::usdcm ;

use sui::coin::{Self, Coin, TreasuryCap}; // CoinMetadata is implicitly handled by create_currency

/// The one-time witness for our USDCM coin.
public struct USDCM has drop {}

/// Module initializer. This function is called once when the module is published.
/// It creates the coin's metadata and the TreasuryCap (minting/burning authority).
fun init(witness: USDCM, ctx: &mut TxContext) {
    let (treasury_cap, metadata) = coin::create_currency<USDCM>(
        witness,
        6,
        b"USDCm",
        b"Mock USDC",
        b"A mock version of USDC for Sui Testnet.",
        option::none(),
        ctx
    );

    // It's good practice to make the coin metadata immutable.
    transfer::public_freeze_object(metadata);

    // Transfer the TreasuryCap to the publisher of the module.
    // This address will then have the authority to mint new USDCm coins.
    transfer::public_transfer(treasury_cap, tx_context::sender(ctx));
}

/// Public entry function to mint new USDCm coins.
/// Requires the TreasuryCap for authorization.
/// The total supply is not capped by this function; it increases with each mint.
public entry fun mint(
    treasury_cap: &mut TreasuryCap<USDCM>, // Use USDCM
    amount: u64,
    recipient: address,
    ctx: &mut TxContext
) {
    let new_coin = coin::mint<USDCM>(treasury_cap, amount, ctx); // Use USDCM
    transfer::public_transfer(new_coin, recipient);
}

/// Public entry function to burn (destroy) USDCm coins.
/// Requires the TreasuryCap to update the total supply.
/// The owner of the coin calls this function, passing their coin to be burned.
public entry fun burn(
    treasury_cap: &mut TreasuryCap<USDCM>, // Use USDCM
    coin_to_burn: Coin<USDCM>,             // Use USDCM
) {
    coin::burn<USDCM>(treasury_cap, coin_to_burn); // Use USDCM
}

/// Gets the current total supply of USDCm.
/// Requires a reference to the TreasuryCap.
public entry fun total_supply(treasury_cap: &TreasuryCap<USDCM>): u64 { // Use USDCM
    coin::total_supply(treasury_cap)
}
