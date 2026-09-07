import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { platformMiddleware } from './platform-sdk';
import easebuzz from './routes/webhook-easebuzz';
import topups from './routes/topups';
import exposure from './routes/exposure';

const app = new Hono();

app.use('*', cors());
app.use('*', platformMiddleware);

app.get('/api/health', (c) =>
  c.json({
    status: 'ok',
    app: process.env.APP_NAME ?? 'meta-credit-tower',
    metaConfigured: Boolean(process.env.META_ACCESS_TOKEN),
    gatewayConfigured: Boolean(process.env.EASEBUZZ_MERCHANT_KEY && process.env.EASEBUZZ_SALT),
  }),
);

app.get('/api/me', (c) => c.json({ email: c.get('userEmail') }));

app.route('/', easebuzz);
app.route('/', topups);
app.route('/', exposure);

export default app;
