// ============================================================
// DOCKSIDE BACKEND — server.js
// Multi-tenant | RBAC | Financial masking | Stock transfer
// ============================================================
import express   from 'express';
import cors      from 'cors';
import dotenv    from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import jwt       from 'jsonwebtoken';

dotenv.config();

const app            = express();
const SUPABASE_URL   = process.env.SUPABASE_URL;
const SUPABASE_KEY   = process.env.SUPABASE_ANON_KEY;
const JWT_SECRET     = process.env.JWT_SECRET || 'change-in-production';
const PORT           = process.env.PORT || 5000;

if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('❌ Missing Supabase env vars'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── CORS ─────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || origin.endsWith('.vercel.app') || origin === 'http://localhost:5173')
      return cb(null, true);
    cb(new Error('CORS blocked'));
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── AUTH MIDDLEWARE ──────────────────────────────────────────
const verifyToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    // req.user now has: { id, email, role, company_id }
    next();
  } catch { return res.status(401).json({ error: 'Invalid token' }); }
};

// Middleware: Admin-only routes
const requireAdmin = (req, res, next) => {
  if ((req.user?.role || '').toLowerCase() !== 'admin')
    return res.status(403).json({ error: 'Admin access required' });
  next();
};

const cid      = (req) => req.user?.company_id;
const isAdmin  = (req) => (req.user?.role || '').toLowerCase() === 'admin';

// ── FINANCIAL DATA MASKING ───────────────────────────────────
const maskInventoryForUser = (items) =>
  items.map(i => {
    const { cost_price, ...rest } = i;        // strip cost
    return rest;
  });

const maskDealsForUser = (deals) =>
  deals.map(d => {
    const { profit, margin, unit_cost, cost_price, ...rest } = d;
    return rest;
  });

