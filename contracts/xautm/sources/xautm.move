module xautm::xautm ;

use sui::coin::{Self, Coin, TreasuryCap}; // CoinMetadata is implicitly handled by create_currency

/// The one-time witness for our XAUTM coin.
public struct XAUTM has drop {}

/// Module initializer. This function is called once when the module is published.
/// It creates the coin's metadata and the TreasuryCap (minting/burning authority).
fun init(witness: XAUTM, ctx: &mut TxContext) {
    let (treasury_cap, metadata) = coin::create_currency<XAUTM>(
        witness,
        6,
        b"XAUTm",
        b"Mock Tether Gold",
        b"A mock version of Tether Gold for Sui Testnet.",
        option::none(),
        ctx
    );

    // It's good practice to make the coin metadata immutable.
    transfer::public_freeze_object(metadata);

    // Transfer the TreasuryCap to the publisher of the module.
    // This address will then have the authority to mint new XAUTm coins.
    transfer::public_transfer(treasury_cap, tx_context::sender(ctx));
}

/// Public entry function to mint new XAUTm coins.
/// Requires the TreasuryCap for authorization.
/// The total supply is not capped by this function; it increases with each mint.
public entry fun mint(
    treasury_cap: &mut TreasuryCap<XAUTM>, // Use XAUTM
    amount: u64,
    recipient: address,
    ctx: &mut TxContext
) {
    let new_coin = coin::mint<XAUTM>(treasury_cap, amount, ctx); // Use XAUTM
    transfer::public_transfer(new_coin, recipient);
}

/// Public entry function to burn (destroy) XAUTm coins.
/// Requires the TreasuryCap to update the total supply.
/// The owner of the coin calls this function, passing their coin to be burned.
public entry fun burn(
    treasury_cap: &mut TreasuryCap<XAUTM>, // Use XAUTM
    coin_to_burn: Coin<XAUTM>,             // Use XAUTM
) {
    coin::burn<XAUTM>(treasury_cap, coin_to_burn); // Use XAUTM
}

/// Gets the current total supply of XAUTm.
/// Requires a reference to the TreasuryCap.
public entry fun total_supply(treasury_cap: &TreasuryCap<XAUTM>): u64 { // Use XAUTM
    coin::total_supply(treasury_cap)
}
