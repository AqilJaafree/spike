import express from 'express';
import cors from 'cors';
import { router } from './routes/index.js';

const PORT = parseInt(process.env.AGENT_PORT ?? '3001');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/agent', router);

app.listen(PORT, () => {
  console.log(`Spike agent service running on :${PORT}`);
});

export default app;
