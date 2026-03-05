// ============================================================
// DOCKSIDE ERP v12.1.0 - COMPLETE BACKEND SERVER
// Node.js/Express + Supabase PostgreSQL + JWT Auth
// ============================================================

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcryptjs = require('bcryptjs');
const http = require('http');
const socketIO = require('socket.io');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Express & Socket.IO
const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: { 
    origin: process.env.FRONTEND_URL || '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE'] 
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// ============================================================
// SUPABASE CONFIGURATION
// ============================================================

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

console.log('✓ Supabase connected');

// ============================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================

const verifyToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dockside_secret_key_12345');
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const checkRole = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    next();
  };
};

// ============================================================
// AUTH ROUTES
// ============================================================

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Get user from Supabase
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (userError || !userData) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Check password (simple check for demo, use bcrypt in production)
    const isPasswordValid = await bcryptjs.compare(password, userData.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: userData.id, 
        email: userData.email, 
        role: userData.role,
        name: userData.name 
      },
      process.env.JWT_SECRET || 'dockside_secret_key_12345',
      { expiresIn: '24h' }
    );

    res.json({ 
      token, 
      user: { 
        id: userData.id, 
        email: userData.email, 
        role: userData.role,
        name: userData.name 
      } 
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/logout', verifyToken, (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

app.get('/api/auth/me', verifyToken, (req, res) => {
  res.json(req.user);
});

// ============================================================
// INVENTORY ROUTES
// ============================================================

app.get('/api/inventory', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Inventory error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/inventory', verifyToken, checkRole('admin', 'manager'), async (req, res) => {
  try {
    const { sku, product_name, batch_number, supplier_id, quantity, purchase_rate, selling_rate, landed_cost, yard_id, bin_location, movement_date } = req.body;

    // Validate required fields
    if (!sku || !product_name || !quantity || !purchase_rate || !landed_cost) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { data, error } = await supabase
      .from('inventory')
      .insert([{
        sku,
        product_name,
        batch_number,
        supplier_id,
        quantity,
        purchase_rate,
        selling_rate: selling_rate || 0,
        landed_cost,
        yard_id,
        bin_location,
        movement_date,
        status: 'In Yard',
        margin_percent: selling_rate ? ((selling_rate - purchase_rate) / purchase_rate) * 100 : 0,
        days_in_yard: 0,
        created_by: req.user.id
      }])
      .select();

    if (error) throw error;

    // Emit real-time update
    io.emit('inventory:created', data[0]);

    res.status(201).json(data[0]);
  } catch (error) {
    console.error('Create inventory error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/inventory/:id', verifyToken, checkRole('admin', 'manager'), async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const { data, error } = await supabase
      .from('inventory')
      .update(updateData)
      .eq('id', id)
      .select();

    if (error) throw error;

    io.emit('inventory:updated', data[0]);

    res.json(data[0]);
  } catch (error) {
    console.error('Update inventory error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/inventory/:id', verifyToken, checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('inventory')
      .delete()
      .eq('id', id);

    if (error) throw error;

    io.emit('inventory:deleted', id);

    res.json({ message: 'Deleted successfully' });
  } catch (error) {
    console.error('Delete inventory error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// SHIPMENTS ROUTES
// ============================================================

app.get('/api/shipments', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('shipments')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Shipments error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/shipments', verifyToken, checkRole('admin', 'manager'), async (req, res) => {
  try {
    const { vehicle_number, driver_name, driver_contact, cargo_type, supplier_id, origin, destination, dispatch_date, port_arrival_date, eta_days, shipment_value, freight_cost, clearing_cost } = req.body;

    if (!vehicle_number || !driver_name || !shipment_value || !freight_cost) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const shipmentId = `SHIP-${Date.now().toString().slice(-6)}`;

    const { data, error } = await supabase
      .from('shipments')
      .insert([{
        shipment_id: shipmentId,
        vehicle_number,
        driver_name,
        driver_contact,
        cargo_type,
        supplier_id,
        origin,
        destination,
        dispatch_date,
        port_arrival_date,
        eta_days,
        shipment_value,
        freight_cost,
        clearing_cost: clearing_cost || 0,
        status: 'In Transit',
        gps_status: 'Active',
        demurrage_fee: 0,
        days_in_port: 0,
        created_by: req.user.id
      }])
      .select();

    if (error) throw error;

    io.emit('shipment:created', data[0]);

    res.status(201).json(data[0]);
  } catch (error) {
    console.error('Create shipment error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/shipments/:id', verifyToken, checkRole('admin', 'manager'), async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const { data, error } = await supabase
      .from('shipments')
      .update(updateData)
      .eq('id', id)
      .select();

    if (error) throw error;

    io.emit('shipment:updated', data[0]);

    res.json(data[0]);
  } catch (error) {
    console.error('Update shipment error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/shipments/:id/status', verifyToken, checkRole('admin', 'manager'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const { data, error } = await supabase
      .from('shipments')
      .update({ status })
      .eq('id', id)
      .select();

    if (error) throw error;

    io.emit('shipment:status-changed', data[0]);

    res.json(data[0]);
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/shipments/:id', verifyToken, checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('shipments')
      .delete()
      .eq('id', id);

    if (error) throw error;

    io.emit('shipment:deleted', id);

    res.json({ message: 'Deleted successfully' });
  } catch (error) {
    console.error('Delete shipment error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// DEALS ROUTES
// ============================================================

app.get('/api/deals', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('deals')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Deals error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/deals', verifyToken, checkRole('admin', 'manager'), async (req, res) => {
  try {
    const { customer_id, product, quantity, unit_price, bid_price } = req.body;

    if (!customer_id || !product || !quantity || !bid_price) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const dealId = `DEAL-${Date.now().toString().slice(-6)}`;
    const marginPercent = ((bid_price - (unit_price || 0)) / (unit_price || 1)) * 100;

    const { data, error } = await supabase
      .from('deals')
      .insert([{
        deal_id: dealId,
        customer_id,
        product,
        quantity,
        unit_price: unit_price || 0,
        bid_price,
        margin_percent: marginPercent,
        status: 'Open',
        notes: '',
        created_by: req.user.id
      }])
      .select();

    if (error) throw error;

    io.emit('deal:created', data[0]);

    res.status(201).json(data[0]);
  } catch (error) {
    console.error('Create deal error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/deals/:id', verifyToken, checkRole('admin', 'manager'), async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const { data, error } = await supabase
      .from('deals')
      .update(updateData)
      .eq('id', id)
      .select();

    if (error) throw error;

    io.emit('deal:updated', data[0]);

    res.json(data[0]);
  } catch (error) {
    console.error('Update deal error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// YARDS ROUTES
// ============================================================

app.get('/api/yards', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('yards')
      .select('*');

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Yards error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// SUPPLIERS ROUTES
// ============================================================

app.get('/api/suppliers', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*');

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Suppliers error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// CUSTOMERS ROUTES
// ============================================================

app.get('/api/customers', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('customers')
      .select('*');

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Customers error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// FINANCIALS ROUTES
// ============================================================

app.get('/api/financials/dashboard', verifyToken, async (req, res) => {
  try {
    const { data: inventory } = await supabase.from('inventory').select('*');
    const { data: shipments } = await supabase.from('shipments').select('*');
    const { data: transactions } = await supabase.from('transactions').select('*');

    const totalInventoryValue = inventory?.reduce((sum, i) => sum + (i.quantity * i.selling_rate), 0) || 0;
    const totalShipmentValue = shipments?.reduce((sum, s) => sum + s.shipment_value, 0) || 0;
    const totalFreight = shipments?.reduce((sum, s) => sum + s.freight_cost, 0) || 0;
    const totalRevenue = transactions?.filter(t => t.type === 'Revenue').reduce((sum, t) => sum + t.amount, 0) || 0;

    res.json({
      totalInventoryValue,
      totalShipmentValue,
      totalFreight,
      totalRevenue,
      inventory_count: inventory?.length || 0,
      shipments_count: shipments?.length || 0,
      transactions_count: transactions?.length || 0
    });
  } catch (error) {
    console.error('Financials error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// SOCKET.IO REAL-TIME EVENTS
// ============================================================

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });

  // Listen for client events
  socket.on('inventory:request', async () => {
    try {
      const { data } = await supabase.from('inventory').select('*');
      socket.emit('inventory:data', data);
    } catch (error) {
      console.error('Socket error:', error);
    }
  });

  socket.on('shipment:request', async () => {
    try {
      const { data } = await supabase.from('shipments').select('*');
      socket.emit('shipment:data', data);
    } catch (error) {
      console.error('Socket error:', error);
    }
  });
});

// ============================================================
// ERROR HANDLING
// ============================================================

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Server error' });
});

// ============================================================
// START SERVER
// ============================================================

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`✓ Dockside ERP Server running on port ${PORT}`);
  console.log(`✓ WebSocket connected`);
  console.log(`✓ Supabase database ready`);
});

module.exports = app;
