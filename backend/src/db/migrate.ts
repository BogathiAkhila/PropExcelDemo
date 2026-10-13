import { masterPool } from './master.js';

const sql = `
CREATE TABLE IF NOT EXISTS organizations (
  id BIGSERIAL PRIMARY KEY,
  organization_id VARCHAR(40) NOT NULL UNIQUE,
  organization_name VARCHAR(180) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  country VARCHAR(100) NOT NULL,
  tenant_database_name VARCHAR(63) NOT NULL UNIQUE,
  subscription_plan VARCHAR(30) NOT NULL DEFAULT 'FREE_TRIAL',
  subscription_status VARCHAR(30) NOT NULL DEFAULT 'TRIALING',
  trial_start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trial_end_date TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  organization_pk BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email VARCHAR(254) NOT NULL,
  full_name VARCHAR(160) NOT NULL DEFAULT 'Organization Admin',
  password_hash TEXT NOT NULL,
  role VARCHAR(40) NOT NULL DEFAULT 'SUPER_ADMIN'
    CHECK (role IN ('SUPER_ADMIN','INVENTORY_MANAGER','ACCOUNT_MANAGER')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_pk, email)
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (LOWER(email));
CREATE TABLE IF NOT EXISTS tenant_provisioning_jobs (
  id BIGSERIAL PRIMARY KEY,
  organization_pk BIGINT REFERENCES organizations(id) ON DELETE SET NULL,
  database_name VARCHAR(63) NOT NULL,
  status VARCHAR(30) NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS authentication_events (
  id BIGSERIAL PRIMARY KEY,
  organization_pk BIGINT REFERENCES organizations(id) ON DELETE SET NULL,
  organization_id VARCHAR(40),
  actor_id BIGINT,
  email VARCHAR(254),
  outcome VARCHAR(20) NOT NULL CHECK (outcome IN ('SUCCESS','FAILURE')),
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_authentication_events_org_created
  ON authentication_events (organization_pk, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_authentication_events_orgid_created
  ON authentication_events (UPPER(organization_id), created_at DESC);
`;

try {
  await masterPool.query(sql);
  console.log('Master database migration completed.');
} catch (error) {
  console.error('Master database migration failed:', error);
  process.exitCode = 1;
} finally {
  await masterPool.end();
}
