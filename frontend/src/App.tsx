import { FormEvent, useEffect, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { api, setToken } from './api';

type Product = { id:number; product_name:string; description:string; sku:string; price:string; stock_quantity:number; category:string; is_published:boolean };
type Order = { id:number; order_number:string; customer_name:string; customer_email:string; product_name_at_order:string; quantity:number; total_amount:string; order_status:string; created_at:string };
type User = { organizationId:string; role:string; email:string };

function Shell({user,logout,children}:{user:User|null;logout:()=>void;children:React.ReactNode}) {
  return <div className="app-shell"><aside className="sidebar"><div className="brand"><span className="brand-mark">I</span><span>Inventory<span className="muted">Cloud</span></span></div>
    <nav><Link to="/">Dashboard</Link><Link to="/inventory">Inventory</Link><Link to="/orders">Orders</Link>{user?.role==='SUPER_ADMIN'&&<Link to="/activity">Activity Logs</Link>}<Link to="/subscription">Subscription</Link></nav>
    <div className="side-bottom">{user?<><small>{user.email}</small><small className="muted">{user.organizationId} · {user.role.replace('_',' ')}</small><button className="secondary full" onClick={logout}>Sign out</button></>:<Link to="/signin">Sign in</Link>}</div>
  </aside><main className="main">{children}</main></div>
}

export default function App(){
  const [user,setUser]=useState<User|null>(null);
  const [notice,setNotice]=useState('');
  const navigate=useNavigate();
  const logout=()=>{setToken(null);setUser(null);navigate('/signin');};
  const requireUser=()=>{if(!user){navigate('/signin');return false;}return true;};
  return <Shell user={user} logout={logout}><Routes>
    <Route path="/signup" element={<Signup setNotice={setNotice} notice={notice} onDone={(t,u)=>{setToken(t);setUser(u);navigate('/');}}/>}/>
    <Route path="/signin" element={<Signin onDone={(t,u)=>{setToken(t);setUser(u);navigate('/');}}/>}/>
    <Route path="/" element={<Dashboard user={user} requireUser={requireUser}/>}/>
    <Route path="/inventory" element={<Inventory user={user} requireUser={requireUser}/>}/>
    <Route path="/orders" element={<Orders user={user} requireUser={requireUser}/>}/>
    <Route path="/activity" element={<Activity user={user} requireUser={requireUser}/>}/>
    <Route path="/subscription" element={<Subscription user={user} requireUser={requireUser}/>}/>
    <Route path="/order/:organizationId" element={<PublicOrder/>}/>
    <Route path="*" element={<div className="panel"><h2>Page not found</h2><Link to="/">Return to dashboard</Link></div>}/>
  </Routes></Shell>;
}

function Signup({onDone,notice,setNotice}:{onDone:(t:string,u:User)=>void;notice:string;setNotice:(v:string)=>void}){
  const [form,setForm]=useState({organizationId:'',organizationName:'',email:'',password:'',confirmPassword:'',country:'India'});
  const [busy,setBusy]=useState(false);
  const change=(e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement>)=>setForm({...form,[e.target.name]:e.target.value});
  async function submit(e:FormEvent){e.preventDefault();setNotice('');if(!/^[A-Za-z0-9]{3,40}$/.test(form.organizationId)){setNotice('Organization ID must be 3–40 letters or numbers only.');return;}if(form.password!==form.confirmPassword){setNotice('Passwords do not match.');return;}setBusy(true);try{const result=await api<{token:string;organizationId:string}>('/auth/signup',{method:'POST',body:JSON.stringify(form)});onDone(result.token,{organizationId:result.organizationId,role:'SUPER_ADMIN',email:form.email});}catch(err){setNotice((err as Error).message);}finally{setBusy(false);}}
  const countries=['India','United States','United Kingdom','Canada','Australia','Singapore','United Arab Emirates','Germany','France','Japan','Brazil','South Africa','Other'];
  return <div className="auth-wrap"><form className="panel auth-card" onSubmit={submit}><span className="eyebrow">GET STARTED</span><h1>Create your organization</h1><p className="muted">Your account will be the organization Super Admin.</p>
    {notice&&<div className="notice error">{notice}</div>}
    <label>Organization ID<input name="organizationId" value={form.organizationId} onChange={change} required minLength={3} maxLength={40} pattern="[A-Za-z0-9]+" placeholder="e.g. ACME2026"/></label>
    <label>Organization name<input name="organizationName" value={form.organizationName} onChange={change} required minLength={2} maxLength={180}/></label>
    <label>Email<input name="email" type="email" value={form.email} onChange={change} required/></label>
    <label>Password<input name="password" type="password" value={form.password} onChange={change} required minLength={10}/><small className="muted">Use at least 10 characters.</small></label>
    <label>Confirm password<input name="confirmPassword" type="password" value={form.confirmPassword} onChange={change} required/></label>
    <label>Country<select name="country" value={form.country} onChange={change}>{countries.map(c=><option key={c}>{c}</option>)}</select></label>
    <button className="primary full" disabled={busy}>{busy?'Creating...':'Create organization'}</button><p className="center muted">Already registered? <Link to="/signin">Sign in</Link></p>
  </form></div>
}

function Signin({onDone}:{onDone:(t:string,u:User)=>void}){
  const [form,setForm]=useState({organizationId:'',email:'',password:''}),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{const r=await api<{token:string;organizationId:string;role:string;email:string}>('/auth/signin',{method:'POST',body:JSON.stringify(form)});onDone(r.token,{organizationId:r.organizationId,role:r.role,email:r.email});}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <div className="auth-wrap"><form className="panel auth-card" onSubmit={submit}><span className="eyebrow">WELCOME BACK</span><h1>Sign in</h1><p className="muted">Access your organization's workspace.</p>{error&&<div className="notice error">{error}</div>}
    <label>Organization ID<input value={form.organizationId} onChange={e=>setForm({...form,organizationId:e.target.value})} required/></label><label>Email<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} required/></label><label>Password<input type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} required/></label><button className="primary full" disabled={busy}>{busy?'Signing in...':'Sign in'}</button><p className="center muted">New here? <Link to="/signup">Create an organization</Link></p>
  </form></div>
}

