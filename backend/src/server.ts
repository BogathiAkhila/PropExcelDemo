import { app } from './app.js';
import { env } from './config/env.js';
import { masterPool } from './db/master.js';
import { closeTenantPools } from './tenancy/tenantDb.js';

const server=app.listen(env.PORT,()=>console.log(`API listening on http://localhost:${env.PORT}`));
async function shutdown(){
  console.log('Shutting down...');
  server.close();
  await closeTenantPools();
  await masterPool.end();
  process.exit(0);
}
process.on('SIGINT',()=>void shutdown());
process.on('SIGTERM',()=>void shutdown());