// ── LOGIN ────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const { data, error } = await supabase
      .from('users').select('*').eq('email', email).single();
    if (error || !data) return res.status(401).json({ error: 'User not found' });

    const token = jwt.sign(
      { id: data.id, email: data.email, role: data.role, company_id: data.company_id },
      JWT_SECRET, { expiresIn: '24h' }
    );
    res.json({ token, user: { id:data.id, email:data.email, full_name:data.full_name, role:data.role, company_id:data.company_id } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/logout', verifyToken, (_, res) => res.json({ message: 'Logged out' }));
app.get('/api/auth/me', verifyToken, (req, res) => res.json({ user: req.user }));

// ── INVENTORY ────────────────────────────────────────────────
app.get('/api/inventory', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('inventory').select('*')
      .eq('company_id', cid(req))
      .order('created_at', { ascending: false });
    if (error) throw error;
    const result = isAdmin(req) ? data : maskInventoryForUser(data || []);
    res.json(result || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/inventory', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('inventory').insert([{ ...req.body, company_id: cid(req) }]).select();
    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/inventory/:id', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('inventory').update(req.body)
      .eq('id', req.params.id).eq('company_id', cid(req)).select();
    if (error) throw error;
    res.json(data[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/inventory/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { error } = await supabase
      .from('inventory').delete()
      .eq('id', req.params.id).eq('company_id', cid(req));
    if (error) throw error;
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── STOCK TRANSFER ───────────────────────────────────────────
app.post('/api/inventory/transfer', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { inventory_id, source_yard_id, destination_yard_id, quantity, notes } = req.body;

    if (!inventory_id || !destination_yard_id || !quantity)
      return res.status(400).json({ error: 'inventory_id, destination_yard_id, quantity required' });

    const { data, error } = await supabase.rpc('transfer_stock', {
      p_inventory_id:       inventory_id,
      p_source_yard_id:     source_yard_id || null,
      p_destination_yard_id: destination_yard_id,
      p_quantity:           parseFloat(quantity),
      p_company_id:         cid(req),
      p_notes:              notes || null,
    });

    if (error) throw error;
    res.json({ message: 'Stock transferred successfully', transfer: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── YARDS ────────────────────────────────────────────────────
app.get('/api/yards', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase.from('yards').select('*').eq('company_id', cid(req));
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/yards', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase.from('yards').insert([{ ...req.body, company_id: cid(req) }]).select();
    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/yards/:id', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase.from('yards').update(req.body).eq('id', req.params.id).eq('company_id', cid(req)).select();
    if (error) throw error;
    res.json(data[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SUPPLIERS ────────────────────────────────────────────────
app.get('/api/suppliers', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase.from('suppliers').select('*').eq('company_id', cid(req));
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/suppliers', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase.from('suppliers').insert([{ ...req.body, company_id: cid(req) }]).select();
    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/suppliers/:id', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase.from('suppliers').update(req.body).eq('id', req.params.id).eq('company_id', cid(req)).select();
    if (error) throw error;
    res.json(data[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CUSTOMERS ────────────────────────────────────────────────
app.get('/api/customers', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase.from('customers').select('*').eq('company_id', cid(req));
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/customers', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase.from('customers').insert([{ ...req.body, company_id: cid(req) }]).select();
    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/customers/:id', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase.from('customers').update(req.body).eq('id', req.params.id).eq('company_id', cid(req)).select();
    if (error) throw error;
    res.json(data[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── AUTOCOMPLETE SEARCH ──────────────────────────────────────
app.get('/api/autocomplete/suppliers', verifyToken, async (req, res) => {
  try {
    const q = req.query.q || '';
    const { data, error } = await supabase
      .from('suppliers')
      .select('id, name, city, gst_number')
      .eq('company_id', cid(req))
      .ilike('name', `%${q}%`)
      .limit(10);
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/autocomplete/customers', verifyToken, async (req, res) => {
  try {
    const q = req.query.q || '';
    const { data, error } = await supabase
      .from('customers')
      .select('id, name, city, gst_number')
      .eq('company_id', cid(req))
      .ilike('name', `%${q}%`)
      .limit(10);
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DEALS ────────────────────────────────────────────────────
app.get('/api/deals', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('deals').select('*')
      .eq('company_id', cid(req))
      .order('created_at', { ascending: false });
    if (error) throw error;
    const result = isAdmin(req) ? data : maskDealsForUser(data || []);
    res.json(result || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/deals', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('deals').insert([{ ...req.body, deal_number: `DEAL-${Date.now()}`, company_id: cid(req) }]).select();
    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/deals/:id', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('deals').update(req.body).eq('id', req.params.id).eq('company_id', cid(req)).select();
    if (error) throw error;
    res.json(data[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SHIPMENTS / TRANSIT ──────────────────────────────────────
app.get('/api/shipments', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('shipments').select('*').eq('company_id', cid(req)).order('created_at', { ascending: false });
    if (error) throw error;
    // Demurrage calculation: auto-compute penalty if overdue
    const now = new Date();
    const result = (data || []).map(s => {
      if (s.demurrage_deadline && s.customs_status !== 'Cleared') {
        const deadline = new Date(s.demurrage_deadline);
        const daysOverdue = Math.max(0, Math.floor((now - deadline) / (1000 * 60 * 60 * 24)));
        const DAILY_PENALTY = 5000; // ₹5000/day default
        return { ...s, demurrage_days_overdue: daysOverdue, demurrage_penalty: daysOverdue * DAILY_PENALTY };
      }
      return { ...s, demurrage_days_overdue: 0, demurrage_penalty: 0 };
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/shipments', verifyToken, async (req, res) => {
  try {
    const payload = {
      shipment_number: `SHIP-${Date.now()}`,
      company_id: cid(req),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const allowed = ['vehicle_number','driver_name','driver_phone','origin_yard_id','destination',
      'dispatch_date','expected_arrival','status','cargo_details','freight_cost',
      'bl_number','customs_status','demurrage_deadline'];
    allowed.forEach(k => { if (req.body[k] !== undefined && req.body[k] !== '') payload[k] = req.body[k]; });
    if (payload.freight_cost) payload.freight_cost = parseFloat(payload.freight_cost) || 0;
    const { data, error } = await supabase.from('shipments').insert([payload]).select();
    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/shipments/:id', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase.from('shipments').update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('company_id', cid(req)).select();
    if (error) throw error;
    res.json(data[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DASHBOARD STATS (Role-aware aggregation) ─────────────────
app.get('/api/dashboard/stats', verifyToken, async (req, res) => {
  try {
    const companyId = cid(req);
    const admin = isAdmin(req);

    // Always fetch these (lightweight)
    const [invRes, dealRes, shipRes, yardRes] = await Promise.all([
      supabase.from('inventory').select('available_quantity,cost_price,stock_status').eq('company_id', companyId),
      supabase.from('deals').select('total_value,stage,payment_status').eq('company_id', companyId),
      supabase.from('shipments').select('status,demurrage_deadline,customs_status').eq('company_id', companyId),
      supabase.from('yards').select('id,is_active').eq('company_id', companyId),
    ]);

    const inv   = invRes.data   || [];
    const deals = dealRes.data  || [];
    const ships = shipRes.data  || [];
    const yards = yardRes.data  || [];

    // Stats available to ALL roles
    const baseStats = {
      total_inventory_count: inv.length,
      active_deals_revenue:  deals.filter(d => !['completed','delivered'].includes((d.stage||'').toLowerCase()))
                                   .reduce((s, d) => s + (d.total_value || 0), 0),
      delayed_shipments:     ships.filter(s => {
        if (!s.demurrage_deadline) return false;
        return new Date(s.demurrage_deadline) < new Date() && s.customs_status !== 'Cleared';
      }).length,
      total_products:        inv.length,
      total_deals:           deals.length,
      active_yards:          yards.filter(y => y.is_active !== false).length,
      active_shipments:      ships.filter(s => s.status !== 'Delivered').length,
      pending_deliveries:    deals.filter(d => (d.stage||'').toLowerCase() === 'dispatched').length,
    };

    if (!admin) return res.json(baseStats);

    // Admin-only additions
    const totalInventoryValue = inv.reduce((s,i) => s + (i.cost_price||0)*(i.available_quantity||0), 0);
    const paidRevenue         = deals.filter(d => d.payment_status === 'Paid').reduce((s,d) => s + (d.total_value||0), 0);
    const lowStockCount       = inv.filter(i => (i.available_quantity||0) < 10 && (i.stock_status||'Available') !== 'Sold').length;

    res.json({
      ...baseStats,
      total_inventory_value: totalInventoryValue,
      total_net_profit:      paidRevenue * 0.18, // approximate 18% margin
      low_stock_alerts_count: lowStockCount,
      totalVolume:           inv.reduce((s,i) => s + (i.available_quantity||0), 0),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── COMPANY ──────────────────────────────────────────────────
app.get('/api/company', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase.from('company').select('*').eq('id', cid(req)).single();
    if (error && error.code !== 'PGRST116') throw error;
    res.json(data || {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/company/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase.from('company').update(req.body).eq('id', req.params.id).eq('id', cid(req)).select();
    if (error) throw error;
    res.json(data[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── REPORTS DATA ─────────────────────────────────────────────
const reportTables = { inventory:'inventory', sales:'deals', shipments:'shipments', suppliers:'suppliers', customers:'customers' };
Object.entries(reportTables).forEach(([key, table]) => {
  app.get(`/api/reports/${key}`, verifyToken, requireAdmin, async (req, res) => {
    try {
      const { data, error } = await supabase.from(table).select('*').eq('company_id', cid(req));
      if (error) throw error;
      res.json(data || []);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
});

// ── ACTIVITY LOGS ─────────────────────────────────────────────
app.get('/api/activity-logs', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase.from('activity_logs').select('*')
      .eq('company_id', cid(req)).order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── HEALTH ────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'OK', timestamp: new Date().toISOString() }));

app.listen(PORT, () => console.log(`✅ Dockside backend :${PORT}`));
export default app;
