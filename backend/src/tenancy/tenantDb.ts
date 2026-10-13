import pg from 'pg';
import { tenantConnectionString } from './neonProvisioner.js';

const pools = new Map<string, pg.Pool>();

export function getTenantPool(databaseName: string): pg.Pool {
  // databaseName must come from the master DB, never directly from user input.
  if (!/^(?:[a-z][a-z0-9_]{0,62}|[A-Z0-9]{3,40})$/.test(databaseName)) {
    throw new Error('Invalid tenant database reference.');
  }
  let pool = pools.get(databaseName);
  if (!pool) {
    pool = new pg.Pool({
      connectionString: tenantConnectionString(databaseName),
      ssl: { rejectUnauthorized: true },
      max: 4,
      idleTimeoutMillis: 30_000
    });
    pool.on('error', (err) => console.error('Tenant pool error:', err.message));
    pools.set(databaseName, pool);
  }
  return pool;
}

export async function initializeTenantDatabase(databaseName: string) {
  const pool = getTenantPool(databaseName);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employees (
      id BIGSERIAL PRIMARY KEY,
      employee_name VARCHAR(160) NOT NULL,
      email VARCHAR(254) NOT NULL UNIQUE,
      role VARCHAR(40) NOT NULL CHECK (role IN ('SUPER_ADMIN','INVENTORY_MANAGER','ACCOUNT_MANAGER')),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS products (
      id BIGSERIAL PRIMARY KEY,
      product_name VARCHAR(180) NOT NULL,
      description TEXT,
      sku VARCHAR(80) NOT NULL UNIQUE,
      price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
      stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
      category VARCHAR(100),
      is_published BOOLEAN NOT NULL DEFAULT FALSE,
      is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
      created_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS orders (
      id BIGSERIAL PRIMARY KEY,
      order_number VARCHAR(40) NOT NULL UNIQUE,
      customer_name VARCHAR(160) NOT NULL,
      customer_email VARCHAR(254) NOT NULL,
      product_id BIGINT NOT NULL REFERENCES products(id),
      product_name_at_order VARCHAR(180) NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price_at_order NUMERIC(12,2) NOT NULL CHECK (unit_price_at_order >= 0),
      total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
      delivery_address TEXT NOT NULL,
      order_status VARCHAR(30) NOT NULL DEFAULT 'CONFIRMED'
        CHECK (order_status IN ('CONFIRMED','PROCESSING','PACKED','SHIPPING','DELIVERED','CANCELLED')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS activity_logs (
      id BIGSERIAL PRIMARY KEY,
      actor_id BIGINT,
      actor_email VARCHAR(254),
      actor_type VARCHAR(30) NOT NULL DEFAULT 'USER',
      action VARCHAR(100) NOT NULL,
      resource_type VARCHAR(80) NOT NULL,
      resource_id VARCHAR(100),
      description TEXT NOT NULL,
      outcome VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_products_published ON products(is_published) WHERE is_deleted = FALSE;
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(order_status);
    CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_created_at ON activity_logs(created_at DESC);
  `);
}

export async function closeTenantPools() {
  await Promise.all([...pools.values()].map(p => p.end()));
  pools.clear();
}
