import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { platformMiddleware } from './platform-sdk';
import data from './routes/data';

/**
 * Bump on every commit that touches api/. /api/health echoes it, which is the
 * only reliable way to tell whether a redeploy actually replaced the API bundle
 * or just the frontend.
 */
const API_BUILD = 'd6a0fa2+gk-theme';

const app = new Hono();

app.use('*', cors());
app.use('*', platformMiddleware);

app.get('/api/health', (c) =>
  c.json({
    status: 'ok',
    apiBuild: API_BUILD,
    app: process.env.APP_NAME ?? 'meta-live-db',
    tokenConfigured: Boolean(process.env.META_ACCESS_TOKEN),
    businessIdConfigured: Boolean(process.env.META_BUSINESS_ID),
    apiVersion: process.env.META_API_VERSION ?? 'v23.0',
  }),
);

app.get('/api/me', (c) => c.json({ email: c.get('userEmail') }));

app.route('/', data);

export default app;
