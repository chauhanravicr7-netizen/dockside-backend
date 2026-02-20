import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Dockside Backend is running!' });
});

// Simple test endpoint
app.get('/api/test', (req, res) => {
  res.json({ message: 'API is working!' });
});

// Login endpoint (simplified)
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  
  if (email === 'demo@dockside.com' && password === 'demo123456') {
    res.json({ 
      token: 'demo-token-12345',
      userId: 'demo-user-id',
      companyId: 'demo-company-id',
      role: 'COMPANY_ADMIN',
      email: email
    });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Register endpoint (simplified)
app.post('/api/auth/register', (req, res) => {
  const { email, password, full_name, company_name } = req.body;
  
  res.status(201).json({
    token: 'new-token-12345',
    userId: 'new-user-id',
    companyId: 'new-company-id'
  });
});

// Products endpoint (simplified)
app.get('/api/products', (req, res) => {
  res.json([
    { id: '1', name: 'Plywood', category: 'Plywood', price: 500 },
    { id: '2', name: 'Log', category: 'Logs', price: 1000 }
  ]);
});

// Dashboard endpoint (simplified)
app.get('/api/dashboard/financial', (req, res) => {
  res.json({
    totalRevenue: 1000000,
    totalPurchases: 500000,
    grossProfit: 500000,
    profitMargin: 50,
    inventoryValue: 750000,
    outstandingReceivables: 200000,
    supplierPayables: 150000,
    cashFlow: 500000
  });
});

// AI Insights endpoint (simplified)
app.post('/api/ai/insights', (req, res) => {
  res.json({
    slowMovingProducts: 5,
    deadStock: 2,
    lowStockAlerts: 8,
    totalInventoryValue: 750000,
    recommendations: [
      'You have 2 dead stock items blocking capital',
      '5 products are slow-moving. Consider promotional offers',
      'Focus on improving inventory turnover'
    ]
  });
});

// Error handling
app.use((err: any, req: any, res: any, next: any) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Dockside Backend running on port ${PORT}`);
});

export default app;
