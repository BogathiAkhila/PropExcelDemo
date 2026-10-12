import { Router } from 'express';
import { z } from 'zod';
import { masterPool } from '../db/master.js';
import { getTenantPool } from '../tenancy/tenantDb.js';
import { audit } from '../services/audit.js';

export const publicRouter = Router();

async function resolveTenant(orgId:string) {
  const result=await masterPool.query(
    `SELECT organization_id,tenant_database_name FROM organizations WHERE UPPER(organization_id)=UPPER($1)`,
    [orgId]
  );
  return result.rows[0] as {organization_id:string;tenant_database_name:string}|undefined;
}

publicRouter.get('/products/:organizationId', async (req,res) => {
  const tenant=await resolveTenant(req.params.organizationId);
  if (!tenant) return res.status(404).json({error:'Organization not found.'});
  const result=await getTenantPool(tenant.tenant_database_name).query(
    `SELECT id,product_name,description,sku,price,stock_quantity,category
     FROM products WHERE is_published=TRUE AND is_deleted=FALSE AND stock_quantity>0 ORDER BY product_name`
  );
  res.json({organizationId:tenant.organization_id,products:result.rows});
});

publicRouter.get('/products/:organizationId/:productId', async (req,res) => {
  const tenant=await resolveTenant(req.params.organizationId);
  if (!tenant) return res.status(404).json({error:'Organization not found.'});
  const result=await getTenantPool(tenant.tenant_database_name).query(
    `SELECT id,product_name,description,sku,price,stock_quantity,category FROM products
     WHERE id=$1 AND is_published=TRUE AND is_deleted=FALSE AND stock_quantity>0`,
    [Number(req.params.productId)]
  );
  if (!result.rowCount) return res.status(404).json({error:'Published product not found.'});
  res.json({product:result.rows[0]});
});

publicRouter.post('/orders/:organizationId', async (req,res) => {
  const parsed=z.object({
    customerName:z.string().trim().min(2).max(160),
    customerEmail:z.string().trim().email().max(254),
    productId:z.coerce.number().int().positive(),
    quantity:z.coerce.number().int().min(1).max(1000),
    deliveryAddress:z.string().trim().min(5).max(2000)
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({error:'Invalid order details.',details:parsed.error.flatten()});
  const tenant=await resolveTenant(req.params.organizationId);
  if (!tenant) return res.status(404).json({error:'Organization not found.'});
  const db=getTenantPool(tenant.tenant_database_name), client=await db.connect();
  try {
    await client.query('BEGIN');
    const p=await client.query(`SELECT * FROM products WHERE id=$1 AND is_published=TRUE AND is_deleted=FALSE FOR UPDATE`,[parsed.data.productId]);
    if (!p.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({error:'Product is not available.'}); }
    const product=p.rows[0];
    if (Number(product.stock_quantity)<parsed.data.quantity) { await client.query('ROLLBACK'); return res.status(409).json({error:'Not enough stock available.'}); }
    const total=Number(product.price)*parsed.data.quantity;
    await client.query(`UPDATE products SET stock_quantity=stock_quantity-$1,updated_at=NOW() WHERE id=$2`,[parsed.data.quantity,product.id]);
    const orderNumber=`ORD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
    const order=await client.query(
      `INSERT INTO orders(order_number,customer_name,customer_email,product_id,product_name_at_order,quantity,unit_price_at_order,total_amount,delivery_address,order_status)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'CONFIRMED') RETURNING id,order_number,order_status,total_amount,created_at`,
      [orderNumber,parsed.data.customerName,parsed.data.customerEmail,product.id,product.product_name,parsed.data.quantity,product.price,total,parsed.data.deliveryAddress]
    );
    await client.query(
      `INSERT INTO activity_logs(actor_type,action,resource_type,resource_id,description,metadata)
       VALUES('CUSTOMER','PUBLIC_ORDER_CREATED','order',$1,'Customer order placed through public page',$2::jsonb)`,
      [String(order.rows[0].id),JSON.stringify({orderNumber,productId:product.id,quantity:parsed.data.quantity})]
    );
    await client.query('COMMIT');
    res.status(201).json({message:'Order placed successfully.',order:order.rows[0]});
  } catch(e) { await client.query('ROLLBACK').catch(()=>{}); throw e; }
  finally { client.release(); }
});
