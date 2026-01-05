-- ═══════════════════════════════════════════════════════════════════════════════
-- DivertScan™ Apex Enterprise - PostgreSQL Database Schema v3.0
-- Multi-Tenant Architecture | LEED v5 Compliance
-- ═══════════════════════════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ═══════════════════════════════════════════════════════════════════════════════
-- TENANTS (Multi-tenant root)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    
    -- Billing
    stripe_customer_id VARCHAR(255),
    subscription_tier VARCHAR(50) DEFAULT 'starter',
    subscription_status VARCHAR(50) DEFAULT 'active',
    billing_email VARCHAR(255),
    
    -- QuickBooks Integration
    qbo_realm_id VARCHAR(100),
    qbo_access_token TEXT,
    qbo_refresh_token TEXT,
    qbo_token_expires_at TIMESTAMP,
    
    -- Settings
    settings JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tenants_slug ON tenants(slug);

-- ═══════════════════════════════════════════════════════════════════════════════
-- USERS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    
    role VARCHAR(50) DEFAULT 'field_operator',
    permissions JSONB DEFAULT '[]',
    
    is_active BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(tenant_id, email)
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PROJECTS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    name VARCHAR(255) NOT NULL,
    client_name VARCHAR(255),
    
    -- Location
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(50),
    zip VARCHAR(20),
    
    -- LEED Configuration
    leed_certification VARCHAR(10) DEFAULT 'v5',
    target_diversion INTEGER DEFAULT 75,
    
    -- Billing
    billing_type VARCHAR(50) DEFAULT 'subscription',
    billing_rate_per_ton DECIMAL(10,2),
    
    -- Dates
    start_date DATE,
    end_date DATE,
    
    status VARCHAR(50) DEFAULT 'active',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_projects_tenant ON projects(tenant_id);
CREATE INDEX idx_projects_status ON projects(status);

-- ═══════════════════════════════════════════════════════════════════════════════
-- FACILITIES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE facilities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    
    -- Location
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(50),
    zip VARCHAR(20),
    
    -- Contact
    phone VARCHAR(50),
    email VARCHAR(255),
    contact_name VARCHAR(255),
    
    -- Materials
    accepted_materials JSONB DEFAULT '[]',
    
    status VARCHAR(50) DEFAULT 'active',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_facilities_tenant ON facilities(tenant_id);
CREATE INDEX idx_facilities_type ON facilities(type);

-- ═══════════════════════════════════════════════════════════════════════════════
-- FACILITY PERMITS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE facility_permits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    
    permit_number VARCHAR(100) NOT NULL,
    permit_type VARCHAR(50) NOT NULL,
    issuing_authority VARCHAR(255) NOT NULL,
    
    issue_date DATE,
    expiration_date DATE NOT NULL,
    
    document_url TEXT,
    notes TEXT,
    alert_days INTEGER DEFAULT 30,
    
    status VARCHAR(50) DEFAULT 'valid',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_permits_facility ON facility_permits(facility_id);
CREATE INDEX idx_permits_expiration ON facility_permits(expiration_date);

-- ═══════════════════════════════════════════════════════════════════════════════
-- WEIGHT TICKETS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE weight_tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    facility_id UUID REFERENCES facilities(id),
    
    ticket_number VARCHAR(50) NOT NULL,
    
    -- Weights
    gross_weight DECIMAL(12,2) NOT NULL,
    tare_weight DECIMAL(12,2) NOT NULL,
    net_weight DECIMAL(12,2) NOT NULL,
    weight_unit VARCHAR(10) DEFAULT 'lbs',
    
    -- Classification
    material_type VARCHAR(50) NOT NULL,
    destination VARCHAR(50) NOT NULL,
    
    -- Vehicle Info
    truck_plate VARCHAR(50),
    fleet_number VARCHAR(50),
    driver_name VARCHAR(255),
    hauler_company VARCHAR(255),
    
    -- Signature
    driver_signature TEXT,
    signature_timestamp TIMESTAMP,
    
    -- GPS
    gps_lat DECIMAL(10,7),
    gps_lng DECIMAL(10,7),
    
    -- Timestamps
    gross_captured_at TIMESTAMP,
    tare_captured_at TIMESTAMP,
    
    -- OCR
    ocr_source VARCHAR(50) DEFAULT 'manual',
    ocr_confidence DECIMAL(4,3),
    ocr_raw_text TEXT,
    
    -- Status
    status VARCHAR(50) DEFAULT 'pending',
    
    -- Billing
    invoiced BOOLEAN DEFAULT FALSE,
    invoice_id UUID,
    line_item_amount DECIMAL(12,2),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(tenant_id, ticket_number)
);

