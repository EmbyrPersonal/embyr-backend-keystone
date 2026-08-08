import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth';
import sparkCodeRoutes from './routes/sparkCodes';
import accountRoutes from './routes/account';

const app = express();

const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors(allowedOrigins?.length ? { origin: allowedOrigins } : {}));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'embyr-backend-keystone', time: new Date().toISOString() });
});

app.use('/auth', authRoutes);
app.use('/spark-codes', sparkCodeRoutes);
app.use('/account', accountRoutes);

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`embyr-backend-keystone listening on :${port}`);
});
