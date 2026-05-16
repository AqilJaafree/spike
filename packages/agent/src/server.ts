import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
// Load root .env (two levels up from packages/agent). Safe to call before any env reads.
loadEnv({ path: resolve(process.cwd(), '../../.env') });

import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { router } from './routes/index.js';

const PORT = parseInt(process.env.AGENT_PORT ?? '3001');
const ALLOWED_ORIGINS = (process.env.AGENT_ALLOWED_ORIGINS ?? 'http://localhost:3000,http://localhost:3001').split(',');

function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const key = process.env.AGENT_API_KEY;
  if (!key) return next();
  if (req.headers['x-agent-api-key'] !== key) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

const app: Express = express();
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json());
app.use('/api/agent', (req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/health') return next();
  requireApiKey(req, res, next);
}, router);

app.listen(PORT, () => {
  console.log(`Spike agent service running on :${PORT}`);
});

export default app;
