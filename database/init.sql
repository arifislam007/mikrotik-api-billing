-- MySQL 8.0+ schema for MikroTik Billing
-- Run: mysql -u billing -p mikrotik_billing < database/init.sql

CREATE TABLE IF NOT EXISTS users (
    id CHAR(36) PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    profile VARCHAR(50),
    billing_package VARCHAR(100),
    billing_price DECIMAL(10, 2),
    status VARCHAR(20) DEFAULT 'active',
    expiry_date DATE,
    location VARCHAR(100),
    reseller VARCHAR(100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS resellers (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    contact_person VARCHAR(100),
    email VARCHAR(100),
    phone VARCHAR(20),
    commission_rate DECIMAL(5,2) DEFAULT 15.00,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS locations (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    address TEXT,
    type VARCHAR(20) DEFAULT 'region',
    parent_id CHAR(36),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_locations_parent FOREIGN KEY (parent_id) REFERENCES locations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS billing (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36),
    invoice_number VARCHAR(50) UNIQUE,
    amount DECIMAL(10, 2),
    status VARCHAR(20) DEFAULT 'pending',
    due_date DATE,
    paid_date DATE,
    payment_method VARCHAR(50),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_billing_user FOREIGN KEY (user_id) REFERENCES users(id)
);

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
);

-- Seed data (INSERT IGNORE skips duplicates on re-run)
INSERT IGNORE INTO users (id, username, profile, status, expiry_date, location, reseller) VALUES
(UUID(), 'user_mike_001',  '10Mbps',  'active',   '2026-06-15', 'Downtown', 'TechNet Solutions'),
(UUID(), 'user_sarah_042', '50Mbps',  'expired',  '2026-05-10', 'Westside', 'ConnectPro'),
(UUID(), 'user_john_089',  '100Mbps', 'active',   '2026-07-22', 'Downtown', 'TechNet Solutions'),
(UUID(), 'user_anna_156',  '20Mbps',  'disabled', '2026-06-30', 'Eastside', 'NetWorks ISP'),
(UUID(), 'user_david_203', '50Mbps',  'active',   '2026-08-05', 'Northside', 'ConnectPro');

INSERT IGNORE INTO resellers (id, name, contact_person, email, phone, commission_rate) VALUES
(UUID(), 'TechNet Solutions', 'John Smith',     'john@technet.com',     '+1234567890', 15.00),
(UUID(), 'ConnectPro',        'Sarah Johnson',  'sarah@connectpro.com', '+1234567891', 15.00),
(UUID(), 'NetWorks ISP',      'Mike Wilson',    'mike@networks.com',    '+1234567892', 15.00);

INSERT IGNORE INTO locations (id, name, address, type) VALUES
(UUID(), 'Downtown', 'Central District', 'region'),
(UUID(), 'Westside',  'West Avenue',     'region'),
(UUID(), 'Eastside',  'East Boulevard',  'region'),
(UUID(), 'Northside', 'North Street',    'region');

INSERT IGNORE INTO billing (id, user_id, invoice_number, amount, status, due_date, paid_date, payment_method)
SELECT UUID(), id, 'INV-2026-000001', 25.00, 'paid',    '2026-05-15', '2026-05-15', 'bKash'         FROM users WHERE username = 'user_mike_001';
INSERT IGNORE INTO billing (id, user_id, invoice_number, amount, status, due_date, paid_date, payment_method)
SELECT UUID(), id, 'INV-2026-000002', 50.00, 'paid',    '2026-05-15', '2026-05-15', 'Bank Transfer' FROM users WHERE username = 'user_john_089';
INSERT IGNORE INTO billing (id, user_id, invoice_number, amount, status, due_date, paid_date, payment_method)
SELECT UUID(), id, 'INV-2026-000003', 25.00, 'overdue', '2026-05-01', NULL,         NULL             FROM users WHERE username = 'user_sarah_042';
INSERT IGNORE INTO billing (id, user_id, invoice_number, amount, status, due_date, paid_date, payment_method)
SELECT UUID(), id, 'INV-2026-000004', 35.00, 'pending', '2026-05-28', NULL,         NULL             FROM users WHERE username = 'user_anna_156';
INSERT IGNORE INTO billing (id, user_id, invoice_number, amount, status, due_date, paid_date, payment_method)
SELECT UUID(), id, 'INV-2026-000005', 50.00, 'paid',    '2026-05-12', '2026-05-11', 'Nagad'         FROM users WHERE username = 'user_david_203';
