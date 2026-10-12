import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { authRouter } from './routes/auth.js';
import { productsRouter } from './routes/products.js';
import { ordersRouter } from './routes/orders.js';
import { publicRouter } from './routes/public.js';
import { adminRouter } from './routes/admin.js';

export const app=express();
app.use(helmet());
app.use(cors({origin:env.APP_BASE_URL,credentials:false}));
app.use(express.json({limit:'100kb'}));
app.get('/api/health',(_req,res)=>res.json({status:'ok'}));
app.use('/api/auth',authRouter);
app.use('/api/products',productsRouter);
app.use('/api/orders',ordersRouter);
app.use('/api/public',publicRouter);
app.use('/api',adminRouter);

app.use((err:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
  console.error('Unhandled API error:',err?.message??err);
  res.status(500).json({error:'Unexpected server error.'});
});