function Dashboard({user,requireUser}:{user:User|null;requireUser:()=>boolean}){
  const [data,setData]=useState({products:0,orders:0,processing:0,delivered:0});
  useEffect(()=>{if(!user)return;Promise.all([api<{products:Product[]}>('/products'),api<{orders:Order[]}>('/orders')]).then(([p,o])=>setData({products:p.products.length,orders:o.orders.length,processing:o.orders.filter(x=>['CONFIRMED','PROCESSING','PACKED'].includes(x.order_status)).length,delivered:o.orders.filter(x=>x.order_status==='DELIVERED').length})).catch(()=>{});},[user]);
  if(!user)return <div className="welcome"><span className="eyebrow">INVENTORY CLOUD</span><h1>Manage inventory.<br/><span className="accent">Move orders forward.</span></h1><p className="muted">A secure workspace for your products, orders, and organization activity.</p><div className="actions"><Link className="button primary" to="/signup">Create organization</Link><Link className="button secondary" to="/signin">Sign in</Link></div><div className="feature-grid"><div className="panel"><h3>Inventory control</h3><p className="muted">Manage products, stock, and publishing.</p></div><div className="panel"><h3>Order tracking</h3><p className="muted">Track orders from confirmation to delivery.</p></div><div className="panel"><h3>Audit visibility</h3><p className="muted">Review important organization actions.</p></div></div></div>;
  return <><PageTitle eyebrow="OVERVIEW" title="Dashboard" subtitle={`Welcome to ${user.organizationId}. Here's your workspace at a glance.`}/><div className="stats"><Stat label="Products" value={data.products}/><Stat label="Total orders" value={data.orders}/><Stat label="In progress" value={data.processing}/><Stat label="Delivered" value={data.delivered}/></div><div className="panel"><h3>Quick actions</h3><div className="actions"><Link className="button primary" to="/inventory">Manage inventory</Link><Link className="button secondary" to="/orders">View orders</Link><Link className="button secondary" to={`/order/${user.organizationId}`} target="_blank">Open public order page ↗</Link></div></div></>;
}
function Stat({label,value}:{label:string;value:string|number}){return <div className="panel stat"><span className="muted">{label}</span><strong>{value}</strong></div>}
function PageTitle({eyebrow,title,subtitle}:{eyebrow:string;title:string;subtitle:string}){return <div className="page-title"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p className="muted">{subtitle}</p></div>}

