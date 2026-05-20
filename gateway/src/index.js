import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.GATEWAY_PORT || 8080;
const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:3000';

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'api-gateway' });
});

app.use('/api', async (req, res) => {
  const url = `${BACKEND_URL}/api${req.url}`;
  console.log(`[Gateway] ${req.method} ${req.url} -> ${url}`);

  try {
    const options = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      options.body = JSON.stringify(req.body);
    }

    const backendRes = await fetch(url, options);
    const data = await backendRes.text();

    res.status(backendRes.status);
    backendRes.headers.forEach((value, name) => {
      res.setHeader(name, value);
    });

    if (data) {
      res.send(data);
    } else {
      res.end();
    }
  } catch (err) {
    console.error('[Gateway] Error:', err.message);
    res.status(500).json({ error: 'Backend service unavailable', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
  console.log(`Proxying /api requests to ${BACKEND_URL}`);
});