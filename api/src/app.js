import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { PORT, RATE_LIMIT_RPM } from '../config.js';
import { startScheduler } from './services/scheduler.js';
import initRoutes from './routes/index.router.js';
import initErrorHandler, { serializeError } from './middleware/error.middleware.js';
import cors from 'cors';
const app = express();

/* security + JSON */
app.use(helmet());
// app.enable('trust proxy');
app.disable('x-powered-by');
app.use(express.json());
app.use(cors());

/* rate-limiter */
app.use(
  '/',
  rateLimit({
    windowMs: 60_000,               // 1 min
    max: RATE_LIMIT_RPM,          // 30 req/min
    standardHeaders: true,
    legacyHeaders: false
  })
);

(async function () {
  try {
    initRoutes(app);
    initErrorHandler(app);
    app.listen(PORT, () => {
      console.log(`⇢ API service listening on :${PORT}`);
      startScheduler();
    });
  } catch (e) {
    console.error(serializeError(e));
    process.exit(1);
  }
})();