CREATE INDEX idx_tickets_tenant ON weight_tickets(tenant_id);
CREATE INDEX idx_tickets_project ON weight_tickets(project_id);
CREATE INDEX idx_tickets_status ON weight_tickets(status);
CREATE INDEX idx_tickets_material ON weight_tickets(material_type);
CREATE INDEX idx_tickets_destination ON weight_tickets(destination);
CREATE INDEX idx_tickets_created ON weight_tickets(created_at);
CREATE INDEX idx_tickets_invoiced ON weight_tickets(invoiced) WHERE invoiced = FALSE;

-- ═══════════════════════════════════════════════════════════════════════════════
-- TICKET PHOTOS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE ticket_photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID NOT NULL REFERENCES weight_tickets(id) ON DELETE CASCADE,
    
    photo_type VARCHAR(50) NOT NULL, -- debris_pile, scale_display, truck, signature
    url TEXT NOT NULL,
    thumbnail_url TEXT,
    
    captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_photos_ticket ON ticket_photos(ticket_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- INVOICES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id),
    
    invoice_number VARCHAR(50) NOT NULL,
    
    customer_name VARCHAR(255) NOT NULL,
    customer_email VARCHAR(255),
    
    -- Period
    period_start DATE,
    period_end DATE,
    
    -- Amounts
    subtotal DECIMAL(12,2) NOT NULL,
    tax_rate DECIMAL(5,4) DEFAULT 0,
    tax_amount DECIMAL(12,2) DEFAULT 0,
    total_amount DECIMAL(12,2) NOT NULL,
    
    -- Dates
    due_date DATE,
    paid_date DATE,
    
    -- QuickBooks
    qbo_invoice_id VARCHAR(100),
    qbo_doc_number VARCHAR(50),
    qbo_synced_at TIMESTAMP,
    
    -- PDF
    pdf_url TEXT,
    
    status VARCHAR(50) DEFAULT 'draft',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(tenant_id, invoice_number)
);

CREATE INDEX idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX idx_invoices_project ON invoices(project_id);
CREATE INDEX idx_invoices_status ON invoices(status);

-- ═══════════════════════════════════════════════════════════════════════════════
-- INVOICE LINE ITEMS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE invoice_line_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    
    description TEXT NOT NULL,
    material_type VARCHAR(50),
    
    quantity DECIMAL(12,2) NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    
    -- Associated tickets
    ticket_ids UUID[] DEFAULT '{}',
    
    sort_order INTEGER DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_line_items_invoice ON invoice_line_items(invoice_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- MATERIAL RATES (Per-tenant pricing)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE material_rates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id), -- NULL = tenant default
    
    material_type VARCHAR(50) NOT NULL,
    rate_per_ton DECIMAL(12,2) NOT NULL,
    
    effective_date DATE DEFAULT CURRENT_DATE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(tenant_id, project_id, material_type)
);

CREATE INDEX idx_rates_tenant ON material_rates(tenant_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SYNC QUEUE (Offline support)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE sync_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    
    entity_type VARCHAR(50) NOT NULL, -- ticket, photo, etc.
    entity_id UUID,
    
    action VARCHAR(50) NOT NULL, -- create, update, delete
    payload JSONB NOT NULL,
    
    status VARCHAR(50) DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    last_attempt_at TIMESTAMP,
    error_message TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP
);

