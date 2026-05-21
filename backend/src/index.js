import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { pool } from './db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'changeme_in_production';

app.use(cors());
app.use(express.json());

// ── Helpers ───────────────────────────────────────────────────

const toBoolean = (v, fb = false) => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  return fb;
};

const query = async (sql, params = []) => {
  const [rows] = await pool.execute(sql, params);
  return rows;
};

const addColumnIfMissing = async (table, column, definition) => {
  const rows = await query(
    `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  if (parseInt(rows[0].count) === 0) {
    await pool.execute(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }
};

// ── Auth Middleware ───────────────────────────────────────────

const requireAuth = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try { req.user = jwt.verify(auth.slice(7), JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid or expired token' }); }
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
};

// ── Schema ────────────────────────────────────────────────────

const ensureSchema = async () => {
  // Config tables
  await pool.execute(`CREATE TABLE IF NOT EXISTS zones (
    id CHAR(36) PRIMARY KEY, name VARCHAR(100) NOT NULL, description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS sub_zones (
    id CHAR(36) PRIMARY KEY, zone_id CHAR(36) NOT NULL, name VARCHAR(100) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS boxes (
    id CHAR(36) PRIMARY KEY, sub_zone_id CHAR(36), zone_id CHAR(36), name VARCHAR(100) NOT NULL, location TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS connection_types (
    id CHAR(36) PRIMARY KEY, name VARCHAR(100) NOT NULL, description VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS client_types (
    id CHAR(36) PRIMARY KEY, name VARCHAR(100) NOT NULL, description VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS protocol_types (
    id CHAR(36) PRIMARY KEY, name VARCHAR(100) NOT NULL, description VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS isp_packages (
    id CHAR(36) PRIMARY KEY, name VARCHAR(100) NOT NULL, mikrotik_profile VARCHAR(100) NOT NULL,
    speed_down VARCHAR(50), speed_up VARCHAR(50), monthly_bill DECIMAL(10,2) DEFAULT 0,
    description TEXT, is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS mikrotik_servers (
    id CHAR(36) PRIMARY KEY, name VARCHAR(100) NOT NULL, host VARCHAR(255) NOT NULL, port INT DEFAULT 8728,
    username VARCHAR(100) NOT NULL, password TEXT NOT NULL, use_tls BOOLEAN DEFAULT FALSE,
    allow_insecure BOOLEAN DEFAULT FALSE, is_default BOOLEAN DEFAULT FALSE, enabled BOOLEAN DEFAULT TRUE,
    last_sync_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS resellers (
    id CHAR(36) PRIMARY KEY, name VARCHAR(100) NOT NULL, contact_person VARCHAR(100),
    email VARCHAR(100), phone VARCHAR(20), commission_rate DECIMAL(5,2) DEFAULT 15.00,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS users (
    id CHAR(36) PRIMARY KEY, username VARCHAR(100) NOT NULL UNIQUE,
    profile VARCHAR(50), status VARCHAR(20) DEFAULT 'active', expiry_date DATE,
    location VARCHAR(100), reseller VARCHAR(100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS locations (
    id CHAR(36) PRIMARY KEY, name VARCHAR(100) NOT NULL, address TEXT,
    type VARCHAR(20) DEFAULT 'region', parent_id CHAR(36),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS billing (
    id CHAR(36) PRIMARY KEY, user_id CHAR(36), invoice_number VARCHAR(50) UNIQUE,
    amount DECIMAL(10,2), status VARCHAR(20) DEFAULT 'pending', due_date DATE, paid_date DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS bill_collections (
    id CHAR(36) PRIMARY KEY, bill_id CHAR(36), user_id CHAR(36), invoice_number VARCHAR(50),
    billing_month VARCHAR(7), monthly_bill DECIMAL(10,2) DEFAULT 0, received_amount DECIMAL(10,2) DEFAULT 0,
    vat DECIMAL(10,2) DEFAULT 0, discount DECIMAL(10,2) DEFAULT 0, balance_due DECIMAL(10,2) DEFAULT 0,
    advance DECIMAL(10,2) DEFAULT 0, payment_method VARCHAR(50), note TEXT,
    received_by VARCHAR(100), approved_by VARCHAR(100),
    transaction_status ENUM('pending','approved','rejected') DEFAULT 'pending',
    collection_date DATE NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS auth_users (
    id CHAR(36) PRIMARY KEY, username VARCHAR(100) NOT NULL UNIQUE, password_hash TEXT NOT NULL,
    role ENUM('admin','reseller') NOT NULL DEFAULT 'reseller', reseller_id CHAR(36),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS billing_packages (
    id CHAR(36) PRIMARY KEY, name VARCHAR(100) NOT NULL, mikrotik_profile VARCHAR(100) NOT NULL,
    price DECIMAL(10,2) DEFAULT 0, duration_days INT DEFAULT 30, reseller_id CHAR(36),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);

  // Migrations — add new columns to existing tables
  const migrations = [
    // users: ISP client fields
    ['users', 'full_name',           'VARCHAR(150)'],
    ['users', 'mobile',              'VARCHAR(20)'],
    ['users', 'address',             'TEXT'],
    ['users', 'zone_id',             'CHAR(36)'],
    ['users', 'sub_zone_id',         'CHAR(36)'],
    ['users', 'box_id',              'CHAR(36)'],
    ['users', 'connection_type_id',  'CHAR(36)'],
    ['users', 'client_type_id',      'CHAR(36)'],
    ['users', 'protocol_type_id',    'CHAR(36)'],
    ['users', 'package_id',          'CHAR(36)'],
    ['users', 'pppoe_password',      'VARCHAR(100)'],
    ['users', 'billing_package',     'VARCHAR(100)'],
    ['users', 'billing_price',       'DECIMAL(10,2)'],
    ['users', 'monthly_bill',        'DECIMAL(10,2)'],
    ['users', 'mac_address',         'VARCHAR(17)'],
    ['users', 'server_id',           'CHAR(36)'],
    ['users', 'billing_date',        'TINYINT DEFAULT 1'],
    ['users', 'billing_status',      "VARCHAR(20) DEFAULT 'active'"],
    ['users', 'mikrotik_status',     "VARCHAR(20) DEFAULT 'unknown'"],
    ['users', 'is_left',             'BOOLEAN DEFAULT FALSE'],
    ['users', 'left_date',           'DATE'],
    ['users', 'reseller_id',         'CHAR(36)'],
    ['users', 'notes',               'TEXT'],
    // billing: enhanced fields
    ['billing', 'invoice_number',    'VARCHAR(50)'],
    ['billing', 'billing_month',     'VARCHAR(7)'],
    ['billing', 'received_amount',   'DECIMAL(10,2) DEFAULT 0'],
    ['billing', 'vat',               'DECIMAL(10,2) DEFAULT 0'],
    ['billing', 'discount',          'DECIMAL(10,2) DEFAULT 0'],
    ['billing', 'balance_due',       'DECIMAL(10,2) DEFAULT 0'],
    ['billing', 'advance',           'DECIMAL(10,2) DEFAULT 0'],
    ['billing', 'billing_date_expiry','DATE'],
    ['billing', 'payment_method',    'VARCHAR(50)'],
    ['billing', 'received_by',       'VARCHAR(100)'],
    ['billing', 'approved_by',       'VARCHAR(100)'],
    ['billing', 'note',              'TEXT'],
    ['billing', 'transaction_status',"VARCHAR(20) DEFAULT 'pending'"],
    ['billing', 'discount_reason',   'VARCHAR(255)'],
    ['billing', 'is_withdrawn',      'BOOLEAN DEFAULT FALSE'],
    ['billing', 'withdrawn_at',      'DATETIME'],
    ['billing', 'withdrawn_by',      'VARCHAR(100)'],
    ['billing', 'updated_at',        'DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'],
    // resellers
    ['resellers', 'commission_rate', 'DECIMAL(5,2) DEFAULT 15.00'],
    ['resellers', 'updated_at',      'DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'],
    // locations
    ['locations', 'type',            "VARCHAR(20) DEFAULT 'region'"],
    ['locations', 'parent_id',       'CHAR(36)'],
    ['locations', 'updated_at',      'DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'],
  ];
  for (const [t, c, d] of migrations) await addColumnIfMissing(t, c, d);

  // Seed default config data if empty
  const zoneCount = await query('SELECT COUNT(*) as n FROM zones');
  if (parseInt(zoneCount[0].n) === 0) {
    for (const z of ['Dhaka North', 'Dhaka South', 'Mirpur', 'Uttara']) {
      await pool.execute('INSERT INTO zones (id, name) VALUES (?, ?)', [uuidv4(), z]);
    }
  }
  const connCount = await query('SELECT COUNT(*) as n FROM connection_types');
  if (parseInt(connCount[0].n) === 0) {
    for (const [n, d] of [['Optical Fiber','FTTH/FTTB'],['Cable','Coaxial'],['Wireless','PTP wireless']]) {
      await pool.execute('INSERT INTO connection_types (id, name, description) VALUES (?, ?, ?)', [uuidv4(), n, d]);
    }
  }
  const ctCount = await query('SELECT COUNT(*) as n FROM client_types');
  if (parseInt(ctCount[0].n) === 0) {
    for (const [n, d] of [['Home','Residential'],['Corporate','Business'],['Waiver','Free/staff account']]) {
      await pool.execute('INSERT INTO client_types (id, name, description) VALUES (?, ?, ?)', [uuidv4(), n, d]);
    }
  }
  const pkgCount = await query('SELECT COUNT(*) as n FROM isp_packages');
  if (parseInt(pkgCount[0].n) === 0) {
    const pkgs = [
      ['10 Mbps Home','10M','10M','2M',500],
      ['20 Mbps Home','20M','20M','5M',800],
      ['50 Mbps Home','50M','50M','10M',1200],
      ['100 Mbps Corp','100M','100M','20M',2500],
    ];
    for (const [n,p,sd,su,mb] of pkgs) {
      await pool.execute('INSERT INTO isp_packages (id, name, mikrotik_profile, speed_down, speed_up, monthly_bill) VALUES (?, ?, ?, ?, ?, ?)', [uuidv4(),n,p,sd,su,mb]);
    }
  }

  // Default admin account
  const admins = await query("SELECT id FROM auth_users WHERE role = 'admin' LIMIT 1");
  if (admins.length === 0) {
    const hash = await bcrypt.hash('Admin@1234', 10);
    await pool.execute("INSERT INTO auth_users (id, username, password_hash, role) VALUES (?, 'admin', ?, 'admin')", [uuidv4(), hash]);
    console.log('Default admin created — username: admin  password: Admin@1234');
  }
};

// ── MikroTik Helpers ──────────────────────────────────────────

const safeServerFields = `id, name, host, port, username, use_tls, allow_insecure, is_default, enabled, last_sync_at, created_at, updated_at`;

const getMikrotikServer = async (id) => {
  const rows = await query('SELECT * FROM mikrotik_servers WHERE id = ?', [id]);
  return rows[0] || null;
};

const mikrotikRequest = async (server, path, options = {}) => {
  const { method = 'GET', body } = options;
  const protocol = server.use_tls ? 'https' : 'http';
  const url = `${protocol}://${server.host}:${server.port}/rest${path}`;
  const auth = Buffer.from(`${server.username}:${server.password}`).toString('base64');
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 10000);
  try {
    const r = await fetch(url, {
      method, signal: controller.signal,
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let parsed; try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { message: text }; }
    if (!r.ok) throw new Error(`MikroTik API error (${r.status}): ${parsed?.detail || parsed?.message || text}`);
    return parsed;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('MikroTik connection timed out (10s)');
    throw e;
  } finally { clearTimeout(tid); }
};

const fetchMikrotikProfiles = async (server) => {
  const profiles = await mikrotikRequest(server, '/ppp/profile');
  return (Array.isArray(profiles) ? profiles.filter(p => p?.name) : []).map(p => ({
    name: p.name, rate_limit: p['rate-limit'] || p.rate_limit || '', comment: p.comment || '',
  }));
};

const importUsersFromMikrotik = async (server, resellerId = null, usernames = null) => {
  const secrets = await mikrotikRequest(server, '/ppp/secret');
  let valid = Array.isArray(secrets) ? secrets.filter(s => s?.name) : [];
  if (usernames && Array.isArray(usernames)) {
    const set = new Set(usernames);
    valid = valid.filter(s => set.has(s.name));
  }
  const existing = new Set((await query('SELECT username FROM users')).map(r => r.username));
  let created = 0, updated = 0;
  for (const s of valid) {
    const isDisabled = s.disabled === true || s.disabled === 'true';
    const status = isDisabled ? 'disabled' : 'active';
    const prof = s.profile || 'default';
    const pass = s.password || '';
    if (existing.has(s.name)) {
      updated++;
      await pool.execute(
        `UPDATE users SET profile=?, billing_package=?, pppoe_password=?, status=?, server_id=?
         WHERE username=?`,
        [prof, prof, pass, status, server.id, s.name]
      );
    } else {
      created++;
      existing.add(s.name);
      await pool.execute(
        `INSERT INTO users (id, username, profile, billing_package, pppoe_password, status, server_id, reseller_id)
         VALUES (?,?,?,?,?,?,?,?)`,
        [uuidv4(), s.name, prof, prof, pass, status, server.id, resellerId]
      );
    }
  }
  return { totalRemoteUsers: valid.length, created, updated };
};

const pushUsersToMikrotik = async (server, resellerId = null) => {
  const clauses = ['(server_id = ? OR server_id IS NULL)'];
  const params = [server.id];
  if (resellerId) { clauses.push('reseller_id = ?'); params.push(resellerId); }
  const local = await query(
    `SELECT username, profile, pppoe_password, status FROM users WHERE ${clauses.join(' AND ')}`,
    params
  );
  const secrets = await mikrotikRequest(server, '/ppp/secret');
  const remoteMap = new Map((Array.isArray(secrets) ? secrets : []).map(s => [s.name, s]));
  let created = 0, updated = 0, skipped = 0;
  for (const u of local) {
    const remote = remoteMap.get(u.username);
    const disabled = u.status !== 'active';
    const prof = u.profile || 'default';
    const pass = u.pppoe_password || '';
    const comment = disabled ? 'Suspended' : 'Active';
    if (!remote) {
      // PUT to create — matches RouterOS REST API spec
      const body = { name: u.username, service: 'pppoe', profile: prof, disabled, comment };
      if (pass) body.password = pass;
      await mikrotikRequest(server, '/ppp/secret', { method: 'PUT', body });
      created++;
    } else {
      const rd = remote.disabled === true || remote.disabled === 'true';
      const profileMatch = (remote.profile || 'default') === prof;
      const statusMatch = rd === disabled;
      if (profileMatch && statusMatch) { skipped++; continue; }
      // PATCH by internal .id — supported on all RouterOS versions
      await mikrotikRequest(server, `/ppp/secret/${encodeURIComponent(remote['.id'])}`, {
        method: 'PATCH',
        body: { profile: prof, disabled, comment },
      });
      updated++;
    }
  }
  return { totalLocalUsers: local.length, created, updated, skipped };
};

// Push a single user to its assigned MikroTik server immediately (app data takes priority)
const syncSingleUserToMikrotik = async (user) => {
  try {
    let server = user.server_id ? await getMikrotikServer(user.server_id) : null;
    if (!server) {
      const rows = await query('SELECT * FROM mikrotik_servers WHERE is_default=1 AND enabled=1 LIMIT 1');
      server = rows[0] || null;
    }
    if (!server || !server.enabled) return;

    const disabled = user.status !== 'active';
    const prof = user.profile || 'default';
    const comment = disabled ? 'Suspended' : 'Active';

    // Check if secret already exists on router
    const found = await mikrotikRequest(server, `/ppp/secret?name=${encodeURIComponent(user.username)}`);
    const existing = Array.isArray(found) ? found.find(s => s.name === user.username) : null;

    if (existing) {
      // PATCH by internal .id — supported on all RouterOS versions
      const body = { profile: prof, disabled, comment };
      if (user.pppoe_password) body.password = user.pppoe_password;
      await mikrotikRequest(server, `/ppp/secret/${encodeURIComponent(existing['.id'])}`, { method: 'PATCH', body });
    } else {
      // PUT to create new secret
      const body = { name: user.username, service: 'pppoe', profile: prof, disabled, comment };
      if (user.pppoe_password) body.password = user.pppoe_password;
      await mikrotikRequest(server, '/ppp/secret', { method: 'PUT', body });
    }
    await pool.execute("UPDATE users SET mikrotik_status='synced' WHERE id=?", [user.id]);
  } catch (e) {
    console.error(`[MikroTik] sync failed for ${user.username}:`, e.message);
    await pool.execute("UPDATE users SET mikrotik_status='error' WHERE id=?", [user.id]).catch(() => {});
  }
};

// Delete a single user from MikroTik when removed from the app
const deleteSingleUserFromMikrotik = async (username, serverId) => {
  try {
    let server = serverId ? await getMikrotikServer(serverId) : null;
    if (!server) {
      const rows = await query('SELECT * FROM mikrotik_servers WHERE is_default=1 AND enabled=1 LIMIT 1');
      server = rows[0] || null;
    }
    if (!server || !server.enabled) return;
    // Find the internal .id first, then remove via POST /ppp/secret/remove
    const found = await mikrotikRequest(server, `/ppp/secret?name=${encodeURIComponent(username)}`);
    const existing = Array.isArray(found) ? found.find(s => s.name === username) : null;
    if (!existing) return; // already absent on router
    await mikrotikRequest(server, '/ppp/secret/remove', { method: 'POST', body: { '.id': existing['.id'] } });
    console.log(`[MikroTik] Deleted user: ${username}`);
  } catch (e) {
    console.error(`[MikroTik] delete failed for ${username}:`, e.message);
  }
};

// Disable all users whose expiry_date has passed — runs on startup and every hour
const disableExpiredUsers = async () => {
  try {
    const expired = await query(
      `SELECT id, username, profile, pppoe_password, server_id FROM users
       WHERE expiry_date IS NOT NULL AND expiry_date < CURDATE() AND status = 'active'`
    );
    if (expired.length === 0) return;
    console.log(`[Expiry] Disabling ${expired.length} expired user(s)`);
    for (const u of expired) {
      await pool.execute(
        "UPDATE users SET status='disabled', billing_status='suspended' WHERE id=?", [u.id]
      );
      syncSingleUserToMikrotik({ ...u, status: 'disabled' });
    }
  } catch (e) {
    console.error('[Expiry] Check failed:', e.message);
  }
};

// ── Invoice Number ────────────────────────────────────────────

const generateInvoiceNumber = async () => {
  const yr = new Date().getFullYear();
  // Use MAX of the numeric suffix so deletes or concurrent inserts don't cause duplicates
  const rows = await query(
    `SELECT MAX(CAST(SUBSTRING_INDEX(invoice_number, '-', -1) AS UNSIGNED)) AS max_n
     FROM billing WHERE invoice_number LIKE ?`,
    [`INV-${yr}-%`]
  );
  const next = (parseInt(rows[0].max_n) || 0) + 1;
  return `INV-${yr}-${next.toString().padStart(6, '0')}`;
};

// ── Health ────────────────────────────────────────────────────

app.get('/health', (_, res) => res.json({ status: 'ok', service: 'backend-api' }));

// ══════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
    const rows = await query('SELECT * FROM auth_users WHERE username = ?', [username]);
    if (!rows.length || !await bcrypt.compare(password, rows[0].password_hash))
      return res.status(401).json({ error: 'Invalid credentials' });
    const u = rows[0];
    let reseller_name = null;
    if (u.reseller_id) {
      const r = await query('SELECT name FROM resellers WHERE id=?', [u.reseller_id]);
      reseller_name = r[0]?.name || null;
    }
    const token = jwt.sign({ id: u.id, username: u.username, role: u.role, reseller_id: u.reseller_id }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: u.id, username: u.username, role: u.role, reseller_id: u.reseller_id, reseller_name } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const rows = await query('SELECT id, username, role, reseller_id FROM auth_users WHERE id = ?', [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const u = rows[0];
    if (u.reseller_id) {
      const r = await query('SELECT name FROM resellers WHERE id=?', [u.reseller_id]);
      u.reseller_name = r[0]?.name || null;
    }
    res.json(u);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/auth/password', requireAuth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) return res.status(400).json({ error: 'Both passwords required' });
    const rows = await query('SELECT * FROM auth_users WHERE id = ?', [req.user.id]);
    if (!await bcrypt.compare(current_password, rows[0].password_hash))
      return res.status(401).json({ error: 'Current password is incorrect' });
    await pool.execute('UPDATE auth_users SET password_hash=? WHERE id=?', [await bcrypt.hash(new_password, 10), req.user.id]);
    res.json({ message: 'Password updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
// DASHBOARD STATS
// ══════════════════════════════════════════════════════════════

app.get('/api/stats', requireAuth, requireAdmin, async (req, res) => {
  try {
    const month = new Date().toISOString().slice(0, 7); // YYYY-MM
    const thisMonthStart = `${month}-01`;

    const [
      total, running, inactive, waiver, newClients,
      online, blocked, left, paid, unpaid, partial,
      billExpired, billingClients, totalRevenue, pending,
    ] = await Promise.all([
      query('SELECT COUNT(*) as n FROM users WHERE is_left = 0 OR is_left IS NULL'),
      query("SELECT COUNT(*) as n FROM users WHERE status='active' AND (is_left=0 OR is_left IS NULL) AND billing_status='active'"),
      query("SELECT COUNT(*) as n FROM users WHERE status='disabled' OR billing_status='suspended'"),
      query("SELECT COUNT(*) as n FROM users WHERE client_type_id IN (SELECT id FROM client_types WHERE name='Waiver') OR billing_status='waiver'"),
      query('SELECT COUNT(*) as n FROM users WHERE created_at >= ?', [thisMonthStart]),
      query("SELECT COUNT(*) as n FROM users WHERE mikrotik_status='online'"),
      query("SELECT COUNT(*) as n FROM users WHERE mikrotik_status='blocked' OR (status='disabled' AND billing_status='suspended')"),
      query('SELECT COUNT(*) as n FROM users WHERE is_left=1'),
      query("SELECT COUNT(*) as n FROM billing WHERE status='paid' AND created_at>=?", [thisMonthStart]),
      query("SELECT COUNT(*) as n FROM billing WHERE status IN ('pending','overdue') AND received_amount=0 AND created_at>=?", [thisMonthStart]),
      query("SELECT COUNT(*) as n FROM billing WHERE status='pending' AND received_amount>0 AND received_amount<amount AND created_at>=?", [thisMonthStart]),
      query("SELECT COUNT(*) as n FROM users WHERE expiry_date < CURDATE() AND status='active'"),
      query('SELECT COUNT(DISTINCT user_id) as n FROM billing WHERE billing_month=?', [month]),
      query("SELECT COALESCE(SUM(received_amount),0) as total FROM billing WHERE status='paid'"),
      query("SELECT COUNT(*) as n, COALESCE(SUM(amount),0) as amount FROM billing WHERE status='pending'"),
    ]);

    res.json({
      totalClients:    parseInt(total[0].n),
      runningClients:  parseInt(running[0].n),
      inactiveClients: parseInt(inactive[0].n),
      waiverClients:   parseInt(waiver[0].n),
      newClients:      parseInt(newClients[0].n),
      onlineClients:   parseInt(online[0].n),
      blockedClients:  parseInt(blocked[0].n),
      leftClients:     parseInt(left[0].n),
      paidClients:     parseInt(paid[0].n),
      unpaidClients:   parseInt(unpaid[0].n),
      partialPaid:     parseInt(partial[0].n),
      billDateExpire:  parseInt(billExpired[0].n),
      billingClients:  parseInt(billingClients[0].n),
      totalRevenue:    parseFloat(totalRevenue[0].total),
      pendingCount:    parseInt(pending[0].n),
      pendingAmount:   parseFloat(pending[0].amount),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/stats/report', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [total, active, disabled, byZone, monthlyRevenue, byPayment, pendingInvoices] = await Promise.all([
      query('SELECT COUNT(*) as n FROM users'),
      query("SELECT COUNT(*) as n FROM users WHERE status='active'"),
      query("SELECT COUNT(*) as n FROM users WHERE status='disabled'"),
      query(`SELECT z.name, COUNT(u.id) as clients, SUM(u.status='active') as active
             FROM zones z LEFT JOIN users u ON u.zone_id=z.id GROUP BY z.id,z.name ORDER BY clients DESC`),
      query("SELECT COALESCE(SUM(received_amount),0) as total FROM billing WHERE status='paid'"),
      query(`SELECT payment_method as method, COALESCE(SUM(received_amount),0) as amount, COUNT(*) as n
             FROM billing WHERE status='paid' AND payment_method IS NOT NULL GROUP BY payment_method ORDER BY amount DESC`),
      query("SELECT COUNT(*) as n, COALESCE(SUM(amount),0) as amount FROM billing WHERE status='pending'"),
    ]);
    res.json({
      totalUsers: parseInt(total[0].n), activeUsers: parseInt(active[0].n), disabledUsers: parseInt(disabled[0].n),
      byZone: byZone.map(r => ({ name: r.name, clients: parseInt(r.clients), active: parseInt(r.active||0) })),
      monthlyRevenue: parseFloat(monthlyRevenue[0].total),
      byPaymentMethod: byPayment.map(r => ({ method: r.method, amount: parseFloat(r.amount), count: parseInt(r.n) })),
      pendingInvoices: { count: parseInt(pendingInvoices[0].n), amount: parseFloat(pendingInvoices[0].amount) },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
// CONFIGURATION — Generic factory
// ══════════════════════════════════════════════════════════════

const configTable = (tableName, nameField = 'name') => {
  app.get(`/api/config/${tableName}`, requireAuth, async (req, res) => {
    try { res.json(await query(`SELECT * FROM ${tableName} ORDER BY ${nameField}`)); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post(`/api/config/${tableName}`, requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = uuidv4();
      const cols = Object.keys(req.body).filter(k => k !== 'id');
      if (!cols.includes(nameField)) return res.status(400).json({ error: `${nameField} is required` });
      await pool.execute(
        `INSERT INTO ${tableName} (id, ${cols.join(',')}) VALUES (?, ${cols.map(() => '?').join(',')})`,
        [id, ...cols.map(c => req.body[c])]
      );
      res.status(201).json((await query(`SELECT * FROM ${tableName} WHERE id=?`, [id]))[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.put(`/api/config/${tableName}/:id`, requireAuth, requireAdmin, async (req, res) => {
    try {
      const cols = Object.keys(req.body).filter(k => k !== 'id');
      if (!cols.length) return res.status(400).json({ error: 'Nothing to update' });
      await pool.execute(
        `UPDATE ${tableName} SET ${cols.map(c => `${c}=?`).join(',')} WHERE id=?`,
        [...cols.map(c => req.body[c]), req.params.id]
      );
      res.json((await query(`SELECT * FROM ${tableName} WHERE id=?`, [req.params.id]))[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.delete(`/api/config/${tableName}/:id`, requireAuth, requireAdmin, async (req, res) => {
    try {
      const [r] = await pool.execute(`DELETE FROM ${tableName} WHERE id=?`, [req.params.id]);
      if (r.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
      res.json({ message: 'Deleted' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
};

configTable('zones');
configTable('sub_zones');
configTable('boxes');
configTable('connection_types');
configTable('client_types');
configTable('protocol_types');
configTable('isp_packages');

// sub_zones filtered by zone
app.get('/api/config/zones/:id/sub-zones', requireAuth, async (req, res) => {
  try { res.json(await query('SELECT * FROM sub_zones WHERE zone_id=? ORDER BY name', [req.params.id])); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
// MIKROTIK SERVERS
// ══════════════════════════════════════════════════════════════

app.get('/api/mikrotik/servers', requireAuth, async (req, res) => {
  try { res.json(await query(`SELECT ${safeServerFields} FROM mikrotik_servers ORDER BY created_at DESC`)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/mikrotik/servers', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, host, port=8728, username, password, use_tls=false, allow_insecure=false, is_default=false, enabled=true } = req.body;
    if (!name||!host||!username||!password) return res.status(400).json({ error: 'name, host, username, password required' });
    const id = uuidv4();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      if (toBoolean(is_default)) await conn.execute('UPDATE mikrotik_servers SET is_default=FALSE WHERE is_default=TRUE');
      await conn.execute(
        `INSERT INTO mikrotik_servers (id,name,host,port,username,password,use_tls,allow_insecure,is_default,enabled) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [id,name,host,port,username,password,toBoolean(use_tls),toBoolean(allow_insecure),toBoolean(is_default),toBoolean(enabled,true)]
      );
      await conn.commit();
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
    res.status(201).json((await query(`SELECT ${safeServerFields} FROM mikrotik_servers WHERE id=?`,[id]))[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/mikrotik/servers/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const s = await getMikrotikServer(req.params.id);
    if (!s) return res.status(404).json({ error: 'Server not found' });
    const { name=s.name,host=s.host,port=s.port,username=s.username,password,use_tls=s.use_tls,allow_insecure=s.allow_insecure,is_default=s.is_default,enabled=s.enabled } = req.body;
    const pw = password?.trim() ? password : s.password;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      if (toBoolean(is_default)) await conn.execute('UPDATE mikrotik_servers SET is_default=FALSE WHERE is_default=TRUE AND id<>?',[req.params.id]);
      await conn.execute(`UPDATE mikrotik_servers SET name=?,host=?,port=?,username=?,password=?,use_tls=?,allow_insecure=?,is_default=?,enabled=? WHERE id=?`,
        [name,host,port,username,pw,toBoolean(use_tls),toBoolean(allow_insecure),toBoolean(is_default),toBoolean(enabled,true),req.params.id]);
      await conn.commit();
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
    res.json((await query(`SELECT ${safeServerFields} FROM mikrotik_servers WHERE id=?`,[req.params.id]))[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/mikrotik/servers/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [r] = await pool.execute('DELETE FROM mikrotik_servers WHERE id=?',[req.params.id]);
    if (r.affectedRows===0) return res.status(404).json({ error: 'Server not found' });
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/mikrotik/servers/:id/test', requireAuth, async (req, res) => {
  try {
    const s = await getMikrotikServer(req.params.id);
    if (!s) return res.status(404).json({ error: 'Server not found' });
    const identity = await mikrotikRequest(s, '/system/identity');
    res.json({ status: 'connected', server: { id:s.id,name:s.name,host:s.host }, identity });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/mikrotik/servers/:id/profiles', requireAuth, async (req, res) => {
  try {
    const s = await getMikrotikServer(req.params.id);
    if (!s) return res.status(404).json({ error: 'Server not found' });
    res.json(await fetchMikrotikProfiles(s));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Preview: returns remote PPPoE secrets annotated with whether they exist locally
app.get('/api/mikrotik/servers/:id/preview-import', requireAuth, requireAdmin, async (req, res) => {
  try {
    const s = await getMikrotikServer(req.params.id);
    if (!s) return res.status(404).json({ error: 'Server not found' });
    const secrets = await mikrotikRequest(s, '/ppp/secret');
    const valid = Array.isArray(secrets) ? secrets.filter(x => x?.name) : [];
    const localMap = new Map(
      (await query('SELECT username, server_id FROM users')).map(r => [r.username, r])
    );
    const users = valid.map(s => ({
      username:  s.name,
      profile:   s.profile || 'default',
      password:  s.password || '',
      disabled:  s.disabled === true || s.disabled === 'true',
      exists_locally: localMap.has(s.name),
      same_server:    localMap.get(s.name)?.server_id === req.params.id,
    }));
    res.json({ total: users.length, users });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/mikrotik/servers/:id/import-users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const s = await getMikrotikServer(req.params.id);
    if (!s) return res.status(404).json({ error: 'Server not found' });
    const usernames = req.body?.usernames || null; // optional filter: import only these
    const result = await importUsersFromMikrotik(s, null, usernames);
    await pool.execute('UPDATE mikrotik_servers SET last_sync_at=NOW() WHERE id=?', [s.id]);
    res.json({ message: 'Import completed', ...result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/mikrotik/servers/:id/sync', requireAuth, requireAdmin, async (req, res) => {
  try {
    const s = await getMikrotikServer(req.params.id);
    if (!s) return res.status(404).json({ error: 'Server not found' });
    const dir = req.body?.direction || 'both';
    const pull = (dir==='pull'||dir==='both') ? await importUsersFromMikrotik(s) : null;
    const push = (dir==='push'||dir==='both') ? await pushUsersToMikrotik(s) : null;
    await pool.execute('UPDATE mikrotik_servers SET last_sync_at=NOW() WHERE id=?', [s.id]);
    res.json({ message: 'Sync completed', direction: dir, pull, push });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
// CLIENTS (users table with ISP fields)
// ══════════════════════════════════════════════════════════════

const clientSelect = `
  u.*,
  z.name  AS zone_name,
  sz.name AS sub_zone_name,
  b.name  AS box_name,
  ct.name AS connection_type_name,
  clt.name AS client_type_name,
  pkg.name AS package_name,
  pkg.speed_down, pkg.speed_up,
  pkg.monthly_bill AS package_monthly_bill,
  srv.name AS server_name
`;

const clientJoins = `
  FROM users u
  LEFT JOIN zones z          ON u.zone_id = z.id
  LEFT JOIN sub_zones sz     ON u.sub_zone_id = sz.id
  LEFT JOIN boxes b          ON u.box_id = b.id
  LEFT JOIN connection_types ct  ON u.connection_type_id = ct.id
  LEFT JOIN client_types clt     ON u.client_type_id = clt.id
  LEFT JOIN isp_packages pkg     ON u.package_id = pkg.id
  LEFT JOIN mikrotik_servers srv ON u.server_id = srv.id
`;

app.get('/api/clients', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { search, zone_id, status, billing_status, is_left } = req.query;
    const conditions = [];
    const params = [];
    if (search) { conditions.push('(u.username LIKE ? OR u.full_name LIKE ? OR u.mobile LIKE ?)'); const s=`%${search}%`; params.push(s,s,s); }
    if (zone_id) { conditions.push('u.zone_id=?'); params.push(zone_id); }
    if (status)  { conditions.push('u.status=?');  params.push(status); }
    if (billing_status) { conditions.push('u.billing_status=?'); params.push(billing_status); }
    if (is_left !== undefined) { conditions.push('u.is_left=?'); params.push(is_left==='1'?1:0); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    res.json(await query(`SELECT ${clientSelect} ${clientJoins} ${where} ORDER BY u.created_at DESC`, params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/clients/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const rows = await query(`SELECT ${clientSelect} ${clientJoins} WHERE u.id=?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Client not found' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/clients', requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      username, pppoe_password, full_name, mobile, address,
      zone_id, sub_zone_id, box_id, connection_type_id, client_type_id, protocol_type_id, package_id,
      profile, billing_package, billing_price, monthly_bill, mac_address, server_id,
      billing_date, billing_status='active', status='active', expiry_date, notes,
      location, reseller, reseller_id,
    } = req.body;
    if (!username) return res.status(400).json({ error: 'username is required' });
    const id = uuidv4();
    // If package_id provided, pull monthly_bill from it
    let mb = monthly_bill;
    if (package_id && !mb) {
      const pkg = await query('SELECT monthly_bill FROM isp_packages WHERE id=?', [package_id]);
      mb = pkg[0]?.monthly_bill;
    }
    await pool.execute(`INSERT INTO users
      (id,username,pppoe_password,full_name,mobile,address,zone_id,sub_zone_id,box_id,
       connection_type_id,client_type_id,protocol_type_id,package_id,
       profile,billing_package,billing_price,monthly_bill,mac_address,server_id,
       billing_date,billing_status,status,expiry_date,notes,location,reseller,reseller_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id,username,pppoe_password||null,full_name||null,mobile||null,address||null,
       zone_id||null,sub_zone_id||null,box_id||null,
       connection_type_id||null,client_type_id||null,protocol_type_id||null,package_id||null,
       profile||null,billing_package||profile||null,billing_price||null,mb||null,
       mac_address||null,server_id||null,
       billing_date||1,billing_status,status,expiry_date||null,notes||null,
       location||null,reseller||null,reseller_id||null]
    );
    const rows = await query(`SELECT ${clientSelect} ${clientJoins} WHERE u.id=?`, [id]);
    res.status(201).json(rows[0]);
    // Fire-and-forget: sync to MikroTik after responding (app data is source of truth)
    syncSingleUserToMikrotik({ id, username, pppoe_password: pppoe_password||null, profile: profile||null, status, server_id: server_id||null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/clients/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      username, pppoe_password, full_name, mobile, address,
      zone_id, sub_zone_id, box_id, connection_type_id, client_type_id, protocol_type_id, package_id,
      profile, billing_package, billing_price, monthly_bill, mac_address, server_id,
      billing_date, billing_status, mikrotik_status, status, expiry_date, notes,
      location, reseller, reseller_id, is_left, left_date,
    } = req.body;
    await pool.execute(`UPDATE users SET
      username=COALESCE(?,username), pppoe_password=COALESCE(?,pppoe_password),
      full_name=COALESCE(?,full_name), mobile=COALESCE(?,mobile), address=COALESCE(?,address),
      zone_id=COALESCE(?,zone_id), sub_zone_id=COALESCE(?,sub_zone_id), box_id=COALESCE(?,box_id),
      connection_type_id=COALESCE(?,connection_type_id), client_type_id=COALESCE(?,client_type_id),
      protocol_type_id=COALESCE(?,protocol_type_id), package_id=COALESCE(?,package_id),
      profile=COALESCE(?,profile), billing_package=COALESCE(?,billing_package),
      billing_price=COALESCE(?,billing_price), monthly_bill=COALESCE(?,monthly_bill),
      mac_address=COALESCE(?,mac_address), server_id=COALESCE(?,server_id),
      billing_date=COALESCE(?,billing_date), billing_status=COALESCE(?,billing_status),
      mikrotik_status=COALESCE(?,mikrotik_status), status=COALESCE(?,status),
      expiry_date=COALESCE(?,expiry_date), notes=COALESCE(?,notes),
      location=COALESCE(?,location), reseller=COALESCE(?,reseller), reseller_id=COALESCE(?,reseller_id),
      is_left=COALESCE(?,is_left), left_date=COALESCE(?,left_date)
      WHERE id=?`,
      [username||null,pppoe_password||null,full_name||null,mobile||null,address||null,
       zone_id||null,sub_zone_id||null,box_id||null,
       connection_type_id||null,client_type_id||null,protocol_type_id||null,package_id||null,
       profile||null,billing_package||null,billing_price||null,monthly_bill||null,
       mac_address||null,server_id||null,billing_date||null,billing_status||null,
       mikrotik_status||null,status||null,expiry_date||null,notes||null,
       location||null,reseller||null,reseller_id||null,
       is_left!==undefined?is_left:null,left_date||null,
       req.params.id]
    );
    const rows = await query(`SELECT ${clientSelect} ${clientJoins} WHERE u.id=?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Client not found' });
    res.json(rows[0]);
    // Fire-and-forget: sync updated client to MikroTik (app data is source of truth)
    const u = rows[0];
    syncSingleUserToMikrotik({ id: u.id, username: u.username, pppoe_password: u.pppoe_password, profile: u.profile, status: u.status, server_id: u.server_id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/clients/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    // Capture user info before deletion so we can mirror to MikroTik
    const before = await query('SELECT username, server_id FROM users WHERE id=?', [req.params.id]);
    const [r] = await pool.execute('DELETE FROM users WHERE id=?', [req.params.id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Client not found' });
    res.json({ message: 'Client deleted' });
    // Fire-and-forget: remove from MikroTik after responding
    if (before.length > 0) deleteSingleUserFromMikrotik(before[0].username, before[0].server_id);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Legacy /api/users (keep for reseller portal compatibility)
app.get('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try { res.json(await query('SELECT * FROM users ORDER BY created_at DESC')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const rows = await query('SELECT * FROM users WHERE id=?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username,profile,billing_package,billing_price,status='active',expiry_date,location,reseller,reseller_id } = req.body;
    if (!username) return res.status(400).json({ error: 'username required' });
    const id = uuidv4();
    await pool.execute('INSERT INTO users (id,username,profile,billing_package,billing_price,status,expiry_date,location,reseller,reseller_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [id,username,profile,billing_package||profile,billing_price||null,status,expiry_date||null,location||null,reseller||null,reseller_id||null]);
    res.status(201).json((await query('SELECT * FROM users WHERE id=?',[id]))[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username,profile,billing_package,billing_price,status='active',expiry_date,location,reseller,reseller_id } = req.body;
    const [r] = await pool.execute('UPDATE users SET username=?,profile=?,billing_package=?,billing_price=?,status=?,expiry_date=?,location=?,reseller=?,reseller_id=? WHERE id=?',
      [username,profile,billing_package||profile,billing_price||null,status,expiry_date||null,location||null,reseller||null,reseller_id||null,req.params.id]);
    if (r.affectedRows===0) return res.status(404).json({ error: 'User not found' });
    res.json((await query('SELECT * FROM users WHERE id=?',[req.params.id]))[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [r] = await pool.execute('DELETE FROM users WHERE id=?',[req.params.id]);
    if (r.affectedRows===0) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
// BILLING — Admin
// ══════════════════════════════════════════════════════════════

const billSelect = `b.*, u.username as customer, u.full_name as customer_name, u.mobile as customer_mobile`;
const billJoin   = `FROM billing b LEFT JOIN users u ON b.user_id=u.id`;

// Auto-generate pending invoices for all active billing users for a given month.
// Skips users that already have an invoice for that month.
const generateMonthlyInvoices = async (month) => {
  const bm = month || new Date().toISOString().slice(0, 7);
  const users = await query(
    `SELECT id, monthly_bill FROM users
     WHERE billing_status='active' AND (is_left=0 OR is_left IS NULL) AND monthly_bill > 0`
  );
  let created = 0, skipped = 0;
  for (const u of users) {
    const existing = await query('SELECT id FROM billing WHERE user_id=? AND billing_month=?', [u.id, bm]);
    if (existing.length > 0) { skipped++; continue; }
    const id = uuidv4();
    const amt = Number(u.monthly_bill);
    await pool.execute(
      `INSERT INTO billing (id,user_id,invoice_number,billing_month,amount,received_amount,vat,discount,balance_due,status)
       VALUES (?,?,?,?,?,0,0,0,?,?)`,
      [id, u.id, await generateInvoiceNumber(), bm, amt, amt, 'pending']
    );
    created++;
  }
  console.log(`[Billing] Auto-generate ${bm}: created=${created}, skipped=${skipped}`);
  return { created, skipped, total: users.length, month: bm };
};

app.get('/api/billing', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { month, status, zone_id } = req.query;
    const cond = []; const params = [];
    if (month)   { cond.push('b.billing_month=?'); params.push(month); }
    if (status)  { cond.push('b.status=?');        params.push(status); }
    if (zone_id) { cond.push('u.zone_id=?');       params.push(zone_id); }
    const where = cond.length ? 'WHERE '+cond.join(' AND ') : '';
    res.json(await query(`SELECT ${billSelect} ${billJoin} ${where} ORDER BY b.created_at DESC`, params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/billing', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { user_id, amount, status='pending', due_date, paid_date, payment_method, billing_month, vat=0, discount=0, discount_reason, note, received_by } = req.body;
    if (!user_id||!amount) return res.status(400).json({ error: 'user_id and amount required' });
    if (Number(discount) > 0 && !discount_reason?.trim()) return res.status(400).json({ error: 'Discount reason is required when applying a discount' });
    const id = uuidv4();
    const bm = billing_month || new Date().toISOString().slice(0,7);
    const received = status==='paid' ? amount : 0;
    const balance = amount - received - Number(discount);
    await pool.execute(
      `INSERT INTO billing (id,user_id,invoice_number,billing_month,amount,received_amount,vat,discount,discount_reason,balance_due,status,due_date,paid_date,payment_method,note,received_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id,user_id,await generateInvoiceNumber(),bm,amount,received,vat,discount,discount_reason||null,balance,status,due_date||null,paid_date||null,payment_method||null,note||null,received_by||null]);
    res.status(201).json((await query(`SELECT ${billSelect} ${billJoin} WHERE b.id=?`,[id]))[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/billing/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { amount, status, due_date, paid_date, payment_method, received_amount, vat, discount, note, approved_by } = req.body;
    const [r] = await pool.execute(`UPDATE billing SET
      amount=COALESCE(?,amount), status=COALESCE(?,status),
      due_date=COALESCE(?,due_date), paid_date=?, payment_method=COALESCE(?,payment_method),
      received_amount=COALESCE(?,received_amount), vat=COALESCE(?,vat),
      discount=COALESCE(?,discount), note=COALESCE(?,note), approved_by=COALESCE(?,approved_by)
      WHERE id=?`,
      [amount||null,status||null,due_date||null,paid_date||null,payment_method||null,
       received_amount||null,vat||null,discount||null,note||null,approved_by||null,req.params.id]);
    if (r.affectedRows===0) return res.status(404).json({ error: 'Invoice not found' });
    res.json((await query(`SELECT ${billSelect} ${billJoin} WHERE b.id=?`,[req.params.id]))[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/billing/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [r] = await pool.execute('DELETE FROM billing WHERE id=?',[req.params.id]);
    if (r.affectedRows===0) return res.status(404).json({ error: 'Invoice not found' });
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Bulk generate pending invoices for all active billing users for a given month
app.post('/api/billing/generate', requireAuth, requireAdmin, async (req, res) => {
  try {
    const month = req.body?.month || new Date().toISOString().slice(0, 7);
    const result = await generateMonthlyInvoices(month);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Billable clients dashboard — all active billing clients with their invoice for the month
app.get('/api/billing/clients', requireAuth, requireAdmin, async (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const rows = await query(`
      SELECT
        u.id, u.username, u.full_name, u.mobile,
        u.monthly_bill, u.billing_status, u.status,
        z.name  AS zone_name,
        pkg.name AS package_name,
        b.id            AS invoice_id,
        b.invoice_number,
        b.amount,
        b.received_amount,
        b.balance_due,
        b.vat,
        b.discount,
        b.status        AS invoice_status,
        b.payment_method,
        b.paid_date
      FROM users u
      LEFT JOIN zones z         ON u.zone_id = z.id
      LEFT JOIN isp_packages pkg ON u.package_id = pkg.id
      LEFT JOIN billing b
        ON b.user_id = u.id AND b.billing_month = ?
      WHERE u.billing_status = 'active'
        AND (u.is_left = 0 OR u.is_left IS NULL)
      ORDER BY u.username ASC
    `, [month]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Quick-pay: create invoice (if needed) and mark paid in one step
app.post('/api/billing/quick-pay', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { user_id, month, amount, payment_method, received_by, vat = 0, discount = 0, discount_reason, note } = req.body;
    if (!user_id || !amount || !payment_method) return res.status(400).json({ error: 'user_id, amount, and payment_method required' });
    if (Number(discount) > 0 && !discount_reason?.trim()) return res.status(400).json({ error: 'Discount reason is required when applying a discount' });
    const bm = month || new Date().toISOString().slice(0, 7);
    const today = new Date().toISOString().split('T')[0];
    const received = Number(amount) - Number(discount);
    const balance = 0;

    const existing = await query('SELECT id FROM billing WHERE user_id=? AND billing_month=?', [user_id, bm]);
    let invoiceId;
    if (existing.length > 0) {
      invoiceId = existing[0].id;
      await pool.execute(
        `UPDATE billing SET status='paid', received_amount=?, balance_due=0, vat=?,
         discount=?, discount_reason=COALESCE(?,discount_reason),
         paid_date=?, payment_method=?, received_by=COALESCE(?,received_by), is_withdrawn=0
         WHERE id=?`,
        [received, vat, discount, discount_reason || null, today, payment_method, received_by || null, invoiceId]);
    } else {
      invoiceId = uuidv4();
      await pool.execute(
        `INSERT INTO billing
         (id,user_id,invoice_number,billing_month,amount,received_amount,vat,discount,discount_reason,balance_due,status,paid_date,payment_method,note,received_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [invoiceId, user_id, await generateInvoiceNumber(), bm, amount, received, vat, discount, discount_reason || null, balance, 'paid', today, payment_method, note || null, received_by || null]);
    }
    res.json((await query(`SELECT ${billSelect} ${billJoin} WHERE b.id=?`, [invoiceId]))[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Billing history for a single client
app.get('/api/clients/:id/billing-history', requireAuth, requireAdmin, async (req, res) => {
  try {
    const rows = await query(
      `SELECT b.*, u.username as customer, u.full_name as customer_name
       FROM billing b LEFT JOIN users u ON b.user_id = u.id
       WHERE b.user_id = ? ORDER BY b.billing_month DESC, b.created_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Withdraw (reverse) a billing invoice — sets back to pending, clears payment
app.post('/api/billing/:id/withdraw', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { withdrawn_by, reason } = req.body;
    const rows = await query('SELECT * FROM billing WHERE id=?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Invoice not found' });
    const inv = rows[0];
    if (inv.is_withdrawn) return res.status(400).json({ error: 'Already withdrawn' });
    await pool.execute(
      `UPDATE billing SET status='pending', received_amount=0, balance_due=amount,
       paid_date=NULL, payment_method=NULL, is_withdrawn=1,
       withdrawn_at=NOW(), withdrawn_by=?, note=CONCAT(COALESCE(note,''), ' [Withdrawn: ', ?, ']')
       WHERE id=?`,
      [withdrawn_by || 'admin', reason || '', req.params.id]
    );
    res.json((await query(`SELECT ${billSelect} ${billJoin} WHERE b.id=?`, [req.params.id]))[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Bill stats summary
app.get('/api/billing/stats', requireAuth, requireAdmin, async (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0,7);
    const [paid, unpaid, received, due, generated, advance] = await Promise.all([
      query("SELECT COUNT(*) as n FROM billing WHERE status='paid' AND billing_month=?", [month]),
      query("SELECT COUNT(*) as n FROM billing WHERE status IN ('pending','overdue') AND billing_month=?", [month]),
      query("SELECT COALESCE(SUM(received_amount),0) as t FROM billing WHERE billing_month=?", [month]),
      query("SELECT COALESCE(SUM(balance_due),0) as t FROM billing WHERE status!='paid' AND billing_month=?", [month]),
      query("SELECT COUNT(*) as n FROM billing WHERE billing_month=?", [month]),
      query("SELECT COALESCE(SUM(advance),0) as t FROM billing WHERE billing_month=?", [month]),
    ]);
    res.json({
      paidClients: parseInt(paid[0].n), unpaidClients: parseInt(unpaid[0].n),
      receivedBill: parseFloat(received[0].t), dueAmount: parseFloat(due[0].t),
      generatedBill: parseInt(generated[0].n), advanceAmount: parseFloat(advance[0].t),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Bill Collections (Daily) ──────────────────────────────────

app.get('/api/billing/collections', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { from, to, received_by, payment_method, transaction_status } = req.query;
    const cond = []; const params = [];
    if (from) { cond.push('c.collection_date>=?'); params.push(from); }
    if (to)   { cond.push('c.collection_date<=?'); params.push(to); }
    if (received_by) { cond.push('c.received_by LIKE ?'); params.push(`%${received_by}%`); }
    if (payment_method) { cond.push('c.payment_method=?'); params.push(payment_method); }
    if (transaction_status) { cond.push('c.transaction_status=?'); params.push(transaction_status); }
    const where = cond.length ? 'WHERE '+cond.join(' AND ') : '';
    const rows = await query(`
      SELECT c.*, u.username, u.full_name, u.mobile
      FROM bill_collections c LEFT JOIN users u ON c.user_id=u.id
      ${where} ORDER BY c.collection_date DESC, c.created_at DESC
    `, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/billing/collections', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { user_id, monthly_bill, received_amount, vat=0, discount=0, payment_method, note, received_by, collection_date, billing_month } = req.body;
    if (!user_id||!received_amount) return res.status(400).json({ error: 'user_id and received_amount required' });
    const id = uuidv4();
    const balance = (Number(monthly_bill)||0) - Number(received_amount) - Number(discount);
    const bm = billing_month || new Date().toISOString().slice(0,7);
    const invNo = await generateInvoiceNumber();
    const cd = collection_date || new Date().toISOString().split('T')[0];
    await pool.execute(`INSERT INTO bill_collections (id,user_id,invoice_number,billing_month,monthly_bill,received_amount,vat,discount,balance_due,payment_method,note,received_by,transaction_status,collection_date)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'pending',?)`,
      [id,user_id,invNo,bm,monthly_bill||0,received_amount,vat,discount,balance<0?0:balance,payment_method||null,note||null,received_by||null,cd]);
    res.status(201).json((await query(`SELECT c.*,u.username,u.full_name FROM bill_collections c LEFT JOIN users u ON c.user_id=u.id WHERE c.id=?`,[id]))[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/billing/collections/:id/approve', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { approved_by } = req.body;
    const [r] = await pool.execute("UPDATE bill_collections SET transaction_status='approved', approved_by=? WHERE id=?", [approved_by||req.user.username, req.params.id]);
    if (r.affectedRows===0) return res.status(404).json({ error: 'Collection not found' });
    res.json((await query('SELECT * FROM bill_collections WHERE id=?',[req.params.id]))[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/billing/collections/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [r] = await pool.execute('DELETE FROM bill_collections WHERE id=?',[req.params.id]);
    if (r.affectedRows===0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/billing/collections/stats', requireAuth, requireAdmin, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const [received, discount, due] = await Promise.all([
      query("SELECT COALESCE(SUM(received_amount),0) as t FROM bill_collections WHERE collection_date=?", [date]),
      query("SELECT COALESCE(SUM(discount),0) as t FROM bill_collections WHERE collection_date=?", [date]),
      query("SELECT COALESCE(SUM(balance_due),0) as t FROM bill_collections WHERE collection_date=?", [date]),
    ]);
    res.json({ received: parseFloat(received[0].t), discount: parseFloat(discount[0].t), due: parseFloat(due[0].t) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
// RESELLERS
// ══════════════════════════════════════════════════════════════

app.get('/api/resellers', requireAuth, requireAdmin, async (req, res) => {
  try { res.json(await query('SELECT * FROM resellers ORDER BY name')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/resellers', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name,contact_person,email,phone,commission_rate=15 } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const id = uuidv4();
    await pool.execute('INSERT INTO resellers (id,name,contact_person,email,phone,commission_rate) VALUES (?,?,?,?,?,?)',
      [id,name,contact_person||null,email||null,phone||null,commission_rate]);
    res.status(201).json((await query('SELECT * FROM resellers WHERE id=?',[id]))[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/resellers/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name,contact_person,email,phone,commission_rate } = req.body;
    const [r] = await pool.execute('UPDATE resellers SET name=COALESCE(?,name),contact_person=COALESCE(?,contact_person),email=COALESCE(?,email),phone=COALESCE(?,phone),commission_rate=COALESCE(?,commission_rate) WHERE id=?',
      [name||null,contact_person||null,email||null,phone||null,commission_rate||null,req.params.id]);
    if (r.affectedRows===0) return res.status(404).json({ error: 'Reseller not found' });
    res.json((await query('SELECT * FROM resellers WHERE id=?',[req.params.id]))[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/resellers/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [r] = await pool.execute('DELETE FROM resellers WHERE id=?',[req.params.id]);
    if (r.affectedRows===0) return res.status(404).json({ error: 'Reseller not found' });
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/resellers/:id/credentials', requireAuth, requireAdmin, async (req, res) => {
  try {
    const reseller = (await query('SELECT * FROM resellers WHERE id=?',[req.params.id]))[0];
    if (!reseller) return res.status(404).json({ error: 'Reseller not found' });
    const pw = req.body.password || (Math.random().toString(36).slice(-8)+'A1!');
    const un = req.body.username || (reseller.email || reseller.name.toLowerCase().replace(/\s+/g,'.'));
    const hash = await bcrypt.hash(pw, 10);
    const existing = await query('SELECT id FROM auth_users WHERE reseller_id=?',[req.params.id]);
    if (existing.length) {
      await pool.execute('UPDATE auth_users SET username=?,password_hash=? WHERE reseller_id=?',[un,hash,req.params.id]);
    } else {
      await pool.execute("INSERT INTO auth_users (id,username,password_hash,role,reseller_id) VALUES (?,?,?,'reseller',?)",[uuidv4(),un,hash,req.params.id]);
    }
    res.json({ username: un, password: pw, message: 'Credentials set.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/resellers/:id/credentials', requireAuth, requireAdmin, async (req, res) => {
  try {
    const rows = await query('SELECT id,username,created_at,updated_at FROM auth_users WHERE reseller_id=?',[req.params.id]);
    res.json(rows.length ? rows[0] : null);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
// LOCATIONS (legacy)
// ══════════════════════════════════════════════════════════════

app.get('/api/locations', requireAuth, requireAdmin, async (req, res) => {
  try { res.json(await query('SELECT * FROM locations ORDER BY type,name')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/locations', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name,address,type='region',parent_id } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const id = uuidv4();
    await pool.execute('INSERT INTO locations (id,name,address,type,parent_id) VALUES (?,?,?,?,?)',[id,name,address||null,type,parent_id||null]);
    res.status(201).json((await query('SELECT * FROM locations WHERE id=?',[id]))[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/locations/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name,address,type,parent_id } = req.body;
    const [r] = await pool.execute('UPDATE locations SET name=COALESCE(?,name),address=COALESCE(?,address),type=COALESCE(?,type),parent_id=? WHERE id=?',
      [name||null,address||null,type||null,parent_id||null,req.params.id]);
    if (r.affectedRows===0) return res.status(404).json({ error: 'Not found' });
    res.json((await query('SELECT * FROM locations WHERE id=?',[req.params.id]))[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/locations/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [r] = await pool.execute('DELETE FROM locations WHERE id=?',[req.params.id]);
    if (r.affectedRows===0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
// BILLING PACKAGES + RESELLER PORTAL
// ══════════════════════════════════════════════════════════════

app.get('/api/packages', requireAuth, async (req, res) => {
  try {
    const rows = req.user.role==='admin'
      ? await query('SELECT * FROM billing_packages ORDER BY name')
      : await query('SELECT * FROM billing_packages WHERE reseller_id IS NULL OR reseller_id=? ORDER BY name',[req.user.reseller_id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/packages', requireAuth, async (req, res) => {
  try {
    const { name,mikrotik_profile,price=0,duration_days=30 } = req.body;
    if (!name||!mikrotik_profile) return res.status(400).json({ error: 'name and mikrotik_profile required' });
    const id = uuidv4();
    const reseller_id = req.user.role==='admin' ? (req.body.reseller_id||null) : req.user.reseller_id;
    await pool.execute('INSERT INTO billing_packages (id,name,mikrotik_profile,price,duration_days,reseller_id) VALUES (?,?,?,?,?,?)',[id,name,mikrotik_profile,price,duration_days,reseller_id]);
    res.status(201).json((await query('SELECT * FROM billing_packages WHERE id=?',[id]))[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/packages/:id', requireAuth, async (req, res) => {
  try {
    const { name,mikrotik_profile,price,duration_days } = req.body;
    const oc = req.user.role==='admin' ? '' : 'AND reseller_id=?';
    const params = [name||null,mikrotik_profile||null,price||null,duration_days||null,req.params.id,...(req.user.role!=='admin'?[req.user.reseller_id]:[])];
    const [r] = await pool.execute(`UPDATE billing_packages SET name=COALESCE(?,name),mikrotik_profile=COALESCE(?,mikrotik_profile),price=COALESCE(?,price),duration_days=COALESCE(?,duration_days) WHERE id=? ${oc}`,params);
    if (r.affectedRows===0) return res.status(404).json({ error: 'Not found' });
    res.json((await query('SELECT * FROM billing_packages WHERE id=?',[req.params.id]))[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/packages/:id', requireAuth, async (req, res) => {
  try {
    const oc = req.user.role==='admin' ? '' : 'AND reseller_id=?';
    const [r] = await pool.execute(`DELETE FROM billing_packages WHERE id=? ${oc}`,[req.params.id,...(req.user.role!=='admin'?[req.user.reseller_id]:[])]);
    if (r.affectedRows===0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Reseller portal routes
app.get('/api/reseller/stats', requireAuth, async (req, res) => {
  try {
    const rid = req.user.reseller_id; const isAdm = req.user.role==='admin';
    const [tot,act,rev,pend] = await Promise.all([
      isAdm ? query('SELECT COUNT(*) as n FROM users') : query('SELECT COUNT(*) as n FROM users WHERE reseller_id=?',[rid]),
      isAdm ? query("SELECT COUNT(*) as n FROM users WHERE status='active'") : query("SELECT COUNT(*) as n FROM users WHERE reseller_id=? AND status='active'",[rid]),
      isAdm ? query("SELECT COALESCE(SUM(amount),0) as t FROM billing WHERE status='paid'") : query("SELECT COALESCE(SUM(b.amount),0) as t FROM billing b JOIN users u ON b.user_id=u.id WHERE u.reseller_id=? AND b.status='paid'",[rid]),
      isAdm ? query("SELECT COUNT(*) as n,COALESCE(SUM(amount),0) as a FROM billing WHERE status='pending'") : query("SELECT COUNT(*) as n,COALESCE(SUM(b.amount),0) as a FROM billing b JOIN users u ON b.user_id=u.id WHERE u.reseller_id=? AND b.status='pending'",[rid]),
    ]);
    res.json({ totalUsers:parseInt(tot[0].n), activeUsers:parseInt(act[0].n), totalRevenue:parseFloat(rev[0].t), pendingCount:parseInt(pend[0].n), pendingAmount:parseFloat(pend[0].a) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/reseller/users', requireAuth, async (req, res) => {
  try {
    const rows = req.user.role==='admin' ? await query('SELECT * FROM users ORDER BY created_at DESC') : await query('SELECT * FROM users WHERE reseller_id=? ORDER BY created_at DESC',[req.user.reseller_id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/reseller/users', requireAuth, async (req, res) => {
  try {
    const { username,billing_package_id,status='active',expiry_date } = req.body;
    if (!username||!billing_package_id) return res.status(400).json({ error: 'username and billing_package_id required' });
    const pkg = (await query('SELECT * FROM billing_packages WHERE id=?',[billing_package_id]))[0];
    if (!pkg) return res.status(404).json({ error: 'Package not found' });
    const reseller_id = req.user.role==='admin' ? (req.body.reseller_id||null) : req.user.reseller_id;
    let rname = null;
    if (reseller_id) { const r = await query('SELECT name FROM resellers WHERE id=?',[reseller_id]); rname = r[0]?.name; }
    const id = uuidv4();
    const exp = expiry_date || new Date(Date.now()+pkg.duration_days*86400000).toISOString().split('T')[0];
    await pool.execute('INSERT INTO users (id,username,profile,billing_package,billing_price,status,expiry_date,reseller,reseller_id) VALUES (?,?,?,?,?,?,?,?,?)',
      [id,username,pkg.mikrotik_profile,pkg.name,pkg.price,status,exp,rname,reseller_id]);
    res.status(201).json((await query('SELECT * FROM users WHERE id=?',[id]))[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/reseller/users/:id/package', requireAuth, async (req, res) => {
  try {
    const { billing_package_id } = req.body;
    const pkg = (await query('SELECT * FROM billing_packages WHERE id=?',[billing_package_id]))[0];
    if (!pkg) return res.status(404).json({ error: 'Package not found' });
    const oc = req.user.role==='reseller' ? 'AND reseller_id=?' : '';
    const [r] = await pool.execute(`UPDATE users SET profile=?,billing_package=?,billing_price=? WHERE id=? ${oc}`,
      [pkg.mikrotik_profile,pkg.name,pkg.price,req.params.id,...(req.user.role==='reseller'?[req.user.reseller_id]:[])]);
    if (r.affectedRows===0) return res.status(404).json({ error: 'User not found' });
    res.json((await query('SELECT * FROM users WHERE id=?',[req.params.id]))[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/reseller/billing', requireAuth, async (req, res) => {
  try {
    const rows = req.user.role==='admin'
      ? await query('SELECT b.*,u.username as customer FROM billing b LEFT JOIN users u ON b.user_id=u.id ORDER BY b.created_at DESC')
      : await query('SELECT b.*,u.username as customer FROM billing b JOIN users u ON b.user_id=u.id WHERE u.reseller_id=? ORDER BY b.created_at DESC',[req.user.reseller_id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/reseller/billing', requireAuth, async (req, res) => {
  try {
    const { user_id,amount,due_date,payment_method } = req.body;
    if (!user_id||!amount) return res.status(400).json({ error: 'user_id and amount required' });
    if (req.user.role==='reseller') {
      const u = await query('SELECT id FROM users WHERE id=? AND reseller_id=?',[user_id,req.user.reseller_id]);
      if (!u.length) return res.status(403).json({ error: 'User not in your account' });
    }
    const id = uuidv4();
    await pool.execute('INSERT INTO billing (id,user_id,invoice_number,amount,status,due_date,payment_method) VALUES (?,?,?,?,?,?,?)',
      [id,user_id,await generateInvoiceNumber(),amount,'pending',due_date||null,payment_method||null]);
    res.status(201).json((await query('SELECT b.*,u.username as customer FROM billing b LEFT JOIN users u ON b.user_id=u.id WHERE b.id=?',[id]))[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/reseller/billing/:id/pay', requireAuth, async (req, res) => {
  try {
    const { payment_method,paid_date } = req.body;
    const rows = req.user.role==='admin'
      ? await query('SELECT id FROM billing WHERE id=?',[req.params.id])
      : await query('SELECT b.id FROM billing b JOIN users u ON b.user_id=u.id WHERE b.id=? AND u.reseller_id=?',[req.params.id,req.user.reseller_id]);
    if (!rows.length) return res.status(404).json({ error: 'Invoice not found' });
    await pool.execute("UPDATE billing SET status='paid',paid_date=?,payment_method=? WHERE id=?",
      [paid_date||new Date().toISOString().split('T')[0],payment_method||null,req.params.id]);
    res.json((await query('SELECT b.*,u.username as customer FROM billing b LEFT JOIN users u ON b.user_id=u.id WHERE b.id=?',[req.params.id]))[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/reseller/sync', requireAuth, async (req, res) => {
  try {
    const { server_id,direction='push' } = req.body;
    if (!server_id) return res.status(400).json({ error: 'server_id required' });
    const s = await getMikrotikServer(server_id);
    if (!s) return res.status(404).json({ error: 'Server not found' });
    const rid = req.user.role==='admin' ? null : req.user.reseller_id;
    let pull=null,push=null;
    if (direction==='pull'||direction==='both') pull = await importUsersFromMikrotik(s,rid);
    if (direction==='push'||direction==='both') push = await pushUsersToMikrotik(s,rid);
    try {
      const active = await mikrotikRequest(s,'/ppp/active');
      if (Array.isArray(active)) {
        for (const a of active) {
          if (a.name && a['caller-id']) await pool.execute('UPDATE users SET mac_address=?,mikrotik_status=? WHERE username=?',[a['caller-id'],'online',a.name]);
        }
      }
    } catch { /* active sessions may not be accessible */ }
    await pool.execute('UPDATE mikrotik_servers SET last_sync_at=NOW() WHERE id=?',[server_id]);
    res.json({ message:'Sync completed', direction, pull, push });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Bootstrap ─────────────────────────────────────────────────

// Schedule monthly invoice auto-generation at the start of each new month.
const scheduleMonthlyGeneration = () => {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 5, 0); // 1st of next month, 00:05
  const delay = next - now;
  setTimeout(async () => {
    await generateMonthlyInvoices(next.toISOString().slice(0, 7)).catch(e => console.error('[Billing] Auto-gen failed:', e));
    scheduleMonthlyGeneration(); // reschedule for next month
  }, delay);
  console.log(`[Billing] Next auto-generation scheduled: ${next.toISOString()}`);
};

ensureSchema()
  .then(async () => {
    app.listen(PORT, () => console.log(`Backend API on port ${PORT}`));
    // Auto-generate invoices for the current month on startup (idempotent — skips existing)
    await generateMonthlyInvoices(new Date().toISOString().slice(0, 7)).catch(e => console.error('[Billing] Startup auto-gen failed:', e));
    scheduleMonthlyGeneration();
    // Disable expired users immediately on startup, then recheck every hour
    await disableExpiredUsers();
    setInterval(disableExpiredUsers, 60 * 60 * 1000);
  })
  .catch(e => { console.error('Schema init failed:', e); process.exit(1); });
