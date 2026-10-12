import { Router } from 'express';
import { z } from 'zod';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { getTenantPool } from '../tenancy/tenantDb.js';
import { audit } from '../services/audit.js';

export const ordersRouter = Router();
ordersRouter.use(authenticate);

ordersRouter.get('/', allowRoles('SUPER_ADMIN','ACCOUNT_MANAGER','INVENTORY_MANAGER'), async (req,res) => {
  const result=await getTenantPool(req.auth!.databaseName).query(`SELECT * FROM orders ORDER BY created_at DESC LIMIT 200`);
  res.json({orders:result.rows});
});

ordersRouter.patch('/:id/status', allowRoles('SUPER_ADMIN','ACCOUNT_MANAGER'), async (req,res) => {
  const id=Number(req.params.id);
  const parsed=z.object({status:z.enum(['PROCESSING','PACKED','SHIPPING','DELIVERED'])}).safeParse(req.body);
  if (!Number.isSafeInteger(id)||id<1||!parsed.success) return res.status(400).json({error:'Invalid order ID or status.'});
  const db=getTenantPool(req.auth!.databaseName);
  const client=await db.connect();
  try {
    await client.query('BEGIN');
    const current=await client.query(`SELECT order_status FROM orders WHERE id=$1 FOR UPDATE`,[id]);
    if (!current.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({error:'Order not found.'}); }
    const allowed:Record<string,string>={CONFIRMED:'PROCESSING',PROCESSING:'PACKED',PACKED:'SHIPPING',SHIPPING:'DELIVERED'};
    const previous=current.rows[0].order_status;
    if (allowed[previous]!==parsed.data.status) { await client.query('ROLLBACK'); return res.status(409).json({error:`Invalid status transition: ${previous} to ${parsed.data.status}.`}); }
    const updated=await client.query(`UPDATE orders SET order_status=$1,updated_at=NOW() WHERE id=$2 RETURNING *`,[parsed.data.status,id]);
    await client.query(
      `INSERT INTO activity_logs(actor_id,actor_email,action,resource_type,resource_id,description,metadata)
       VALUES($1,$2,'ORDER_STATUS_CHANGED','order',$3,$4,$5::jsonb)`,
      [req.auth!.userId,req.auth!.email,String(id),`Order status changed from ${previous} to ${parsed.data.status}.`,JSON.stringify({previousStatus:previous,newStatus:parsed.data.status})]
    );
    await client.query('COMMIT');
    res.json({order:updated.rows[0]});
  } catch(e) { await client.query('ROLLBACK').catch(()=>{}); throw e; }
  finally { client.release(); }
});
