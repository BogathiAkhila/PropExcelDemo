import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { masterPool } from '../db/master.js';

type TokenPayload = { sub: string; orgPk: number; orgId: string; email: string };

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required.' });
    const token = header.slice(7);
    const payload = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
    const userId = Number(payload.sub);
    const result = await masterPool.query(
      `SELECT u.id, u.organization_pk, u.email, u.role, u.is_active,
              o.organization_id, o.tenant_database_name, o.subscription_status, o.trial_end_date
       FROM users u JOIN organizations o ON o.id = u.organization_pk
       WHERE u.id = $1 AND o.id = $2`,
      [userId, payload.orgPk]
    );
    const row = result.rows[0];
    if (!row || !row.is_active) return res.status(401).json({ error: 'Account is inactive or no longer available.' });
    if (row.organization_id !== payload.orgId) return res.status(401).json({ error: 'Invalid session.' });
    req.auth = {
      userId: Number(row.id), organizationPk: Number(row.organization_pk),
      organizationId: row.organization_id, email: row.email, role: row.role,
      databaseName: row.tenant_database_name
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
}

export function allowRoles(...roles: Array<'SUPER_ADMIN'|'INVENTORY_MANAGER'|'ACCOUNT_MANAGER'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ error: 'Authentication required.' });
    if (!roles.includes(req.auth.role)) return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    next();
  };
}
