import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

dotenv.config();

const app = express();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
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

const verifyToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// ============================================================================
// AUTH - LOGIN (FIXED - NO PASSWORD CHECK)
// ============================================================================
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (userError || !userData) {
      console.log('User not found:', email);
      return res.status(401).json({ error: 'User not found' });
    }

    console.log('User found, logging in:', email);

    const token = jwt.sign(
      {
        id: userData.id,
        email: userData.email,
        role: userData.role,
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
      },
    });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

app.post('/api/auth/logout', verifyToken, (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

app.get('/api/auth/me', verifyToken, (req, res) => {
  res.json({ user: req.user });
});

// ============================================================================
// INVENTORY
// ============================================================================
app.get('/api/inventory', async (req, res) => {
  try {
    const { data, error } = await supabase.from('inventory').select('*');
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/inventory', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('inventory')
      .insert([req.body])
      .select();

    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/inventory/:id', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('inventory')
      .update(req.body)
      .eq('id', req.params.id)
      .select();

    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/inventory/:id', verifyToken, async (req, res) => {
  try {
    const { error } = await supabase
      .from('inventory')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ message: 'Item deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// YARDS
// ============================================================================
app.get('/api/yards', async (req, res) => {
  try {
    const { data, error } = await supabase.from('yards').select('*');
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/yards', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase.from('yards').insert([req.body]).select();
    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/yards/:id', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('yards')
      .update(req.body)
      .eq('id', req.params.id)
      .select();

    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// SUPPLIERS
// ============================================================================
app.get('/api/suppliers', async (req, res) => {
  try {
    const { data, error } = await supabase.from('suppliers').select('*');
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/suppliers', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase.from('suppliers').insert([req.body]).select();
    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/suppliers/:id', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('suppliers')
      .update(req.body)
      .eq('id', req.params.id)
      .select();

    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// CUSTOMERS
// ============================================================================
app.get('/api/customers', async (req, res) => {
  try {
    const { data, error } = await supabase.from('customers').select('*');
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/customers', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase.from('customers').insert([req.body]).select();
    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/customers/:id', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('customers')
      .update(req.body)
      .eq('id', req.params.id)
      .select();

    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// DEALS
// ============================================================================
app.get('/api/deals', async (req, res) => {
  try {
    const { data, error } = await supabase.from('deals').select('*');
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/deals', verifyToken, async (req, res) => {
  try {
    const deal_number = `DEAL-${Date.now()}`;
    const { data, error } = await supabase
      .from('deals')
      .insert([{ ...req.body, deal_number }])
      .select();

    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/deals/:id', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('deals')
      .update(req.body)
      .eq('id', req.params.id)
      .select();

    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// SHIPMENTS
// ============================================================================
app.get('/api/shipments', async (req, res) => {
  try {
    const { data, error } = await supabase.from('shipments').select('*');
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/shipments', verifyToken, async (req, res) => {
  try {
    const shipment_number = `SHIP-${Date.now()}`;

    // Build a clean payload — only include fields that are set
    // This prevents 500 errors from unknown/null columns in Supabase
    const payload = { shipment_number };
    const allowed = [
      'vehicle_number','driver_name','driver_phone','origin_yard_id',
      'destination','dispatch_date','expected_arrival','status','cargo_details'
    ];
    allowed.forEach(k => { if (req.body[k] !== undefined && req.body[k] !== '') payload[k] = req.body[k]; });
    if (req.body.freight_cost) payload.freight_cost = parseFloat(req.body.freight_cost) || 0;
    payload.created_at = new Date().toISOString();
    payload.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('shipments')
      .insert([payload])
      .select();

    if (error) {
      console.error('Supabase shipment error:', error.message, error.details, error.hint);
      return res.status(500).json({ error: error.message, hint: error.hint, details: error.details });
    }
    res.status(201).json(data[0]);
  } catch (error) {
    console.error('Shipments POST error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/shipments/:id', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('shipments')
      .update(req.body)
      .eq('id', req.params.id)
      .select();

    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// ACTIVITY LOGS
// ============================================================================
app.get('/api/activity-logs', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// DASHBOARD STATS
// ============================================================================
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const [inventoryRes, dealsRes, shipmentsRes, yardsRes] = await Promise.all([
      supabase.from('inventory').select('*'),
      supabase.from('deals').select('*'),
      supabase.from('shipments').select('*'),
      supabase.from('yards').select('*'),
    ]);

    const inventory = inventoryRes.data || [];
    const deals = dealsRes.data || [];
    const shipments = shipmentsRes.data || [];
    const yards = yardsRes.data || [];

    const totalInventoryValue = inventory.reduce((sum, item) => {
      return sum + ((item.cost_price || 0) * (item.available_quantity || 0));
    }, 0);

    const totalVolume = inventory.reduce((sum, item) => {
      return sum + (item.available_quantity || 0);
    }, 0);

    const activeShipments = shipments.filter(s => s.status !== 'Delivered').length;
    const pendingDeliveries = deals.filter(d => d.stage === 'Dispatched').length;
    const activeYards = yards.filter(y => y.is_active).length;

    res.json({
      totalInventoryValue,
      totalVolume,
      activeShipments,
      pendingDeliveries,
      activeYards,
      totalProducts: inventory.length,
      totalCustomers: deals.length,
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// COMPANY
// ============================================================================
app.get('/api/company', async (req, res) => {
  try {
    const { data, error } = await supabase.from('company').select('*').single();
    if (error && error.code !== 'PGRST116') throw error;
    res.json(data || {});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/company/:id', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('company')
      .update(req.body)
      .eq('id', req.params.id)
      .select();

    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// HEALTH CHECK
// ============================================================================
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ============================================================================
// START SERVER
// ============================================================================
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║  ✅ Dockside Backend Server Started                           ║
║                                                                ║
║  Server: http://localhost:${PORT}                               ║
║  API:    http://localhost:${PORT}/api                           ║
║  Health: http://localhost:${PORT}/health                        ║
║                                                                ║
║  Database: ${SUPABASE_URL ? '✅ Connected' : '❌ Not connected'}                        ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
  `);
});

export default app;
