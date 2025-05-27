import cron from 'node-cron';
import CoinPriceService from './price.service.js';
import { serializeError } from '../middleware/error.middleware.js';

export function startScheduler () {
  cron.schedule(`*/3 * * * *`, () => {
    CoinPriceService.updatePrices()
      .then(data => console.log(`✓ Updated feeds:${data}`))
      .catch(err  => console.error('✗ price sync failed', serializeError(err)));
  });
}
