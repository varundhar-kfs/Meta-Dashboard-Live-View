import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { platformMiddleware } from './platform-sdk';
import data from './routes/data';

const app = new Hono();

app.use('*', cors());
app.use('*', platformMiddleware);

app.get('/api/health', (c) =>
  c.json({
    status: 'ok',
    app: process.env.APP_NAME ?? 'meta-credit-tower',
    tokenConfigured: Boolean(process.env.META_ACCESS_TOKEN),
    businessIdConfigured: Boolean(process.env.META_BUSINESS_ID),
    apiVersion: process.env.META_API_VERSION ?? 'v23.0',
  }),
);

app.get('/api/me', (c) => c.json({ email: c.get('userEmail') }));

app.route('/', data);

export default app;
