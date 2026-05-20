import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { pool } from './db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use((err, req, res, next) => {
  console.error('[Error Handler]', err.message);
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
  next(err);
});

const toBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return fallback;
};

const safeServerProjection = `
  id,
  name,
  host,
  port,
  username,
  use_tls,
  allow_insecure,
  is_default,
  enabled,
  last_sync_at,
  created_at,
  updated_at
`;

const ensureSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mikrotik_servers (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(100) NOT NULL,
      host VARCHAR(255) NOT NULL,
      port INTEGER NOT NULL DEFAULT 8728,
      username VARCHAR(100) NOT NULL,
      password TEXT NOT NULL,
      use_tls BOOLEAN DEFAULT FALSE,
      allow_insecure BOOLEAN DEFAULT FALSE,
      is_default BOOLEAN DEFAULT FALSE,
      enabled BOOLEAN DEFAULT TRUE,
      last_sync_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS billing_package VARCHAR(100)`);
  await pool.query(`ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS billing_price DECIMAL(10, 2)`);
  await pool.query(`ALTER TABLE IF EXISTS resellers ADD COLUMN IF NOT EXISTS commission_rate DECIMAL(5,2) DEFAULT 15.00`);
  await pool.query(`ALTER TABLE IF EXISTS resellers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`);
  await pool.query(`ALTER TABLE IF EXISTS locations ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'region'`);
  await pool.query(`ALTER TABLE IF EXISTS locations ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES locations(id) ON DELETE CASCADE`);
  await pool.query(`ALTER TABLE IF EXISTS locations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`);
  await pool.query(`ALTER TABLE IF EXISTS billing ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(50)`);
  await pool.query(`ALTER TABLE IF EXISTS billing ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50)`);
  await pool.query(`ALTER TABLE IF EXISTS billing ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`);
};

const getMikrotikServer = async (serverId) => {
  const result = await pool.query('SELECT * FROM mikrotik_servers WHERE id = $1', [serverId]);
  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0];
};

const buildMikrotikBaseUrl = (server) => {
  const protocol = server.use_tls ? 'https' : 'http';
  return `${protocol}://${server.host}:${server.port}`;
};

const mikrotikRequest = async (server, path, options = {}) => {
  const { method = 'GET', body } = options;
  const url = `${buildMikrotikBaseUrl(server)}/rest${path}`;
  const auth = Buffer.from(`${server.username}:${server.password}`).toString('base64');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { message: text };
    }

    if (!response.ok) {
      const details = parsed?.detail || parsed?.message || text || 'Request failed';
      throw new Error(`MikroTik API error (${response.status}): ${details}`);
    }

    return parsed;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('MikroTik connection timed out (10s) - server may be unreachable or unresponsive');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
};

const mapSecretToLocalUser = (secret) => {
  const isDisabled = secret.disabled === true || secret.disabled === 'true';
  return {
    username: secret.name,
    profile: secret.profile || 'default',
    billing_package: secret.profile || 'default',
    billing_price: null,
    status: isDisabled ? 'disabled' : 'active',
  };
};

const fetchMikrotikProfiles = async (server) => {
  const profiles = await mikrotikRequest(server, '/ppp/profile');
  const validProfiles = Array.isArray(profiles) ? profiles.filter((item) => item?.name) : [];

  return validProfiles.map((profile) => ({
    name: profile.name,
    rate_limit: profile['rate-limit'] || profile.rate_limit || '',
    comment: profile.comment || '',
  }));
};

