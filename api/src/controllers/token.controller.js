import tokenService from '../services/token.service.js';
/**
 * GET /api/v1/tokens
 * Response: { data: ['WBTC', 'SUI', 'XAUT', 'SOL'] }
 */
export async function getSupportedTokens(_, res, next) {
    try {
        const data = await tokenService.getSupported();
        return res.status(200).json({data});
    } catch(e) {
        next(e);
    }
}
