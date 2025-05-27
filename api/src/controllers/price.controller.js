import coinPriceService from '../services/price.service.js';
/**
 * GET /api/v1/price?symbols[]=WBTC&symbols[]=SUI
 * Response: { data: {"WBTC": { price: "68000.23", publish_time: "ISO" }, ... } }
 */
export async function getCoinPrices(req, res, next) {
  try {
    const ids = req.query.ids ?? [];
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids[] query param required' });
    }
    const data = await coinPriceService.getCoinPrices(ids);
    return res.status(200).json({data});
  } catch(e) {
    next(e);
  }
}
