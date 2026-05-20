CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(100) NOT NULL UNIQUE,
    profile VARCHAR(50),
    billing_package VARCHAR(100),
    billing_price DECIMAL(10, 2),
    status VARCHAR(20) DEFAULT 'active',
    expiry_date DATE,
    location VARCHAR(100),
    reseller VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    invoice_number VARCHAR(50) UNIQUE,
    amount DECIMAL(10, 2),
    status VARCHAR(20) DEFAULT 'pending',
    due_date DATE,
    paid_date DATE,
    payment_method VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS resellers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    contact_person VARCHAR(100),
    email VARCHAR(100),
    phone VARCHAR(20),
    commission_rate DECIMAL(5,2) DEFAULT 15.00,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    address TEXT,
    type VARCHAR(20) DEFAULT 'region',
    parent_id UUID REFERENCES locations(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

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
);

INSERT INTO users (username, profile, status, expiry_date, location, reseller) VALUES
('user_mike_001', '10Mbps', 'active', '2026-06-15', 'Downtown', 'TechNet Solutions'),
('user_sarah_042', '50Mbps', 'expired', '2026-05-10', 'Westside', 'ConnectPro'),
('user_john_089', '100Mbps', 'active', '2026-07-22', 'Downtown', 'TechNet Solutions'),
('user_anna_156', '20Mbps', 'disabled', '2026-06-30', 'Eastside', 'NetWorks ISP'),
('user_david_203', '50Mbps', 'active', '2026-08-05', 'Northside', 'ConnectPro');

INSERT INTO resellers (name, contact_person, email, phone, commission_rate) VALUES
('TechNet Solutions', 'John Smith', 'john@technet.com', '+1234567890', 15.00),
('ConnectPro', 'Sarah Johnson', 'sarah@connectpro.com', '+1234567891', 15.00),
('NetWorks ISP', 'Mike Wilson', 'mike@networks.com', '+1234567892', 15.00);

INSERT INTO locations (name, address, type) VALUES
('Downtown', 'Central District', 'region'),
('Westside', 'West Avenue', 'region'),
('Eastside', 'East Boulevard', 'region'),
('Northside', 'North Street', 'region');

INSERT INTO billing (user_id, invoice_number, amount, status, due_date, paid_date, payment_method) VALUES
((SELECT id FROM users WHERE username = 'user_mike_001'), 'INV-2026-000001', 25.00, 'paid', '2026-05-15', '2026-05-15', 'bKash'),
((SELECT id FROM users WHERE username = 'user_john_089'), 'INV-2026-000002', 50.00, 'paid', '2026-05-15', '2026-05-15', 'Bank Transfer'),
((SELECT id FROM users WHERE username = 'user_sarah_042'), 'INV-2026-000003', 25.00, 'overdue', '2026-05-01', NULL, NULL),
((SELECT id FROM users WHERE username = 'user_anna_156'), 'INV-2026-000004', 35.00, 'pending', '2026-05-28', NULL, NULL),
((SELECT id FROM users WHERE username = 'user_david_203'), 'INV-2026-000005', 50.00, 'paid', '2026-05-12', '2026-05-11', 'Nagad');