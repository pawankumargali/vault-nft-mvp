import db from './db.js';
import appCache from './cache.js';
import axios from 'axios';
import Decimal from 'decimal.js';
import { PYTH_BASE_URL } from '../../config.js';
import { Prisma } from '@prisma/client';
import { APIError } from '../middleware/error.middleware.js';

class CoinPriceService {

    _coinPriceInfoCacheKey(coin_id) {
        return `coin_id_${coin_id}_price_info`;
    }

    async getCoinPrices(ids=[]) {
        try {
            console.log(ids);
            const formattedIds = ids.map(id => parseInt(id));
            console.log(formattedIds);

            const prices = {};
            const missing = [];
            formattedIds.forEach(id => {
            const hit = appCache.get(this._coinPriceInfoCacheKey(id));

            if (hit) prices[id] = hit;
            else missing.push(id);
            });

            if (missing.length) {

                const rows = await db.coinPrice.findMany({
                    where: {
                        coin_id: { in: missing }
                    }
                })
                if(rows.length < missing.length) {
                    const supportedIds = {};
                    rows.forEach(row => {
                        supportedIds[row.coin_id] = true;
                    })
                    const unsupportedIds = missing.filter(coin_id => !supportedIds[coin_id]);

                    throw new APIError(400, `coin ids ${unsupportedIds.toString()} are not supported`)
                }

                rows.forEach(r => {
                    const payload = { price: r.price_usd, publish_time: r.publish_time };
                    console.log(r.coin_id);
                    appCache.set(this._coinPriceInfoCacheKey(r.coin_id), payload, 10);
                    prices[r.coin_id] = payload;
                });
            }

            return prices;
        } catch(e) {
            throw e;
        }
    }


    /**
     * Fetch prices from Hermes-beta and upsert into PostgreSQL
     */
    async updatePrices() {
        try {
            const coins = await db.coin.findMany({ where: { is_active: true }});
            if (coins.length === 0) {
                console.log("No symbols configured. Skipping price update.");
                return { count: 0, status: "success", message: "No symbols to update." };
            }

            const params = new URLSearchParams();
            // `id` here is the feed ID for the coin

            const priceFeedIdtoCoinIdMap = {};
            coins.forEach(coin => {
                params.append('ids[]', coin.price_feed_id);
                priceFeedIdtoCoinIdMap[coin.price_feed_id] = coin.id;
            });
            const url = `${PYTH_BASE_URL}/v2/updates/price/latest?${params.toString()}`;

            const { data: apiResponse } = await axios.get(url, { timeout: 10000 });
            // console.log('API_RESPONSE', JSON.stringify(apiResponse));
            /*
                {
                    "binary": {
                        "encoding": "hex",
                        "data": [
                            "504e41550100000000a00100000..."
                        ]
                    },
                    "parsed": [
                        {
                            "id": "f9c017...a31b",
                            "price": {
                                "price": "10288792370408",
                                "conf": "2832629591",
                                "expo": -8,
                                "publish_time": 1747489278
                            },
                            "ema_price": {
                                "price": "10297511600000",
                                "conf": "2807942300",
                                "expo": -8,
                                "publish_time": 1747489278
                            },
                            "metadata": {
                                "slot": 217547661,
                                "proof_available_time": 1747489280,
                                "prev_publish_time": 1747489278
                            }
                        },
                        { ...other objects}
                    ]
                }
            */

            const rawPriceUpdates = apiResponse.parsed ?? [];

            if (rawPriceUpdates.length === 0) {
                // This log was being hit due to the incorrect access above
                console.log("No price updates received from API after parsing.");
                return { count: 0, status: "success", message: "No price updates from API after parsing." };
            }

            const allPriceRecords = [];
            for (const row of rawPriceUpdates) {
                // row.id is the feed ID from the API response
                const coinId = priceFeedIdtoCoinIdMap[row.id];

                if (!coinId) {
                    console.warn(`Unknown price feed ID received: ${row.id}`);
                    continue;
                }
                const p = row.price;
                if (!p || typeof p.price === 'undefined' || typeof p.expo === 'undefined' || typeof p.publish_time === 'undefined') {
                    console.warn(`Skipping ${symbol}: Incomplete price data for symbol ${symbol}:`, row);
                    continue;
                }

                const priceDecimal = new Decimal(p.price).mul(new Decimal(10).pow(new Decimal(p.expo)));
                const priceConf = new Decimal(p.conf).mul(new Decimal(10).pow(new Decimal(p.expo)));

                if(priceConf.dividedBy(priceDecimal).abs().greaterThan(new Decimal(0.02))) {
                    //price is unreliable. skip
                    console.warn(`Skipping ${symbol}: Unreliable price data for symbol ${symbol}:`, row);
                    continue;
                }

                allPriceRecords.push([
                    coinId,                             // record[0] - Int (coinId)
                    priceDecimal,                       // record[1] - Decimal instance
                    priceConf,                          // record[2] - Decimal instance
                    new Date(p.publish_time * 1000),    // record[3] - JS Date object for publish_time
                ]);
            }

            if (allPriceRecords.length === 0) {
                console.log("No valid price data to upsert after filtering.");
                return { count: 0, status: "success", message: "No valid data to upsert." };
            }

            console.log('ALL_PRICE_RECORDS', JSON.stringify(allPriceRecords));
            // Using Prisma $transaction for the upsert
            await db.$transaction(async (tx) => {

                const upsertQuery = Prisma.sql`
                    INSERT INTO coin_price (coin_id, price_usd, conf_usd, publish_time, updated_at)
                    VALUES ${Prisma.join(
                        allPriceRecords.map(row => Prisma.sql`(
                            ${row[0]}, ${row[1]}, ${row[2]}, ${row[3]}, now()::timestamp
                        )`)
                    )}
                    ON CONFLICT (coin_id) DO UPDATE
                    SET
                        price_usd = EXCLUDED.price_usd,
                        conf_usd = EXCLUDED.conf_usd,
                        publish_time = EXCLUDED.publish_time,
                        updated_at = now()::timestamp;
                `;

                await tx.$executeRaw(upsertQuery);

            }, {
                maxWait: 10000, // Default
                timeout: 30000, // Default
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable // Example isolation level
            });

            console.log(`${allPriceRecords.length} prices processed for upsert via raw SQL.`);
            return {
                count: allPriceRecords.length,
                status: "success",
                message: `${allPriceRecords.length} prices processed for upsert.`
            };

        } catch (error) {
            console.error("Failed to update prices with Prisma raw SQL:", error);
            throw error; // Re-throw to allow higher-level error handling
        }
    }


}

export default new CoinPriceService();
