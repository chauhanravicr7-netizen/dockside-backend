import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 5000;

// Database Connection Pool
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(express.json());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// JWT Verification Middleware
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        companyId: string;
        role: string;
        email: string;
      };
    }
  }
}

const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as any;
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Company Isolation Middleware
const companyMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // Validate company_id in request matches user's company
  next();
};

// ============ AUTH ROUTES ============

app.post('/api/auth/register', async (req: Request, res: Response) => {
  const { email, password, full_name, company_name } = req.body;

  try {
    // Create company
    const companyId = uuidv4();
    await pool.query(
      `INSERT INTO companies (id, name) VALUES ($1, $2)`,
      [companyId, company_name]
    );

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    // Create admin user
    await pool.query(
      `INSERT INTO users (id, company_id, email, password_hash, full_name, role) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, companyId, email, passwordHash, full_name, 'COMPANY_ADMIN']
    );

    // Generate JWT
    const token = jwt.sign(
      { userId, companyId, role: 'COMPANY_ADMIN', email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.status(201).json({ token, companyId, userId });
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query(
      `SELECT u.id, u.company_id, u.password_hash, u.role, u.email 
       FROM users u WHERE u.email = $1 AND u.is_active = true`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await pool.query(`UPDATE users SET last_login = NOW() WHERE id = $1`, [user.id]);

    const token = jwt.sign(
      { userId: user.id, companyId: user.company_id, role: user.role, email: user.email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.json({ token, companyId: user.company_id, userId: user.id, role: user.role });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(400).json({ error: error.message });
  }
});

// ============ PRODUCTS ROUTES ============

app.get('/api/products', authMiddleware, companyMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM products WHERE company_id = $1 ORDER BY created_at DESC`,
      [req.user!.companyId]
    );
    res.json(result.rows);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/products', authMiddleware, companyMiddleware, async (req: Request, res: Response) => {
  const { name, category, sku, purchase_cost, selling_price, unit_type, dimensions, supplier_id } = req.body;

  try {
    const productId = uuidv4();
    const result = await pool.query(
      `INSERT INTO products (
        id, company_id, name, category, sku, purchase_cost, selling_price, 
        unit_type, dimensions, supplier_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [productId, req.user!.companyId, name, category, sku, purchase_cost, selling_price, unit_type, JSON.stringify(dimensions), supplier_id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ============ STOCK MOVEMENTS ROUTES ============

app.get('/api/stock-movements', authMiddleware, companyMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM stock_movements WHERE company_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [req.user!.companyId]
    );
    res.json(result.rows);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/stock-movements', authMiddleware, companyMiddleware, async (req: Request, res: Response) => {
  const { product_id, movement_type, quantity, reference_type, reference_id, warehouse_zone, notes } = req.body;

  try {
    const movementId = uuidv4();
    
    // Log movement
    await pool.query(
      `INSERT INTO stock_movements (
        id, company_id, product_id, movement_type, quantity, reference_type, 
        reference_id, warehouse_zone, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [movementId, req.user!.companyId, product_id, movement_type, quantity, reference_type, reference_id, warehouse_zone, notes, req.user!.userId]
    );

    // Update product quantity
    if (movement_type === 'INBOUND') {
      await pool.query(
        `UPDATE products SET current_quantity = current_quantity + $1 WHERE id = $2 AND company_id = $3`,
        [quantity, product_id, req.user!.companyId]
      );
    } else if (movement_type === 'OUTBOUND') {
      await pool.query(
        `UPDATE products SET current_quantity = current_quantity - $1 WHERE id = $2 AND company_id = $3`,
        [quantity, product_id, req.user!.companyId]
      );
    }

    res.status(201).json({ movementId, success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ============ PURCHASES ROUTES ============

app.get('/api/purchases', authMiddleware, companyMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM purchases WHERE company_id = $1 ORDER BY created_at DESC`,
      [req.user!.companyId]
    );
    res.json(result.rows);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/purchases', authMiddleware, companyMiddleware, async (req: Request, res: Response) => {
  const { supplier_id, purchase_date, due_date, items, tax_amount, invoice_number } = req.body;

  try {
    const purchaseId = uuidv4();
    
    // Calculate total
    const totalAmount = items.reduce((sum: number, item: any) => sum + item.total_price, 0) + (tax_amount || 0);

    // Create purchase
    await pool.query(
      `INSERT INTO purchases (id, company_id, supplier_id, purchase_date, due_date, status, total_amount, tax_amount, invoice_number, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [purchaseId, req.user!.companyId, supplier_id, purchase_date, due_date, 'pending', totalAmount, tax_amount, invoice_number, req.user!.userId]
    );

    // Add items and update stock
    for (const item of items) {
      const itemId = uuidv4();
      await pool.query(
        `INSERT INTO purchase_items (id, purchase_id, product_id, quantity, unit_price, total_price)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [itemId, purchaseId, item.product_id, item.quantity, item.unit_price, item.total_price]
      );

      // Log stock movement
      const movementId = uuidv4();
      await pool.query(
        `INSERT INTO stock_movements (id, company_id, product_id, movement_type, quantity, reference_type, reference_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [movementId, req.user!.companyId, item.product_id, 'INBOUND', item.quantity, 'PURCHASE', purchaseId, req.user!.userId]
      );

      // Update product quantity
      await pool.query(
        `UPDATE products SET current_quantity = current_quantity + $1 WHERE id = $2`,
        [item.quantity, item.product_id]
      );
    }

    res.status(201).json({ purchaseId, success: true, total: totalAmount });
  } catch (error: any) {
    console.error('Purchase creation error:', error);
    res.status(400).json({ error: error.message });
  }
});

// ============ SALES ROUTES ============

app.get('/api/sales', authMiddleware, companyMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT s.*, c.name as customer_name FROM sales s 
       LEFT JOIN customers c ON s.customer_id = c.id
       WHERE s.company_id = $1 ORDER BY s.created_at DESC`,
      [req.user!.companyId]
    );
    res.json(result.rows);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/sales', authMiddleware, companyMiddleware, async (req: Request, res: Response) => {
  const { customer_id, sale_date, items, tax_amount, payment_terms, due_date } = req.body;

  try {
    const saleId = uuidv4();
    const invoiceNumber = `INV-${Date.now()}`;
    
    const totalAmount = items.reduce((sum: number, item: any) => sum + item.total_price, 0) + (tax_amount || 0);

    // Create sale
    await pool.query(
      `INSERT INTO sales (id, company_id, customer_id, sale_date, invoice_number, status, total_amount, tax_amount, payment_terms, due_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [saleId, req.user!.companyId, customer_id, sale_date, invoiceNumber, 'confirmed', totalAmount, tax_amount, payment_terms, due_date, req.user!.userId]
    );

    // Add items and update stock
    for (const item of items) {
      const itemId = uuidv4();
      await pool.query(
        `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, discount, total_price)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [itemId, saleId, item.product_id, item.quantity, item.unit_price, item.discount || 0, item.total_price]
      );

      // Update stock
      await pool.query(
        `UPDATE products SET current_quantity = current_quantity - $1 WHERE id = $2`,
        [item.quantity, item.product_id]
      );
    }

    res.status(201).json({ saleId, invoiceNumber, success: true, total: totalAmount });
  } catch (error: any) {
    console.error('Sale creation error:', error);
    res.status(400).json({ error: error.message });
  }
});

// ============ CUSTOMERS ROUTES ============

app.get('/api/customers', authMiddleware, companyMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM customers WHERE company_id = $1 ORDER BY name ASC`,
      [req.user!.companyId]
    );
    res.json(result.rows);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/customers', authMiddleware, companyMiddleware, async (req: Request, res: Response) => {
  const { name, email, phone, address, city, state, credit_limit, gst_number } = req.body;

  try {
    const customerId = uuidv4();
    const result = await pool.query(
      `INSERT INTO customers (id, company_id, name, email, phone, address, city, state, credit_limit, gst_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [customerId, req.user!.companyId, name, email, phone, address, city, state, credit_limit, gst_number]
    );

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ============ FINANCIAL DASHBOARD ============

app.get('/api/dashboard/financial', authMiddleware, companyMiddleware, async (req: Request, res: Response) => {
  try {
    const { year, month } = req.query;
    
    const result = await pool.query(
      `SELECT 
        COALESCE(SUM(CASE WHEN s.status = 'delivered' THEN s.total_amount ELSE 0 END), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN p.status = 'completed' THEN p.total_amount ELSE 0 END), 0) as total_purchases,
        COALESCE(SUM(prod.total_capital_value), 0) as inventory_value,
        COALESCE(SUM(c.outstanding_balance), 0) as outstanding_receivables,
        COALESCE(SUM(CASE WHEN p.paid_amount < p.total_amount THEN (p.total_amount - p.paid_amount) ELSE 0 END), 0) as supplier_payables
       FROM sales s
       FULL JOIN purchases p ON s.company_id = p.company_id
       FULL JOIN products prod ON prod.company_id = s.company_id
       FULL JOIN customers c ON c.company_id = s.company_id
       WHERE s.company_id = $1 OR p.company_id = $1 OR prod.company_id = $1 OR c.company_id = $1`,
      [req.user!.companyId]
    );

    const data = result.rows[0] || {};
    const grossProfit = (parseFloat(data.total_revenue) || 0) - (parseFloat(data.total_purchases) || 0);
    const profitMargin = data.total_revenue > 0 ? ((grossProfit / data.total_revenue) * 100).toFixed(2) : 0;

    res.json({
      totalRevenue: data.total_revenue,
      totalPurchases: data.total_purchases,
      grossProfit,
      profitMargin,
      inventoryValue: data.inventory_value,
      outstandingReceivables: data.outstanding_receivables,
      supplierPayables: data.supplier_payables,
      cashFlow: (parseFloat(data.total_revenue) || 0) - (parseFloat(data.total_purchases) || 0)
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ============ AI ASSISTANT ============

app.post('/api/ai/insights', authMiddleware, companyMiddleware, async (req: Request, res: Response) => {
  try {
    // Get company data
    const productsResult = await pool.query(
      `SELECT * FROM products WHERE company_id = $1`,
      [req.user!.companyId]
    );

    const salesResult = await pool.query(
      `SELECT SUM(total_amount) as total_sales FROM sales WHERE company_id = $1`,
      [req.user!.companyId]
    );

    const products = productsResult.rows;
    const slowMoving = products.filter((p: any) => p.days_in_stock > 60);
    const deadStock = products.filter((p: any) => p.days_in_stock > 90);
    const lowStock = products.filter((p: any) => p.current_quantity < (p.minimum_stock_threshold || 0));

    const insights = {
      slowMovingProducts: slowMoving.length,
      deadStock: deadStock.length,
      lowStockAlerts: lowStock.length,
      totalInventoryValue: products.reduce((sum: number, p: any) => sum + (p.total_capital_value || 0), 0),
      recommendations: [
        `You have ${deadStock.length} dead stock items blocking ₹${deadStock.reduce((s: number, p: any) => s + (p.total_capital_value || 0), 0)} in capital`,
        `${slowMoving.length} products are slow-moving. Consider promotional offers or clearance sales`,
        `${lowStock.length} products are below minimum stock threshold`,
        'Focus on improving inventory turnover to increase cash flow'
      ]
    };

    res.json(insights);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Dockside Backend running on http://localhost:${PORT}`);
});

export default app;
