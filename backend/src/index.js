import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
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

// Execute a parameterized query, return the rows array directly
const query = async (sql, params = []) => {
  const [rows] = await pool.execute(sql, params);
  return rows;
};

const safeServerFields = `
  id, name, host, port, username,
  use_tls, allow_insecure, is_default, enabled,
  last_sync_at, created_at, updated_at
`;

const ensureSchema = async () => {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS mikrotik_servers (
      id CHAR(36) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      host VARCHAR(255) NOT NULL,
      port INT NOT NULL DEFAULT 8728,
      username VARCHAR(100) NOT NULL,
      password TEXT NOT NULL,
      use_tls BOOLEAN DEFAULT FALSE,
      allow_insecure BOOLEAN DEFAULT FALSE,
      is_default BOOLEAN DEFAULT FALSE,
      enabled BOOLEAN DEFAULT TRUE,
      last_sync_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  const alterStmts = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_package VARCHAR(100)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_price DECIMAL(10,2)`,
    `ALTER TABLE resellers ADD COLUMN IF NOT EXISTS commission_rate DECIMAL(5,2) DEFAULT 15.00`,
    `ALTER TABLE resellers ADD COLUMN IF NOT EXISTS updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    `ALTER TABLE locations ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'region'`,
    `ALTER TABLE locations ADD COLUMN IF NOT EXISTS parent_id CHAR(36)`,
    `ALTER TABLE locations ADD COLUMN IF NOT EXISTS updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    `ALTER TABLE billing ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(50)`,
    `ALTER TABLE billing ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50)`,
    `ALTER TABLE billing ADD COLUMN IF NOT EXISTS updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
  ];

  for (const stmt of alterStmts) {
    await pool.execute(stmt);
  }
};

const getMikrotikServer = async (serverId) => {
  const rows = await query('SELECT * FROM mikrotik_servers WHERE id = ?', [serverId]);
  return rows.length === 0 ? null : rows[0];
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
  const timeoutId = setTimeout(() => controller.abort(), 10000);

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

  const existingRows = await query('SELECT username FROM users');
  const existingUsernames = new Set(existingRows.map((row) => row.username));

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

    // ON DUPLICATE KEY UPDATE is MySQL's equivalent of PostgreSQL's ON CONFLICT DO UPDATE
    await pool.execute(
      `INSERT INTO users (id, username, profile, billing_package, billing_price, status)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         profile         = VALUES(profile),
         billing_package = VALUES(billing_package),
         billing_price   = VALUES(billing_price),
         status          = VALUES(status)`,
      [uuidv4(), mapped.username, mapped.profile, mapped.billing_package, mapped.billing_price, mapped.status]
    );
  }

  return { totalRemoteUsers: validSecrets.length, created, updated };
};

const pushUsersToMikrotik = async (server) => {
  const localUsers = await query('SELECT username, profile, status FROM users ORDER BY username');

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
        body: { name: localUser.username, profile: profileName, disabled },
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
      body: { profile: profileName, disabled },
    });
    updated += 1;
  }

  return { totalLocalUsers: localUsers.length, created, updated, skipped };
};

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'backend-api' });
});

// ── MikroTik Servers ──────────────────────────────────────────────────────────

