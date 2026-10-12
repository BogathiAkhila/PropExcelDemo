import { Router } from 'express';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { masterPool } from '../db/master.js';
import { getTenantPool } from '../tenancy/tenantDb.js';

export const adminRouter = Router();
adminRouter.use(authenticate);

adminRouter.get('/subscription', async (req,res) => {
  const result=await masterPool.query(
    `SELECT organization_id,organization_name,subscription_plan,subscription_status,trial_start_date,trial_end_date
     FROM organizations WHERE id=$1`,[req.auth!.organizationPk]
  );
  if (!result.rowCount) return res.status(404).json({error:'Organization not found.'});
  const row=result.rows[0];
  const remainingTrialDays=Math.max(0,Math.ceil((new Date(row.trial_end_date).getTime()-Date.now())/86400000));
  res.json({...row,remainingTrialDays});
});

adminRouter.get('/activity-logs', allowRoles('SUPER_ADMIN'), async (req,res) => {
  const limit=Math.min(200,Math.max(1,Number(req.query.limit)||100));
  const result=await getTenantPool(req.auth!.databaseName).query(
    `SELECT id,actor_id,actor_email,actor_type,action,resource_type,resource_id,description,outcome,metadata,created_at
     FROM activity_logs ORDER BY created_at DESC LIMIT $1`,[limit]
  );
  res.json({logs:result.rows});
});