const importUsersFromMikrotik = async (server) => {
  const secrets = await mikrotikRequest(server, '/ppp/secret');
  const validSecrets = Array.isArray(secrets) ? secrets.filter((item) => item?.name) : [];

  const existingRows = await pool.query('SELECT username FROM users');
  const existingUsernames = new Set(existingRows.rows.map((row) => row.username));

  let created = 0;
  let updated = 0;

  for (const secret of validSecrets) {
    const mapped = mapSecretToLocalUser(secret);

    if (existingUsernames.has(mapped.username)) {
      updated += 1;
    } else {
      created += 1;
      existingUsernames.add(mapped.username);
    }

    await pool.query(
      `
      INSERT INTO users (username, profile, billing_package, billing_price, status)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (username)
      DO UPDATE SET
        profile = EXCLUDED.profile,
        billing_package = EXCLUDED.billing_package,
        billing_price = EXCLUDED.billing_price,
        status = EXCLUDED.status,
        updated_at = NOW()
      `,
      [mapped.username, mapped.profile, mapped.billing_package, mapped.billing_price, mapped.status]
    );
  }

  return {
    totalRemoteUsers: validSecrets.length,
    created,
    updated,
  };
};

const pushUsersToMikrotik = async (server) => {
  const localUsersResult = await pool.query('SELECT username, profile, status FROM users ORDER BY username');
  const localUsers = localUsersResult.rows;

  const secrets = await mikrotikRequest(server, '/ppp/secret');
  const remoteList = Array.isArray(secrets) ? secrets : [];
  const remoteByName = new Map(remoteList.map((secret) => [secret.name, secret]));

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const localUser of localUsers) {
    const remoteUser = remoteByName.get(localUser.username);
    const disabled = localUser.status !== 'active';
    const profileName = localUser.profile || 'default';

    if (!remoteUser) {
      await mikrotikRequest(server, '/ppp/secret', {
        method: 'POST',
        body: {
          name: localUser.username,
          profile: profileName,
          disabled,
        },
      });
      created += 1;
      continue;
    }

    const remoteDisabled = remoteUser.disabled === true || remoteUser.disabled === 'true';
    const needsProfileUpdate = (remoteUser.profile || 'default') !== (localUser.profile || 'default');
    const needsDisabledUpdate = remoteDisabled !== disabled;

    if (!needsProfileUpdate && !needsDisabledUpdate) {
      skipped += 1;
      continue;
    }

    await mikrotikRequest(server, `/ppp/secret/${encodeURIComponent(remoteUser['.id'])}`, {
      method: 'PATCH',
      body: {
        profile: profileName,
        disabled,
      },
    });
    updated += 1;
  }

  return {
    totalLocalUsers: localUsers.length,
    created,
    updated,
    skipped,
  };
};

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'backend-api' });
});

