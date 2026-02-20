import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(cors());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// API test
app.get('/api/test', (req, res) => {
  res.json({ message: 'API working' });
});

// Login
app.post('/api/auth/login', (req, res) => {
  res.json({ 
    token: 'token123',
    userId: 'user1',
    companyId: 'company1',
    role: 'ADMIN'
  });
});

// Products
app.get('/api/products', (req, res) => {
  res.json([
    { id: '1', name: 'Plywood', price: 500 }
  ]);
});

// Dashboard
app.get('/api/dashboard/financial', (req, res) => {
  res.json({
    totalRevenue: 1000000,
    totalPurchases: 500000,
    grossProfit: 500000,
    profitMargin: 50
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