CREATE INDEX idx_sync_queue_status ON sync_queue(status) WHERE status = 'pending';
CREATE INDEX idx_sync_queue_tenant ON sync_queue(tenant_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- AUDIT LOG
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    
    action VARCHAR(50) NOT NULL,
    changes JSONB,
    
    ip_address VARCHAR(50),
    user_agent TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_tenant ON audit_log(tenant_id);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_log(created_at);

-- ═══════════════════════════════════════════════════════════════════════════════
-- VIEWS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Project Analytics View
CREATE OR REPLACE VIEW v_project_analytics AS
SELECT 
    p.id AS project_id,
    p.tenant_id,
    p.name AS project_name,
    p.leed_certification,
    p.target_diversion,
    COUNT(t.id) AS ticket_count,
    COALESCE(SUM(t.net_weight), 0) AS total_weight,
    COALESCE(SUM(CASE WHEN t.destination != 'landfill' THEN t.net_weight ELSE 0 END), 0) AS diverted_weight,
    COALESCE(SUM(CASE WHEN t.destination = 'landfill' THEN t.net_weight ELSE 0 END), 0) AS landfill_weight,
    CASE 
        WHEN SUM(t.net_weight) > 0 
        THEN ROUND((SUM(CASE WHEN t.destination != 'landfill' THEN t.net_weight ELSE 0 END) / SUM(t.net_weight)) * 100, 2)
        ELSE 0 
    END AS diversion_rate
FROM projects p
LEFT JOIN weight_tickets t ON t.project_id = p.id AND t.status IN ('verified', 'closed')
GROUP BY p.id, p.tenant_id, p.name, p.leed_certification, p.target_diversion;

-- Expiring Permits View
CREATE OR REPLACE VIEW v_expiring_permits AS
SELECT 
    fp.*,
    f.name AS facility_name,
    f.tenant_id,
    (fp.expiration_date - CURRENT_DATE) AS days_until_expiry
FROM facility_permits fp
JOIN facilities f ON f.id = fp.facility_id
WHERE fp.expiration_date >= CURRENT_DATE
  AND fp.expiration_date <= CURRENT_DATE + INTERVAL '90 days'
ORDER BY fp.expiration_date;

-- ═══════════════════════════════════════════════════════════════════════════════
-- FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables
CREATE TRIGGER trigger_tenants_updated_at BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_facilities_updated_at BEFORE UPDATE ON facilities FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_permits_updated_at BEFORE UPDATE ON facility_permits FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_tickets_updated_at BEFORE UPDATE ON weight_tickets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_rates_updated_at BEFORE UPDATE ON material_rates FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════════
-- SEED DATA (Demo)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Demo tenant
INSERT INTO tenants (id, name, slug, subscription_tier) 
VALUES ('11111111-1111-1111-1111-111111111111', 'Dalmex Recycling LLC', 'dalmex', 'enterprise');

-- Demo user (password: demo123)
INSERT INTO users (tenant_id, email, password_hash, name, role)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'demo@dalmex.com',
    crypt('demo123', gen_salt('bf')),
    'Demo User',
    'admin'
);

-- Demo projects
INSERT INTO projects (tenant_id, name, client_name, city, state, leed_certification, target_diversion)
VALUES 
    ('11111111-1111-1111-1111-111111111111', 'Downtown Office Tower', 'Metro Development Corp', 'Dallas', 'TX', 'v5', 75),
    ('11111111-1111-1111-1111-111111111111', 'Children''s Hospital Expansion', 'Texas Health', 'Rockwall', 'TX', 'v5', 75);

-- Demo facilities
INSERT INTO facilities (tenant_id, name, type, city, state, accepted_materials)
VALUES 
    ('11111111-1111-1111-1111-111111111111', 'Metro Recycling Center', 'recycling_center', 'Dallas', 'TX', '["concrete", "metal_ferrous", "metal_nonferrous", "wood_clean", "cardboard"]'),
    ('11111111-1111-1111-1111-111111111111', 'B&B Crushing', 'recycling_center', 'Rockwall', 'TX', '["concrete", "asphalt", "brick_masonry"]'),
    ('11111111-1111-1111-1111-111111111111', 'City of Dallas Landfill', 'landfill', 'Dallas', 'TX', '["mixed_c_and_d", "other"]');

-- Demo material rates
INSERT INTO material_rates (tenant_id, material_type, rate_per_ton)
VALUES 
    ('11111111-1111-1111-1111-111111111111', 'concrete', 35.00),
    ('11111111-1111-1111-1111-111111111111', 'asphalt', 38.00),
    ('11111111-1111-1111-1111-111111111111', 'metal_ferrous', 45.00),
    ('11111111-1111-1111-1111-111111111111', 'metal_nonferrous', 85.00),
    ('11111111-1111-1111-1111-111111111111', 'wood_clean', 42.00),
    ('11111111-1111-1111-1111-111111111111', 'cardboard', 38.00),
    ('11111111-1111-1111-1111-111111111111', 'drywall', 48.00),
    ('11111111-1111-1111-1111-111111111111', 'mixed_c_and_d', 52.00);

-- ═══════════════════════════════════════════════════════════════════════════════
-- GRANTS (Adjust for your database user)
-- ═══════════════════════════════════════════════════════════════════════════════

-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO divertscan_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO divertscan_user;