app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/mikrotik/servers', async (req, res) => {
  try {
    const result = await pool.query(`SELECT ${safeServerProjection} FROM mikrotik_servers ORDER BY created_at DESC`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/mikrotik/servers', async (req, res) => {
  try {
    const {
      name,
      host,
      port = 8728,
      username,
      password,
      use_tls = false,
      allow_insecure = false,
      is_default = false,
      enabled = true,
    } = req.body;

    if (!name || !host || !username || !password) {
      return res.status(400).json({ error: 'name, host, username and password are required' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (toBoolean(is_default, false)) {
        await client.query('UPDATE mikrotik_servers SET is_default = FALSE, updated_at = NOW() WHERE is_default = TRUE');
      }

      const result = await client.query(
        `
        INSERT INTO mikrotik_servers (name, host, port, username, password, use_tls, allow_insecure, is_default, enabled)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING ${safeServerProjection}
        `,
        [
          name,
          host,
          port,
          username,
          password,
          toBoolean(use_tls, false),
          toBoolean(allow_insecure, false),
          toBoolean(is_default, false),
          toBoolean(enabled, true),
        ]
      );

      await client.query('COMMIT');
      res.status(201).json(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/mikrotik/servers/:id', async (req, res) => {
  try {
    const server = await getMikrotikServer(req.params.id);
    if (!server) {
      return res.status(404).json({ error: 'MikroTik server not found' });
    }

    const {
      name = server.name,
      host = server.host,
      port = server.port,
      username = server.username,
      password,
      use_tls = server.use_tls,
      allow_insecure = server.allow_insecure,
      is_default = server.is_default,
      enabled = server.enabled,
    } = req.body;

    const nextPassword = password && String(password).trim() ? password : server.password;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (toBoolean(is_default, false)) {
        await client.query(
          'UPDATE mikrotik_servers SET is_default = FALSE, updated_at = NOW() WHERE is_default = TRUE AND id <> $1',
          [req.params.id]
        );
      }

      const result = await client.query(
        `
        UPDATE mikrotik_servers
        SET name = $1,
            host = $2,
            port = $3,
            username = $4,
            password = $5,
            use_tls = $6,
            allow_insecure = $7,
            is_default = $8,
            enabled = $9,
            updated_at = NOW()
        WHERE id = $10
        RETURNING ${safeServerProjection}
        `,
        [
          name,
          host,
          port,
          username,
          nextPassword,
          toBoolean(use_tls, false),
          toBoolean(allow_insecure, false),
          toBoolean(is_default, false),
          toBoolean(enabled, true),
          req.params.id,
        ]
      );

      await client.query('COMMIT');
      res.json(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/mikrotik/servers/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM mikrotik_servers WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'MikroTik server not found' });
    }
    res.json({ message: 'MikroTik server deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/mikrotik/servers/:id/test', async (req, res) => {
  try {
    const server = await getMikrotikServer(req.params.id);
    if (!server) {
      return res.status(404).json({ error: 'MikroTik server not found' });
    }

    console.log(`[Test Connection] Testing server: ${server.name} (${server.host}:${server.port})`);
    const identity = await mikrotikRequest(server, '/system/identity');
    console.log(`[Test Connection] Success for ${server.name}:`, identity);
    res.json({
      status: 'connected',
      server: {
        id: server.id,
        name: server.name,
        host: server.host,
      },
      identity,
    });
  } catch (err) {
    console.error(`[Test Connection] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/mikrotik/servers/:id/profiles', async (req, res) => {
  try {
    const server = await getMikrotikServer(req.params.id);
    if (!server) {
      return res.status(404).json({ error: 'MikroTik server not found' });
    }

    const profiles = await fetchMikrotikProfiles(server);
    res.json(profiles);
  } catch (err) {
    console.error(`[Get Profiles] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/mikrotik/servers/:id/import-users', async (req, res) => {
  try {
    const server = await getMikrotikServer(req.params.id);
    if (!server) {
      return res.status(404).json({ error: 'MikroTik server not found' });
    }

    console.log(`[Import Users] Starting import from ${server.name}`);
    const result = await importUsersFromMikrotik(server);
    console.log(`[Import Users] Completed for ${server.name}:`, result);
    await pool.query('UPDATE mikrotik_servers SET last_sync_at = NOW(), updated_at = NOW() WHERE id = $1', [server.id]);

    res.json({
      message: 'Import completed successfully',
      serverId: server.id,
      ...result,
    });
  } catch (err) {
    console.error(`[Import Users] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/mikrotik/servers/:id/sync', async (req, res) => {
  try {
    const server = await getMikrotikServer(req.params.id);
    if (!server) {
      return res.status(404).json({ error: 'MikroTik server not found' });
    }

    const direction = req.body?.direction || 'both';
    if (!['pull', 'push', 'both'].includes(direction)) {
      return res.status(400).json({ error: 'direction must be one of pull, push, both' });
    }

    let pullResult = null;
    let pushResult = null;

    if (direction === 'pull' || direction === 'both') {
      pullResult = await importUsersFromMikrotik(server);
    }

    if (direction === 'push' || direction === 'both') {
      pushResult = await pushUsersToMikrotik(server);
    }

    await pool.query('UPDATE mikrotik_servers SET last_sync_at = NOW(), updated_at = NOW() WHERE id = $1', [server.id]);

    res.json({
      message: 'Sync completed successfully',
      serverId: server.id,
      direction,
      pull: pullResult,
      push: pushResult,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const {
      username,
      profile,
      billing_package,
      billing_price,
      status = 'active',
      expiry_date,
      location,
      reseller,
    } = req.body;

    if (!username || !profile) {
      return res.status(400).json({ error: 'username and profile are required' });
    }

    const normalizedBillingPrice = billing_price === '' || billing_price === undefined ? null : billing_price;
    const result = await pool.query(
      'INSERT INTO users (username, profile, billing_package, billing_price, status, expiry_date, location, reseller) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [username, profile, billing_package || profile, normalizedBillingPrice, status, expiry_date, location, reseller]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const {
      username,
      profile,
      billing_package,
      billing_price,
      status = 'active',
      expiry_date,
      location,
      reseller,
    } = req.body;

    const normalizedBillingPrice = billing_price === '' || billing_price === undefined ? null : billing_price;
    const result = await pool.query(
      'UPDATE users SET username = $1, profile = $2, billing_package = $3, billing_price = $4, status = $5, expiry_date = $6, location = $7, reseller = $8, updated_at = NOW() WHERE id = $9 RETURNING *',
      [username, profile, billing_package || profile, normalizedBillingPrice, status, expiry_date, location, reseller, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const generateInvoiceNumber = async () => {
  const year = new Date().getFullYear();
  const result = await pool.query(
    `SELECT COUNT(*) as count FROM billing WHERE invoice_number LIKE $1`,
    [`INV-${year}-%`]
  );
  const seq = (parseInt(result.rows[0].count) + 1).toString().padStart(6, '0');
  return `INV-${year}-${seq}`;
};

app.get('/api/billing', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT b.*, u.username as customer
      FROM billing b
      LEFT JOIN users u ON b.user_id = u.id
      ORDER BY b.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/billing', async (req, res) => {
  try {
    const { user_id, amount, status = 'pending', due_date, paid_date, payment_method } = req.body;
    if (!user_id || !amount) {
      return res.status(400).json({ error: 'user_id and amount are required' });
    }
    const invoice_number = await generateInvoiceNumber();
    const result = await pool.query(
      `INSERT INTO billing (user_id, invoice_number, amount, status, due_date, paid_date, payment_method)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *, (SELECT username FROM users WHERE id = $1) as customer`,
      [user_id, invoice_number, amount, status, due_date || null, paid_date || null, payment_method || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/billing/:id', async (req, res) => {
  try {
    const { amount, status, due_date, paid_date, payment_method } = req.body;
    const result = await pool.query(
      `UPDATE billing
       SET amount = COALESCE($1, amount),
           status = COALESCE($2, status),
           due_date = COALESCE($3, due_date),
           paid_date = $4,
           payment_method = COALESCE($5, payment_method),
           updated_at = NOW()
       WHERE id = $6
       RETURNING *, (SELECT username FROM users WHERE id = billing.user_id) as customer`,
      [amount, status, due_date || null, paid_date || null, payment_method, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/billing/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM billing WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Invoice not found' });
    res.json({ message: 'Invoice deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/resellers', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM resellers ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/resellers', async (req, res) => {
  try {
    const { name, contact_person, email, phone, commission_rate = 15.00 } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const result = await pool.query(
      `INSERT INTO resellers (name, contact_person, email, phone, commission_rate)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, contact_person || null, email || null, phone || null, commission_rate]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/resellers/:id', async (req, res) => {
  try {
    const { name, contact_person, email, phone, commission_rate } = req.body;
    const result = await pool.query(
      `UPDATE resellers
       SET name = COALESCE($1, name),
           contact_person = COALESCE($2, contact_person),
           email = COALESCE($3, email),
           phone = COALESCE($4, phone),
           commission_rate = COALESCE($5, commission_rate),
           updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [name, contact_person, email, phone, commission_rate, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Reseller not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/resellers/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM resellers WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Reseller not found' });
    res.json({ message: 'Reseller deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/locations', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM locations ORDER BY type, name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/locations', async (req, res) => {
  try {
    const { name, address, type = 'region', parent_id } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const result = await pool.query(
      `INSERT INTO locations (name, address, type, parent_id) VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, address || null, type, parent_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/locations/:id', async (req, res) => {
  try {
    const { name, address, type, parent_id } = req.body;
    const result = await pool.query(
      `UPDATE locations
       SET name = COALESCE($1, name),
           address = COALESCE($2, address),
           type = COALESCE($3, type),
           parent_id = $4,
           updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [name, address, type, parent_id || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Location not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/locations/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM locations WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Location not found' });
    res.json({ message: 'Location deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const usersResult = await pool.query('SELECT COUNT(*) as count FROM users');
    const activeResult = await pool.query("SELECT COUNT(*) as count FROM users WHERE status = 'active'");
    const expiredResult = await pool.query("SELECT COUNT(*) as count FROM users WHERE status = 'expired'");
    const billingResult = await pool.query("SELECT SUM(amount) as total FROM billing WHERE status = 'paid'");

    res.json({
      totalUsers: parseInt(usersResult.rows[0].count),
      activeUsers: parseInt(activeResult.rows[0].count),
      expiredUsers: parseInt(expiredResult.rows[0].count),
      monthlyRevenue: parseFloat(billingResult.rows[0].total) || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stats/report', async (req, res) => {
  try {
    const [
      totalUsers,
      activeUsers,
      disabledUsers,
      byLocation,
      byReseller,
      monthlyRevenue,
      byPaymentMethod,
      pendingInvoices,
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM users'),
      pool.query("SELECT COUNT(*) as count FROM users WHERE status = 'active'"),
      pool.query("SELECT COUNT(*) as count FROM users WHERE status = 'disabled'"),
      pool.query(`
        SELECT location as name,
          COUNT(*) FILTER (WHERE status = 'active') as active,
          COUNT(*) FILTER (WHERE status != 'active') as disabled
        FROM users WHERE location IS NOT NULL AND location != ''
        GROUP BY location ORDER BY active DESC
      `),
      pool.query(`
        SELECT reseller as name,
          COUNT(*) FILTER (WHERE status = 'active') as active,
          COUNT(*) FILTER (WHERE status != 'active') as disabled
        FROM users WHERE reseller IS NOT NULL AND reseller != ''
        GROUP BY reseller ORDER BY active DESC
      `),
      pool.query("SELECT COALESCE(SUM(amount), 0) as total FROM billing WHERE status = 'paid'"),
      pool.query(`
        SELECT payment_method as method,
          COALESCE(SUM(amount), 0) as amount,
          COUNT(*) as count
        FROM billing WHERE status = 'paid' AND payment_method IS NOT NULL
        GROUP BY payment_method ORDER BY amount DESC
      `),
      pool.query("SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as amount FROM billing WHERE status = 'pending'"),
    ]);

    res.json({
      totalUsers: parseInt(totalUsers.rows[0].count),
      activeUsers: parseInt(activeUsers.rows[0].count),
      disabledUsers: parseInt(disabledUsers.rows[0].count),
      byLocation: byLocation.rows.map((r) => ({ name: r.name, active: parseInt(r.active), disabled: parseInt(r.disabled) })),
      byReseller: byReseller.rows.map((r) => ({ name: r.name, active: parseInt(r.active), disabled: parseInt(r.disabled) })),
      monthlyRevenue: parseFloat(monthlyRevenue.rows[0].total),
      byPaymentMethod: byPaymentMethod.rows.map((r) => ({ method: r.method, amount: parseFloat(r.amount), count: parseInt(r.count) })),
      pendingInvoices: {
        count: parseInt(pendingInvoices.rows[0].count),
        amount: parseFloat(pendingInvoices.rows[0].amount),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

ensureSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Backend API running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize backend schema:', err);
    process.exit(1);
  });