-- ============================================================
-- ISP Billing Management System — MySQL 8.0+ Schema
-- Run: mysql -u billing -p mikrotik_billing < database/init.sql
-- ============================================================

-- ── Configuration Tables ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS zones (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sub_zones (
    id CHAR(36) PRIMARY KEY,
    zone_id CHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_subzone_zone FOREIGN KEY (zone_id) REFERENCES zones(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS boxes (
    id CHAR(36) PRIMARY KEY,
    sub_zone_id CHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    location TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_box_subzone FOREIGN KEY (sub_zone_id) REFERENCES sub_zones(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS connection_types (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS client_types (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS protocol_types (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS isp_packages (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    mikrotik_profile VARCHAR(100) NOT NULL,
    speed_down VARCHAR(50),
    speed_up VARCHAR(50),
    monthly_bill DECIMAL(10,2) NOT NULL DEFAULT 0,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ── Core Tables ───────────────────────────────────────────────

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

CREATE TABLE IF NOT EXISTS users (
    id CHAR(36) PRIMARY KEY,
    c_code INT UNSIGNED AUTO_INCREMENT UNIQUE,
    username VARCHAR(100) NOT NULL UNIQUE,
    pppoe_password VARCHAR(100),
    full_name VARCHAR(150),
    mobile VARCHAR(20),
    address TEXT,
    -- Location hierarchy
    zone_id CHAR(36),
    sub_zone_id CHAR(36),
    box_id CHAR(36),
    -- Classification
    connection_type_id CHAR(36),
    client_type_id CHAR(36),
    protocol_type_id CHAR(36),
    package_id CHAR(36),
    -- Legacy / compatibility fields
    profile VARCHAR(50),
    billing_package VARCHAR(100),
    billing_price DECIMAL(10,2),
    -- ISP fields
    monthly_bill DECIMAL(10,2),
    mac_address VARCHAR(17),
    server_id CHAR(36),
    billing_date TINYINT DEFAULT 1 COMMENT 'Day of month billing is due',
    billing_status ENUM('active','suspended','terminated','waiver') DEFAULT 'active',
    mikrotik_status ENUM('online','offline','blocked','unknown') DEFAULT 'unknown',
    -- Status / lifecycle
    status VARCHAR(20) DEFAULT 'active',
    expiry_date DATE,
    is_left BOOLEAN DEFAULT FALSE,
    left_date DATE,
    -- Relations
    location VARCHAR(100),
    reseller VARCHAR(100),
    reseller_id CHAR(36),
    notes TEXT,
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
    billing_month VARCHAR(7) COMMENT 'YYYY-MM',
    -- Amounts
    amount DECIMAL(10,2),
    received_amount DECIMAL(10,2) DEFAULT 0,
    vat DECIMAL(10,2) DEFAULT 0,
    discount DECIMAL(10,2) DEFAULT 0,
    balance_due DECIMAL(10,2) DEFAULT 0,
    advance DECIMAL(10,2) DEFAULT 0,
    -- Status / dates
    status VARCHAR(20) DEFAULT 'pending',
    billing_date_expiry DATE,
    due_date DATE,
    paid_date DATE,
    payment_method VARCHAR(50),
    -- Audit
    received_by VARCHAR(100),
    approved_by VARCHAR(100),
    note TEXT,
    transaction_status ENUM('pending','approved','rejected') DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_billing_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS bill_collections (
    id CHAR(36) PRIMARY KEY,
    bill_id CHAR(36),
    user_id CHAR(36),
    invoice_number VARCHAR(50),
    billing_month VARCHAR(7),
    monthly_bill DECIMAL(10,2) DEFAULT 0,
    received_amount DECIMAL(10,2) DEFAULT 0,
    vat DECIMAL(10,2) DEFAULT 0,
    discount DECIMAL(10,2) DEFAULT 0,
    balance_due DECIMAL(10,2) DEFAULT 0,
    advance DECIMAL(10,2) DEFAULT 0,
    payment_method VARCHAR(50),
    note TEXT,
    received_by VARCHAR(100),
    approved_by VARCHAR(100),
    transaction_status ENUM('pending','approved','rejected') DEFAULT 'pending',
    collection_date DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
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

CREATE TABLE IF NOT EXISTS auth_users (
    id CHAR(36) PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role ENUM('admin','reseller') NOT NULL DEFAULT 'reseller',
    reseller_id CHAR(36),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS billing_packages (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    mikrotik_profile VARCHAR(100) NOT NULL,
    price DECIMAL(10,2) NOT NULL DEFAULT 0,
    duration_days INT NOT NULL DEFAULT 30,
    reseller_id CHAR(36),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ── Seed Data ─────────────────────────────────────────────────

INSERT IGNORE INTO zones (id, name, description) VALUES
(UUID(), 'Dhaka North',   'Northern Dhaka coverage area'),
(UUID(), 'Dhaka South',   'Southern Dhaka coverage area'),
(UUID(), 'Mirpur',        'Mirpur zone'),
(UUID(), 'Uttara',        'Uttara zone');

INSERT IGNORE INTO connection_types (id, name, description) VALUES
(UUID(), 'Optical Fiber', 'FTTH/FTTB fiber optic connection'),
(UUID(), 'Cable',         'Coaxial cable connection'),
(UUID(), 'Wireless',      'Point-to-point wireless link');

INSERT IGNORE INTO client_types (id, name, description) VALUES
(UUID(), 'Home',          'Residential home user'),
(UUID(), 'Corporate',     'Business / corporate client'),
(UUID(), 'Waiver',        'Free / personal / staff account');

INSERT IGNORE INTO protocol_types (id, name, description) VALUES
(UUID(), 'PPPoE',         'Point-to-Point Protocol over Ethernet'),
(UUID(), 'Static IP',     'Fixed IP address assignment'),
(UUID(), 'DHCP',          'Dynamic Host Configuration Protocol');

INSERT IGNORE INTO isp_packages (id, name, mikrotik_profile, speed_down, speed_up, monthly_bill) VALUES
(UUID(), '10 Mbps Home',  '10M',   '10M', '2M',  500),
(UUID(), '20 Mbps Home',  '20M',   '20M', '5M',  800),
(UUID(), '50 Mbps Home',  '50M',   '50M', '10M', 1200),
(UUID(), '100 Mbps Corp', '100M',  '100M','20M', 2500),
(UUID(), '200 Mbps Corp', '200M',  '200M','50M', 4500);

INSERT IGNORE INTO resellers (id, name, contact_person, email, phone, commission_rate) VALUES
(UUID(), 'TechNet Solutions', 'John Smith',    'john@technet.com',     '+8801711000001', 15.00),
(UUID(), 'ConnectPro',        'Sarah Johnson', 'sarah@connectpro.com', '+8801711000002', 15.00),
(UUID(), 'NetWorks ISP',      'Mike Wilson',   'mike@networks.com',    '+8801711000003', 12.00);

INSERT IGNORE INTO users (id, username, full_name, mobile, profile, status, expiry_date, location, reseller, billing_status) VALUES
(UUID(), 'client001', 'Rahim Uddin',   '+8801711001111', '20M', 'active',   '2026-06-15', 'Dhaka North', 'TechNet Solutions', 'active'),
(UUID(), 'client002', 'Karim Hossain', '+8801711002222', '50M', 'active',   '2026-06-22', 'Mirpur',      'ConnectPro',        'active'),
(UUID(), 'client003', 'Nadia Begum',   '+8801711003333', '10M', 'disabled', '2026-05-10', 'Dhaka South', 'NetWorks ISP',      'suspended'),
(UUID(), 'client004', 'Faruk Ahmed',   '+8801711004444', '20M', 'active',   '2026-07-01', 'Uttara',      'ConnectPro',        'active'),
(UUID(), 'client005', 'Ruma Islam',    '+8801711005555', '10M', 'expired',  '2026-05-28', 'Dhaka North', 'TechNet Solutions', 'suspended');

INSERT IGNORE INTO billing (id, user_id, invoice_number, amount, received_amount, status, due_date, paid_date, payment_method)
SELECT UUID(), id, 'INV-2026-000001', 800, 800, 'paid',    '2026-05-15', '2026-05-15', 'bKash'         FROM users WHERE username = 'client001';
INSERT IGNORE INTO billing (id, user_id, invoice_number, amount, received_amount, status, due_date, paid_date, payment_method)
SELECT UUID(), id, 'INV-2026-000002', 1200, 1200, 'paid',   '2026-05-15', '2026-05-15', 'Bank Transfer' FROM users WHERE username = 'client002';
INSERT IGNORE INTO billing (id, user_id, invoice_number, amount, received_amount, status, due_date)
SELECT UUID(), id, 'INV-2026-000003', 500, 0, 'pending', '2026-05-28', NULL                           FROM users WHERE username = 'client003';
INSERT IGNORE INTO billing (id, user_id, invoice_number, amount, received_amount, status, due_date)
SELECT UUID(), id, 'INV-2026-000004', 800, 0, 'overdue', '2026-05-01', NULL                           FROM users WHERE username = 'client004';
INSERT IGNORE INTO billing (id, user_id, invoice_number, amount, received_amount, status, due_date, paid_date, payment_method)
SELECT UUID(), id, 'INV-2026-000005', 500, 500, 'paid',   '2026-05-12', '2026-05-11', 'Nagad'         FROM users WHERE username = 'client005';
