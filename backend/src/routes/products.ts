import { Router } from 'express';
import { z } from 'zod';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { getTenantPool } from '../tenancy/tenantDb.js';
import { audit } from '../services/audit.js';

export const productsRouter = Router();
productsRouter.use(authenticate);

const productSchema = z.object({
  productName: z.string().trim().min(1).max(180),
  description: z.string().max(5000).optional().default(''),
  sku: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/),
  price: z.coerce.number().finite().min(0),
  stockQuantity: z.coerce.number().int().min(0),
  category: z.string().max(100).optional().default('')
});

productsRouter.get('/', allowRoles('SUPER_ADMIN','INVENTORY_MANAGER','ACCOUNT_MANAGER'), async (req,res) => {
  const db = getTenantPool(req.auth!.databaseName);
  const result = await db.query(`SELECT * FROM products WHERE is_deleted=FALSE ORDER BY created_at DESC`);
  res.json({ products: result.rows });
});

productsRouter.post('/', allowRoles('SUPER_ADMIN','INVENTORY_MANAGER'), async (req,res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid product.', details: parsed.error.flatten() });
  const v = parsed.data, auth = req.auth!, db = getTenantPool(auth.databaseName);
  try {
    const result = await db.query(
      `INSERT INTO products(product_name,description,sku,price,stock_quantity,category,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [v.productName,v.description,v.sku,v.price,v.stockQuantity,v.category,auth.userId]
    );
    await audit(db, { actorId: auth.userId, actorEmail: auth.email, action: 'PRODUCT_CREATED',
      resourceType: 'product', resourceId: result.rows[0].id, description: `Created product ${v.productName}.` });
    res.status(201).json({ product: result.rows[0] });
  } catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ error: 'SKU already exists in this organization.' });
    throw e;
  }
});

productsRouter.patch('/:id', allowRoles('SUPER_ADMIN','INVENTORY_MANAGER'), async (req,res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid product ID.' });
  const parsed = productSchema.partial().safeParse(req.body);
  if (!parsed.success || !Object.keys(parsed.data ?? {}).length) return res.status(400).json({ error: 'Provide valid product fields.' });
  const fields: Record<string,string> = { productName:'product_name', description:'description', sku:'sku', price:'price', stockQuantity:'stock_quantity', category:'category' };
  const entries = Object.entries(parsed.data);
  const sets = entries.map(([key],i) => `${fields[key]}=$${i+1}`);
  sets.push('updated_at=NOW()');
  const values = entries.map(([,v])=>v);
  const db = getTenantPool(req.auth!.databaseName);
  const result = await db.query(`UPDATE products SET ${sets.join(',')} WHERE id=$${values.length+1} AND is_deleted=FALSE RETURNING *`, [...values,id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Product not found.' });
  await audit(db,{actorId:req.auth!.userId,actorEmail:req.auth!.email,action:'PRODUCT_UPDATED',resourceType:'product',resourceId:id,description:'Product updated.'});
  res.json({ product: result.rows[0] });
});

productsRouter.patch('/:id/publish', allowRoles('SUPER_ADMIN','INVENTORY_MANAGER'), async (req,res) => {
  const published = z.object({ published: z.boolean() }).safeParse(req.body);
  if (!published.success) return res.status(400).json({ error: 'published must be true or false.' });
  const id=Number(req.params.id), auth=req.auth!, db=getTenantPool(auth.databaseName);
  const result=await db.query(`UPDATE products SET is_published=$1,updated_at=NOW() WHERE id=$2 AND is_deleted=FALSE RETURNING *`,[published.data.published,id]);
  if (!result.rowCount) return res.status(404).json({error:'Product not found.'});
  await audit(db,{actorId:auth.userId,actorEmail:auth.email,action:published.data.published?'PRODUCT_PUBLISHED':'PRODUCT_UNPUBLISHED',resourceType:'product',resourceId:id,description:`Product ${published.data.published?'published':'unpublished'}.`});
  res.json({product:result.rows[0]});
});

productsRouter.delete('/:id', allowRoles('SUPER_ADMIN','INVENTORY_MANAGER'), async (req,res) => {
  const id=Number(req.params.id), auth=req.auth!, db=getTenantPool(auth.databaseName);
  const result=await db.query(`UPDATE products SET is_deleted=TRUE,is_published=FALSE,updated_at=NOW() WHERE id=$1 AND is_deleted=FALSE RETURNING id`,[id]);
  if (!result.rowCount) return res.status(404).json({error:'Product not found.'});
  await audit(db,{actorId:auth.userId,actorEmail:auth.email,action:'PRODUCT_DELETED',resourceType:'product',resourceId:id,description:'Product soft-deleted.'});
  res.json({message:'Product deleted.'});
});
