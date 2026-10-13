import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { masterPool } from '../db/master.js';
import { env } from '../config/env.js';
import { authenticate } from '../middleware/auth.js';
import { createTenantDatabase } from '../tenancy/neonProvisioner.js';
import { initializeTenantDatabase, getTenantPool } from '../tenancy/tenantDb.js';
import { databaseNameFromOrganizationName } from '../tenancy/databaseName.js';
import { audit, auditAuthenticationEvent } from '../services/audit.js';

export const authRouter = Router();

const signupSchema = z.object({
  organizationId: z.string().min(3).max(40).regex(/^[A-Za-z0-9]+$/, 'Organization ID must contain only letters and numbers.'),
  organizationName: z.string().trim().min(2).max(180),
  email: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
  password: z.string().min(10).max(72),
  confirmPassword: z.string(),
  country: z.string().trim().min(2).max(100)
}).refine(v => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match.' });

const signinSchema = z.object({
  organizationId: z.string().min(1).max(40),
  email: z.string().trim().email().transform(v => v.toLowerCase()),
  password: z.string().min(1).max(72)
});

function issueToken(row: any) {
  return jwt.sign({ sub: String(row.id), orgPk: Number(row.organization_pk), orgId: row.organization_id, email: row.email },
    env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] });
}

authRouter.post('/signup', async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed.', details: parsed.error.flatten() });
  const v = parsed.data;
  const organizationId = v.organizationId.toUpperCase();
  const databaseName = databaseNameFromOrganizationName(v.organizationName);
  if (!databaseName) return res.status(400).json({ error: 'Organization name must include at least one English letter or number.' });

  try {
    const duplicate = await masterPool.query(
      `SELECT 1 FROM organizations
       WHERE UPPER(organization_id)=$1 OR LOWER(email)=LOWER($2) OR tenant_database_name=$3`,
      [organizationId, v.email, databaseName]
    );
    if (duplicate.rowCount) return res.status(409).json({ error: 'Organization ID or email is already registered, or this organization name is already in use.' });

    // Provision first; a failed provisioning attempt does not leave a false active organization.
    await createTenantDatabase(databaseName);
    await initializeTenantDatabase(databaseName);

    const client = await masterPool.connect();
    try {
      await client.query('BEGIN');
      const org = await client.query(
        `INSERT INTO organizations (organization_id, organization_name, email, country, tenant_database_name)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [organizationId, v.organizationName, v.email, v.country, databaseName]
      );
      const orgPk = Number(org.rows[0].id);
      const passwordHash = await bcrypt.hash(v.password, 12);
      const user = await client.query(
        `INSERT INTO users (organization_pk, email, full_name, password_hash, role)
         VALUES ($1,$2,$3,$4,'SUPER_ADMIN') RETURNING id, organization_pk, email, role`,
        [orgPk, v.email, v.organizationName + ' Admin', passwordHash]
      );
      await client.query('COMMIT');

      const tenant = getTenantPool(databaseName);
      await tenant.query(
        `INSERT INTO employees (employee_name,email,role) VALUES ($1,$2,'SUPER_ADMIN') ON CONFLICT (email) DO NOTHING`,
        [v.organizationName + ' Admin', v.email]
      );
      await audit(tenant, { actorId: Number(user.rows[0].id), actorEmail: v.email, action: 'ORGANIZATION_REGISTERED',
        resourceType: 'organization', resourceId: organizationId, description: 'Organization registered and Super Admin created.' });
      return res.status(201).json({ message: 'Organization registered successfully.', token: issueToken({ ...user.rows[0], organization_id: organizationId }), organizationId });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    // A provisioned but unregistered database may remain if a later step fails.
    console.error('Signup failed:', err?.message ?? err);
    if (err?.code === '23505') return res.status(409).json({ error: 'Organization ID or email is already registered.' });
    return res.status(500).json({ error: 'Registration failed. Verify Neon provisioning settings and database permissions.' });
  }
});

authRouter.post('/signin', async (req, res) => {
  const parsed = signinSchema.safeParse(req.body);
  if (!parsed.success) {
    try {
      const attemptedOrganizationId = typeof req.body?.organizationId === 'string' ? req.body.organizationId : null;
      const attemptedEmail = typeof req.body?.email === 'string' ? req.body.email : null;
      await auditAuthenticationEvent({
        organizationId: attemptedOrganizationId,
        email: attemptedEmail,
        outcome: 'FAILURE',
        description: 'Sign-in rejected because the submitted details were invalid.'
      });
    } catch (error) {
      console.error('Failed to record invalid sign-in attempt:', error);
      return res.status(500).json({ error: 'Unable to record sign-in attempt. Please try again.' });
    }
    return res.status(400).json({ error: 'Invalid sign-in details.' });
  }
  const v = parsed.data;
  try {
    const result = await masterPool.query(
      `SELECT u.id, u.organization_pk, u.email, u.password_hash, u.role, u.is_active,
              o.organization_id, o.tenant_database_name
       FROM users u JOIN organizations o ON o.id=u.organization_pk
       WHERE UPPER(o.organization_id)=UPPER($1) AND LOWER(u.email)=LOWER($2)`,
      [v.organizationId, v.email]
    );
    const row = result.rows[0];
    if (!row || !row.is_active || !(await bcrypt.compare(v.password, row.password_hash))) {
      await auditAuthenticationEvent({
        organizationPk: row ? Number(row.organization_pk) : null,
        organizationId: v.organizationId.toUpperCase(),
        email: v.email,
        outcome: 'FAILURE',
        description: !row ? 'Failed sign-in: organization or account was not found.'
          : !row.is_active ? 'Failed sign-in: account is inactive.'
            : 'Failed sign-in: password did not match.'
      });
      return res.status(401).json({ error: 'Invalid organization ID, email, or password.' });
    }
    await auditAuthenticationEvent({
      organizationPk: Number(row.organization_pk),
      organizationId: row.organization_id,
      actorId: Number(row.id),
      email: row.email,
      outcome: 'SUCCESS',
      description: 'User signed in successfully.'
    });
    const token = issueToken(row);
    return res.json({ token, organizationId: row.organization_id, role: row.role, email: row.email });
  } catch (err) {
    console.error('Signin failed:', err);
    return res.status(500).json({ error: 'Unable to sign in right now.' });
  }
});

authRouter.post('/logout', authenticate, async (req, res) => {
  try {
    const auth = req.auth!;
    await audit(getTenantPool(auth.databaseName), { actorId: auth.userId, actorEmail: auth.email,
      action: 'SIGN_OUT', resourceType: 'authentication', description: 'User signed out.' });
  } catch (e) { console.error('Logout audit failed:', e); }
  // JWT is stateless; the client must discard it. Production should use revocable sessions.
  res.json({ message: 'Signed out. Discard the access token on the client.' });
});

authRouter.get('/me', authenticate, (req, res) => res.json({ user: req.auth }));