function Inventory({user,requireUser}:{user:User|null;requireUser:()=>boolean}){
 const [products,setProducts]=useState<Product[]>([]),[error,setError]=useState(''),[form,setForm]=useState({productName:'',description:'',sku:'',price:'',stockQuantity:'0',category:''}),[busy,setBusy]=useState(false);
 async function load(){if(!user)return;try{setProducts((await api<{products:Product[]}>('/products')).products);}catch(e){setError((e as Error).message);}}
 useEffect(()=>{if(user)void load();},[user]);
 async function create(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{await api('/products',{method:'POST',body:JSON.stringify({...form,price:Number(form.price),stockQuantity:Number(form.stockQuantity)})});setForm({productName:'',description:'',sku:'',price:'',stockQuantity:'0',category:''});await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function toggle(p:Product){try{await api(`/products/${p.id}/publish`,{method:'PATCH',body:JSON.stringify({published:!p.is_published})});await load();}catch(e){setError((e as Error).message);}}
 async function remove(id:number){if(!confirm('Delete this product?'))return;try{await api(`/products/${id}`,{method:'DELETE'});await load();}catch(e){setError((e as Error).message);}}
 if(!user){requireUser();return null;}
 return <><PageTitle eyebrow="CATALOG" title="Inventory" subtitle="Create products, manage stock, and publish items for public ordering."/>
 {error&&<div className="notice error">{error}</div>}<form className="panel product-form" onSubmit={create}><h3>Add product</h3><div className="form-grid"><label>Product name<input required value={form.productName} onChange={e=>setForm({...form,productName:e.target.value})}/></label><label>SKU<input required pattern="[A-Za-z0-9_-]+" value={form.sku} onChange={e=>setForm({...form,sku:e.target.value})}/></label><label>Price<input required type="number" min="0" step="0.01" value={form.price} onChange={e=>setForm({...form,price:e.target.value})}/></label><label>Stock quantity<input required type="number" min="0" step="1" value={form.stockQuantity} onChange={e=>setForm({...form,stockQuantity:e.target.value})}/></label><label>Category<input value={form.category} onChange={e=>setForm({...form,category:e.target.value})}/></label><label>Description<input value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label></div><button className="primary" disabled={busy}>{busy?'Saving...':'Create product'}</button></form>
 <div className="panel"><h3>Products <span className="count">{products.length}</span></h3>{!products.length?<p className="muted">No products yet. Create your first product above.</p>:<div className="table-wrap"><table><thead><tr><th>Product</th><th>SKU</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th></tr></thead><tbody>{products.map(p=><tr key={p.id}><td><strong>{p.product_name}</strong><small>{p.category||'Uncategorized'}</small></td><td>{p.sku}</td><td>{Number(p.price).toFixed(2)}</td><td>{p.stock_quantity}</td><td><span className={`pill ${p.is_published?'good':''}`}>{p.is_published?'Published':'Draft'}</span></td><td><div className="row-actions"><button className="secondary small" onClick={()=>void toggle(p)}>{p.is_published?'Unpublish':'Publish'}</button><button className="danger small" onClick={()=>void remove(p.id)}>Delete</button></div></td></tr>)}</tbody></table></div>}</div></>;
}

function Orders({user,requireUser}:{user:User|null;requireUser:()=>boolean}){
 const [orders,setOrders]=useState<Order[]>([]),[error,setError]=useState('');
 async function load(){if(!user)return;try{setOrders((await api<{orders:Order[]}>('/orders')).orders);}catch(e){setError((e as Error).message);}}
 useEffect(()=>{if(user)void load();},[user]);
 async function update(id:number,status:string){try{await api(`/orders/${id}/status`,{method:'PATCH',body:JSON.stringify({status})});await load();}catch(e){setError((e as Error).message);}}
 if(!user){requireUser();return null;}
 const next:Record<string,string>={CONFIRMED:'PROCESSING',PROCESSING:'PACKED',PACKED:'SHIPPING',SHIPPING:'DELIVERED'};
 return <><PageTitle eyebrow="FULFILLMENT" title="Orders" subtitle="Track customer orders and advance them through the fulfillment workflow."/>{error&&<div className="notice error">{error}</div>}<div className="panel"><div className="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Product</th><th>Qty</th><th>Total</th><th>Status</th><th>Action</th></tr></thead><tbody>{orders.map(o=><tr key={o.id}><td><strong>{o.order_number}</strong><small>{new Date(o.created_at).toLocaleDateString()}</small></td><td>{o.customer_name}<small>{o.customer_email}</small></td><td>{o.product_name_at_order}</td><td>{o.quantity}</td><td>{Number(o.total_amount).toFixed(2)}</td><td><span className="pill">{o.order_status}</span></td><td>{next[o.order_status]&&<button className="secondary small" onClick={()=>void update(o.id,next[o.order_status])}>Mark {next[o.order_status].toLowerCase()}</button>}</td></tr>)}</tbody></table></div>{!orders.length&&<p className="muted">No orders yet. Share your public order page to receive orders.</p>}</div></>;
}

function Activity({user,requireUser}:{user:User|null;requireUser:()=>boolean}){
 const [logs,setLogs]=useState<any[]>([]),[error,setError]=useState('');
 useEffect(()=>{if(!user)return;api<{logs:any[]}>('/activity-logs').then(x=>setLogs(x.logs)).catch(e=>setError((e as Error).message));},[user]);
 if(!user){requireUser();return null;}if(user.role!=='SUPER_ADMIN')return <div className="panel"><h2>Access denied</h2><p>Only Super Admins can view activity logs.</p></div>;
 return <><PageTitle eyebrow="SECURITY & AUDIT" title="Activity logs" subtitle="Recent recorded actions for your organization."/>{error&&<div className="notice error">{error}</div>}<div className="panel table-wrap"><table><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Outcome</th><th>Resource</th><th>Details</th></tr></thead><tbody>{logs.map(l=><tr key={l.id}><td>{new Date(l.created_at).toLocaleString()}</td><td>{l.actor_email||l.actor_type}</td><td>{l.action}</td><td>{l.outcome}</td><td>{l.resource_type} {l.resource_id||''}</td><td>{l.description}</td></tr>)}</tbody></table>{!logs.length&&<p className="muted">No audit events recorded yet.</p>}</div></>;
}

function Subscription({user,requireUser}:{user:User|null;requireUser:()=>boolean}){
 const [sub,setSub]=useState<any>(null),[error,setError]=useState('');
 useEffect(()=>{if(user)api<any>('/subscription').then(setSub).catch(e=>setError((e as Error).message));},[user]);
 if(!user){requireUser();return null;}
 return <><PageTitle eyebrow="PLAN & BILLING" title="Subscription" subtitle="Review your organization's plan and free-trial period."/>{error&&<div className="notice error">{error}</div>}{sub&&<div className="panel subscription"><span className="eyebrow">{sub.subscription_status}</span><h2>{sub.subscription_plan.replace('_',' ')}</h2><p className="muted">{sub.organization_name} · {sub.organization_id}</p><div className="stats compact"><Stat label="Trial days remaining" value={sub.remainingTrialDays}/><Stat label="Trial starts" value={new Date(sub.trial_start_date).toLocaleDateString()}/><Stat label="Trial ends" value={new Date(sub.trial_end_date).toLocaleDateString()}/></div><p className="muted">Billing integration is not included in this starter.</p></div>}</>;
}

function PublicOrder(){
 const {organizationId=''}=useParams(),[products,setProducts]=useState<Product[]>([]),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [form,setForm]=useState({customerName:'',customerEmail:'',productId:'',quantity:'1',deliveryAddress:''});
 useEffect(()=>{api<{products:Product[]}>(`/public/products/${encodeURIComponent(organizationId)}`).then(r=>{setProducts(r.products);if(r.products[0])setForm(f=>({...f,productId:String(r.products[0].id)}));}).catch(e=>setError((e as Error).message));},[organizationId]);
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');setMessage('');try{const r=await api<{message:string;order:{order_number:string}}>('/public/orders/'+encodeURIComponent(organizationId),{method:'POST',body:JSON.stringify({...form,productId:Number(form.productId),quantity:Number(form.quantity)})});setMessage(`${r.message} Reference: ${r.order.order_number}`);setForm(f=>({...f,customerName:'',customerEmail:'',deliveryAddress:''}));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <div className="public-wrap"><div className="public-heading"><span className="brand-mark">I</span><span className="eyebrow">PUBLIC CATALOG</span><h1>Order products</h1><p className="muted">Organization {organizationId}</p></div>{error&&<div className="notice error">{error}</div>}{message&&<div className="notice success">{message}</div>}<div className="public-grid"><section className="panel"><h2>Available products</h2>{products.map(p=><button key={p.id} className={`product-choice ${form.productId===String(p.id)?'selected':''}`} onClick={()=>setForm({...form,productId:String(p.id)})}><span><strong>{p.product_name}</strong><small>{p.description}</small><small>{p.stock_quantity} in stock</small></span><b>{Number(p.price).toFixed(2)}</b></button>)}{!products.length&&<p className="muted">No published products are currently available.</p>}</section><form className="panel" onSubmit={submit}><h2>Delivery details</h2><label>Your name<input required minLength={2} value={form.customerName} onChange={e=>setForm({...form,customerName:e.target.value})}/></label><label>Email<input type="email" required value={form.customerEmail} onChange={e=>setForm({...form,customerEmail:e.target.value})}/></label><label>Product<select required value={form.productId} onChange={e=>setForm({...form,productId:e.target.value})}>{products.map(p=><option key={p.id} value={p.id}>{p.product_name} — {Number(p.price).toFixed(2)}</option>)}</select></label><label>Quantity<input type="number" min="1" max="1000" required value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})}/></label><label>Delivery address<textarea required minLength={5} value={form.deliveryAddress} onChange={e=>setForm({...form,deliveryAddress:e.target.value})}/></label><button className="primary full" disabled={busy||!products.length}>{busy?'Placing order...':'Place order'}</button><small className="muted">Your order total is calculated securely by the server.</small></form></div></div>;
}
