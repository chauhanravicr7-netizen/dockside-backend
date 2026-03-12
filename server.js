// ============================================================
// DOCKSIDE BACKEND — server.js (Patched: Multi-tenant secure)
// Key fixes:
//  1. JWT now includes company_id
//  2. All GET/POST/PUT/DELETE routes filter by company_id
//  3. No more .select('*') without tenant isolation
// ============================================================

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

dotenv.config();

const app = express();
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-in-production';
const PORT = process.env.PORT || 5000;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (origin.endsWith('.vercel.app') || origin === 'http://localhost:5173') {
      return callback(null, true);
    }
    callback(new Error('CORS blocked'));
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── AUTH MIDDLEWARE ──────────────────────────────────────────
const verifyToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Helper: get company_id from JWT (used in every route)
const cid = (req) => req.user?.company_id;

// ── LOGIN ────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const { data: userData, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !userData) return res.status(401).json({ error: 'User not found' });

    // TODO: Add bcrypt password check here when you add hashed passwords
    // const valid = await bcrypt.compare(password, userData.password_hash);
    // if (!valid) return res.status(401).json({ error: 'Wrong password' });

    const token = jwt.sign(
      {
        id: userData.id,
        email: userData.email,
        role: userData.role,
        company_id: userData.company_id, // ← CRITICAL: include company_id in JWT
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: userData.id,
        email: userData.email,
        full_name: userData.full_name,
        role: userData.role,
        company_id: userData.company_id,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/logout', verifyToken, (req, res) => res.json({ message: 'Logged out' }));
app.get('/api/auth/me', verifyToken, (req, res) => res.json({ user: req.user }));

// ── INVENTORY ────────────────────────────────────────────────
app.get('/api/inventory', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .eq('company_id', cid(req))  // ← TENANT FILTER
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/inventory', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('inventory')
      .insert([{ ...req.body, company_id: cid(req) }])  // ← FORCE company_id
      .select();
    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/inventory/:id', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('inventory')
      .update(req.body)
      .eq('id', req.params.id)
      .eq('company_id', cid(req))  // ← PREVENT cross-tenant update
      .select();
    if (error) throw error;
    res.json(data[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/inventory/:id', verifyToken, async (req, res) => {
  try {
    const { error } = await supabase
      .from('inventory')
      .delete()
      .eq('id', req.params.id)
      .eq('company_id', cid(req));
    if (error) throw error;
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── YARDS ────────────────────────────────────────────────────
app.get('/api/yards', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('yards')
      .select('*')
      .eq('company_id', cid(req));
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/yards', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('yards')
      .insert([{ ...req.body, company_id: cid(req) }])
      .select();
    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/yards/:id', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('yards')
      .update(req.body)
      .eq('id', req.params.id)
      .eq('company_id', cid(req))
      .select();
    if (error) throw error;
    res.json(data[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SUPPLIERS ────────────────────────────────────────────────
app.get('/api/suppliers', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('company_id', cid(req));
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/suppliers', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('suppliers')
      .insert([{ ...req.body, company_id: cid(req) }])
      .select();
    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/suppliers/:id', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('suppliers')
      .update(req.body)
      .eq('id', req.params.id)
      .eq('company_id', cid(req))
      .select();
    if (error) throw error;
    res.json(data[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CUSTOMERS ────────────────────────────────────────────────
app.get('/api/customers', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('company_id', cid(req));
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/customers', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('customers')
      .insert([{ ...req.body, company_id: cid(req) }])
      .select();
    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/customers/:id', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('customers')
      .update(req.body)
      .eq('id', req.params.id)
      .eq('company_id', cid(req))
      .select();
    if (error) throw error;
    res.json(data[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DEALS ────────────────────────────────────────────────────
app.get('/api/deals', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('deals')
      .select('*')
      .eq('company_id', cid(req))
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/deals', verifyToken, async (req, res) => {
  try {
    const deal_number = `DEAL-${Date.now()}`;
    const { data, error } = await supabase
      .from('deals')
      .insert([{ ...req.body, deal_number, company_id: cid(req) }])
      .select();
    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/deals/:id', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('deals')
      .update(req.body)
      .eq('id', req.params.id)
      .eq('company_id', cid(req))
      .select();
    if (error) throw error;
    res.json(data[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SHIPMENTS / TRANSIT ──────────────────────────────────────
app.get('/api/shipments', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('shipments')
      .select('*')
      .eq('company_id', cid(req))
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/shipments', verifyToken, async (req, res) => {
  try {
    const shipment_number = `SHIP-${Date.now()}`;
    const payload = { shipment_number, company_id: cid(req) };
    const allowed = [
      'vehicle_number','driver_name','driver_phone','origin_yard_id',
      'destination','dispatch_date','expected_arrival','status','cargo_details'
    ];
    allowed.forEach(k => { if (req.body[k] !== undefined && req.body[k] !== '') payload[k] = req.body[k]; });
    if (req.body.freight_cost) payload.freight_cost = parseFloat(req.body.freight_cost) || 0;
    payload.created_at = new Date().toISOString();
    payload.updated_at = new Date().toISOString();

    const { data, error } = await supabase.from('shipments').insert([payload]).select();
    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/shipments/:id', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('shipments')
      .update(req.body)
      .eq('id', req.params.id)
      .eq('company_id', cid(req))
      .select();
    if (error) throw error;
    res.json(data[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DASHBOARD STATS ──────────────────────────────────────────
app.get('/api/dashboard/stats', verifyToken, async (req, res) => {
  try {
    const companyId = cid(req);
    const [invRes, dealRes, shipRes, yardRes] = await Promise.all([
      supabase.from('inventory').select('*').eq('company_id', companyId),
      supabase.from('deals').select('*').eq('company_id', companyId),
      supabase.from('shipments').select('*').eq('company_id', companyId),
      supabase.from('yards').select('*').eq('company_id', companyId),
    ]);
    const inventory = invRes.data || [];
    const deals = dealRes.data || [];
    const shipments = shipRes.data || [];
    const yards = yardRes.data || [];

    res.json({
      totalInventoryValue: inventory.reduce((s, i) => s + ((i.cost_price || 0) * (i.available_quantity || 0)), 0),
      totalVolume: inventory.reduce((s, i) => s + (i.available_quantity || 0), 0),
      activeShipments: shipments.filter(s => s.status !== 'Delivered').length,
      pendingDeliveries: deals.filter(d => d.stage === 'Dispatched').length,
      activeYards: yards.filter(y => y.is_active).length,
      totalProducts: inventory.length,
      totalDeals: deals.length,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── ACTIVITY LOGS ────────────────────────────────────────────
app.get('/api/activity-logs', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('company_id', cid(req))
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── COMPANY ──────────────────────────────────────────────────
app.get('/api/company', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('company')
      .select('*')
      .eq('id', cid(req))
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    res.json(data || {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/company/:id', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('company')
      .update(req.body)
      .eq('id', req.params.id)
      .eq('id', cid(req))  // only update your own company
      .select();
    if (error) throw error;
    res.json(data[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── HEALTH ───────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'OK', timestamp: new Date().toISOString() }));

app.listen(PORT, () => {
  console.log(`✅ Dockside backend running on port ${PORT}`);
});

export default app;