app.get('/api/mikrotik/servers', async (req, res) => {
  try {
    const rows = await query(`SELECT ${safeServerFields} FROM mikrotik_servers ORDER BY created_at DESC`);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/mikrotik/servers', async (req, res) => {
  try {
    const {
      name, host, port = 8728, username, password,
      use_tls = false, allow_insecure = false, is_default = false, enabled = true,
    } = req.body;

    if (!name || !host || !username || !password) {
      return res.status(400).json({ error: 'name, host, username and password are required' });
    }

    const id = uuidv4();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      if (toBoolean(is_default, false)) {
        await conn.execute('UPDATE mikrotik_servers SET is_default = FALSE WHERE is_default = TRUE');
      }
      await conn.execute(
        `INSERT INTO mikrotik_servers (id, name, host, port, username, password, use_tls, allow_insecure, is_default, enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, name, host, port, username, password,
          toBoolean(use_tls, false), toBoolean(allow_insecure, false),
          toBoolean(is_default, false), toBoolean(enabled, true)]
      );
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }

    const rows = await query(`SELECT ${safeServerFields} FROM mikrotik_servers WHERE id = ?`, [id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/mikrotik/servers/:id', async (req, res) => {
  try {
    const server = await getMikrotikServer(req.params.id);
    if (!server) return res.status(404).json({ error: 'MikroTik server not found' });

    const {
      name = server.name, host = server.host, port = server.port,
      username = server.username, password,
      use_tls = server.use_tls, allow_insecure = server.allow_insecure,
      is_default = server.is_default, enabled = server.enabled,
    } = req.body;

    const nextPassword = password && String(password).trim() ? password : server.password;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      if (toBoolean(is_default, false)) {
        await conn.execute(
          'UPDATE mikrotik_servers SET is_default = FALSE WHERE is_default = TRUE AND id <> ?',
          [req.params.id]
        );
      }
      await conn.execute(
        `UPDATE mikrotik_servers
         SET name = ?, host = ?, port = ?, username = ?, password = ?,
             use_tls = ?, allow_insecure = ?, is_default = ?, enabled = ?
         WHERE id = ?`,
        [name, host, port, username, nextPassword,
          toBoolean(use_tls, false), toBoolean(allow_insecure, false),
          toBoolean(is_default, false), toBoolean(enabled, true),
          req.params.id]
      );
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }

    const rows = await query(`SELECT ${safeServerFields} FROM mikrotik_servers WHERE id = ?`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'MikroTik server not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/mikrotik/servers/:id', async (req, res) => {
  try {
    const rows = await query('SELECT id FROM mikrotik_servers WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'MikroTik server not found' });
    await pool.execute('DELETE FROM mikrotik_servers WHERE id = ?', [req.params.id]);
    res.json({ message: 'MikroTik server deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/mikrotik/servers/:id/test', async (req, res) => {
  try {
    const server = await getMikrotikServer(req.params.id);
    if (!server) return res.status(404).json({ error: 'MikroTik server not found' });

    console.log(`[Test Connection] Testing server: ${server.name} (${server.host}:${server.port})`);
    const identity = await mikrotikRequest(server, '/system/identity');
    console.log(`[Test Connection] Success for ${server.name}:`, identity);
    res.json({ status: 'connected', server: { id: server.id, name: server.name, host: server.host }, identity });
  } catch (err) {
    console.error(`[Test Connection] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/mikrotik/servers/:id/profiles', async (req, res) => {
  try {
    const server = await getMikrotikServer(req.params.id);
    if (!server) return res.status(404).json({ error: 'MikroTik server not found' });
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
    if (!server) return res.status(404).json({ error: 'MikroTik server not found' });

    console.log(`[Import Users] Starting import from ${server.name}`);
    const result = await importUsersFromMikrotik(server);
    console.log(`[Import Users] Completed for ${server.name}:`, result);
    await pool.execute('UPDATE mikrotik_servers SET last_sync_at = NOW() WHERE id = ?', [server.id]);

    res.json({ message: 'Import completed successfully', serverId: server.id, ...result });
  } catch (err) {
    console.error(`[Import Users] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/mikrotik/servers/:id/sync', async (req, res) => {
  try {
    const server = await getMikrotikServer(req.params.id);
    if (!server) return res.status(404).json({ error: 'MikroTik server not found' });

    const direction = req.body?.direction || 'both';
    if (!['pull', 'push', 'both'].includes(direction)) {
      return res.status(400).json({ error: 'direction must be one of pull, push, both' });
    }

    let pullResult = null;
    let pushResult = null;

    if (direction === 'pull' || direction === 'both') pullResult = await importUsersFromMikrotik(server);
    if (direction === 'push' || direction === 'both') pushResult = await pushUsersToMikrotik(server);

    await pool.execute('UPDATE mikrotik_servers SET last_sync_at = NOW() WHERE id = ?', [server.id]);

    res.json({ message: 'Sync completed successfully', serverId: server.id, direction, pull: pullResult, push: pushResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Users ─────────────────────────────────────────────────────────────────────

app.get('/api/users', async (req, res) => {
  try {
    res.json(await query('SELECT * FROM users ORDER BY id'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users/:id', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { username, profile, billing_package, billing_price, status = 'active', expiry_date, location, reseller } = req.body;
    if (!username || !profile) return res.status(400).json({ error: 'username and profile are required' });

    const id = uuidv4();
    const normalizedPrice = billing_price === '' || billing_price === undefined ? null : billing_price;
    await pool.execute(
      'INSERT INTO users (id, username, profile, billing_package, billing_price, status, expiry_date, location, reseller) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, username, profile, billing_package || profile, normalizedPrice, status, expiry_date || null, location || null, reseller || null]
    );
    const rows = await query('SELECT * FROM users WHERE id = ?', [id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const { username, profile, billing_package, billing_price, status = 'active', expiry_date, location, reseller } = req.body;
    const normalizedPrice = billing_price === '' || billing_price === undefined ? null : billing_price;
    const [result] = await pool.execute(
      'UPDATE users SET username = ?, profile = ?, billing_package = ?, billing_price = ?, status = ?, expiry_date = ?, location = ?, reseller = ? WHERE id = ?',
      [username, profile, billing_package || profile, normalizedPrice, status, expiry_date || null, location || null, reseller || null, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'User not found' });
    const rows = await query('SELECT * FROM users WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM users WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Billing ───────────────────────────────────────────────────────────────────

const generateInvoiceNumber = async () => {
  const year = new Date().getFullYear();
  const rows = await query(
    `SELECT COUNT(*) as count FROM billing WHERE invoice_number LIKE ?`,
    [`INV-${year}-%`]
  );
  const seq = (parseInt(rows[0].count) + 1).toString().padStart(6, '0');
  return `INV-${year}-${seq}`;
};

app.get('/api/billing', async (req, res) => {
  try {
    const rows = await query(`
      SELECT b.*, u.username as customer
      FROM billing b
      LEFT JOIN users u ON b.user_id = u.id
      ORDER BY b.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/billing', async (req, res) => {
  try {
    const { user_id, amount, status = 'pending', due_date, paid_date, payment_method } = req.body;
    if (!user_id || !amount) return res.status(400).json({ error: 'user_id and amount are required' });

    const id = uuidv4();
    const invoice_number = await generateInvoiceNumber();
    await pool.execute(
      `INSERT INTO billing (id, user_id, invoice_number, amount, status, due_date, paid_date, payment_method)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, user_id, invoice_number, amount, status, due_date || null, paid_date || null, payment_method || null]
    );
    const rows = await query(
      `SELECT b.*, u.username as customer FROM billing b LEFT JOIN users u ON b.user_id = u.id WHERE b.id = ?`,
      [id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/billing/:id', async (req, res) => {
  try {
    const { amount, status, due_date, paid_date, payment_method } = req.body;
    const [result] = await pool.execute(
      `UPDATE billing
       SET amount         = COALESCE(?, amount),
           status         = COALESCE(?, status),
           due_date       = COALESCE(?, due_date),
           paid_date      = ?,
           payment_method = COALESCE(?, payment_method)
       WHERE id = ?`,
      [amount || null, status || null, due_date || null, paid_date || null, payment_method || null, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Invoice not found' });
    const rows = await query(
      `SELECT b.*, u.username as customer FROM billing b LEFT JOIN users u ON b.user_id = u.id WHERE b.id = ?`,
      [req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/billing/:id', async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM billing WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Invoice not found' });
    res.json({ message: 'Invoice deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Resellers ─────────────────────────────────────────────────────────────────

app.get('/api/resellers', async (req, res) => {
  try {
    res.json(await query('SELECT * FROM resellers ORDER BY name'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/resellers', async (req, res) => {
  try {
    const { name, contact_person, email, phone, commission_rate = 15.00 } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const id = uuidv4();
    await pool.execute(
      `INSERT INTO resellers (id, name, contact_person, email, phone, commission_rate) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, name, contact_person || null, email || null, phone || null, commission_rate]
    );
    const rows = await query('SELECT * FROM resellers WHERE id = ?', [id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/resellers/:id', async (req, res) => {
  try {
    const { name, contact_person, email, phone, commission_rate } = req.body;
    const [result] = await pool.execute(
      `UPDATE resellers
       SET name            = COALESCE(?, name),
           contact_person  = COALESCE(?, contact_person),
           email           = COALESCE(?, email),
           phone           = COALESCE(?, phone),
           commission_rate = COALESCE(?, commission_rate)
       WHERE id = ?`,
      [name || null, contact_person || null, email || null, phone || null, commission_rate || null, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Reseller not found' });
    const rows = await query('SELECT * FROM resellers WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/resellers/:id', async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM resellers WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Reseller not found' });
    res.json({ message: 'Reseller deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Locations ─────────────────────────────────────────────────────────────────

app.get('/api/locations', async (req, res) => {
  try {
    res.json(await query('SELECT * FROM locations ORDER BY type, name'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/locations', async (req, res) => {
  try {
    const { name, address, type = 'region', parent_id } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const id = uuidv4();
    await pool.execute(
      `INSERT INTO locations (id, name, address, type, parent_id) VALUES (?, ?, ?, ?, ?)`,
      [id, name, address || null, type, parent_id || null]
    );
    const rows = await query('SELECT * FROM locations WHERE id = ?', [id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/locations/:id', async (req, res) => {
  try {
    const { name, address, type, parent_id } = req.body;
    const [result] = await pool.execute(
      `UPDATE locations
       SET name      = COALESCE(?, name),
           address   = COALESCE(?, address),
           type      = COALESCE(?, type),
           parent_id = ?
       WHERE id = ?`,
      [name || null, address || null, type || null, parent_id || null, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Location not found' });
    const rows = await query('SELECT * FROM locations WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/locations/:id', async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM locations WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Location not found' });
    res.json({ message: 'Location deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Stats ─────────────────────────────────────────────────────────────────────

app.get('/api/stats', async (req, res) => {
  try {
    const [users, active, expired, revenue] = await Promise.all([
      query('SELECT COUNT(*) as count FROM users'),
      query("SELECT COUNT(*) as count FROM users WHERE status = 'active'"),
      query("SELECT COUNT(*) as count FROM users WHERE status = 'expired'"),
      query("SELECT SUM(amount) as total FROM billing WHERE status = 'paid'"),
    ]);
    res.json({
      totalUsers: parseInt(users[0].count),
      activeUsers: parseInt(active[0].count),
      expiredUsers: parseInt(expired[0].count),
      monthlyRevenue: parseFloat(revenue[0].total) || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stats/report', async (req, res) => {
  try {
    // MySQL does not support COUNT(*) FILTER (WHERE ...) — use SUM(condition) instead
    const [
      totalUsers, activeUsers, disabledUsers,
      byLocation, byReseller, monthlyRevenue,
      byPaymentMethod, pendingInvoices,
    ] = await Promise.all([
      query('SELECT COUNT(*) as count FROM users'),
      query("SELECT COUNT(*) as count FROM users WHERE status = 'active'"),
      query("SELECT COUNT(*) as count FROM users WHERE status = 'disabled'"),
      query(`
        SELECT location as name,
          COALESCE(SUM(status = 'active'), 0) as active,
          COALESCE(SUM(status != 'active'), 0) as disabled
        FROM users WHERE location IS NOT NULL AND location != ''
        GROUP BY location ORDER BY active DESC
      `),
      query(`
        SELECT reseller as name,
          COALESCE(SUM(status = 'active'), 0) as active,
          COALESCE(SUM(status != 'active'), 0) as disabled
        FROM users WHERE reseller IS NOT NULL AND reseller != ''
        GROUP BY reseller ORDER BY active DESC
      `),
      query("SELECT COALESCE(SUM(amount), 0) as total FROM billing WHERE status = 'paid'"),
      query(`
        SELECT payment_method as method,
          COALESCE(SUM(amount), 0) as amount,
          COUNT(*) as count
        FROM billing WHERE status = 'paid' AND payment_method IS NOT NULL
        GROUP BY payment_method ORDER BY amount DESC
      `),
      query("SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as amount FROM billing WHERE status = 'pending'"),
    ]);

    res.json({
      totalUsers: parseInt(totalUsers[0].count),
      activeUsers: parseInt(activeUsers[0].count),
      disabledUsers: parseInt(disabledUsers[0].count),
      byLocation: byLocation.map((r) => ({ name: r.name, active: parseInt(r.active), disabled: parseInt(r.disabled) })),
      byReseller: byReseller.map((r) => ({ name: r.name, active: parseInt(r.active), disabled: parseInt(r.disabled) })),
      monthlyRevenue: parseFloat(monthlyRevenue[0].total),
      byPaymentMethod: byPaymentMethod.map((r) => ({ method: r.method, amount: parseFloat(r.amount), count: parseInt(r.count) })),
      pendingInvoices: {
        count: parseInt(pendingInvoices[0].count),
        amount: parseFloat(pendingInvoices[0].amount),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────

ensureSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Backend API running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize schema:', err);
    process.exit(1);
  });
