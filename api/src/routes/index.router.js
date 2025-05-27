import priceRouter from './price.router.js';
import tokenRouter from './token.router.js';
import vaultsRouter from './vaults.js';

import cors from 'cors'; // Import cors

export default function initRoutes(app) {
    app.use('/api/v1/', cors());
    app.get('/', (_, res) =>  res.status(200).json({message: 'running'}));
    app.use('/api/v1/', priceRouter);
    app.use('/api/v1/', tokenRouter);
    app.use('/api/v1/', vaultsRouter);
    app.use((_, res) => res.status(404).json({ error: 'Not Found' }));
}
