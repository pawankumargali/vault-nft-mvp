import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient()

async function main() {

  const count = await prisma.coin.count();
  if(count > 0) {
    console.log('coins already seeded');
    return;
  }

  // coin_types and price_feeds are relevant to Sui Testnet and Pyth/Hermes Beta network
  const coins = [
    {
      name : 'Sui',
      symbol : 'SUI',
      decimals : 9,
      icon : '',
      coin_type : '0x2::sui::SUI',
      price_feed_id : '50c67b3fd225db8912a424dd4baed60ffdde625ed2feaaf283724f9608fea266'
    },
    {
      name : 'Bitcoin',
      symbol : 'BTCm',
      decimals : 8,
      icon : '',
      coin_type : '0x5678::bctm::BTCM',
      price_feed_id : 'f9c0172ba10dfa4d19088d94f5bf61d3b54d5bd7483a322a982e1373ee8ea31b'
    },
    {
      name : 'Tether Gold',
      symbol : 'XAUtm',
      decimals : 6,
      icon : '',
      coin_type : '0xdad3fffed2df9da67d04c6813625ec9d5deff5a7c4e5c49a201deba4018fb0d3::xautm::XAUTM',
      price_feed_id : 'b828d7baf048f26e111d1d057238dea676d99869345d6ea90e1ca7799a2c23f3'
    },
    {
      name : 'Wrapped Bitcoin',
      symbol : 'WBTCm',
      decimals : 8,
      icon : '',
      coin_type : '0xba0a3572d255d816bf30d0d8c9eb9edcd99107af6030312ac296bb971f0a59c8::wbtcm::WBTCM',
      price_feed_id : 'ea0459ab2954676022baaceadb472c1acc97888062864aa23e9771bae3ff36ed'
    },
    {
      name : 'USDC',
      symbol : 'USDCm',
      decimals : 6,
      icon : '',
      coin_type : '0x8c17b383e12e98e5d475c9d0ef8c10bf1cc11494b304038a9706fa6c10ff3a5a::usdcm::USDCM',
      price_feed_id : '41f3625971ca2ed2263e78573fe5ce23e13d2558ed3f2e47ab0f84fb9e7ae722'
    }
  ];

  await prisma.coin.createMany({
    data: coins
  });

  console.log('Successfully seeded coins', coins.map(c => c.symbol).toString())
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
});
