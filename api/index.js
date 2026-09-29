const express = require('express');
const app = express();
const PORT = 3000;

// Middleware to parse incoming JSON requests
app.use(express.json());

// Basic health check route
app.get('/', (req, res) => {
  res.json({ message: 'AttestChain API is running!' });
});

// Route to forward transaction data to the Python Anomaly Detector
// Cleaned up route in api/index.js
app.post('/api/analyze', async (req, res) => {
  try {
    const { transactions } = req.body;

    if (!transactions || !Array.isArray(transactions)) {
      return res.status(400).json({ 
        error: 'Missing or invalid "transactions" array.' 
      });
    }

    const flaskResponse = await fetch('http://127.0.0.1:5000/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions })
    });

    const mlResult = await flaskResponse.json();

    return res.json({
      success: true,
      data: mlResult
    });

  } catch (error) {
    console.error('Error connecting to Python detector:', error.message);
    return res.status(500).json({ 
      error: 'Failed to communicate with Anomaly Detection service.',
      details: error.message 
    });
  }
});

// Start the Express server
app.listen(PORT, () => {
  console.log(`Node.js API listening at http://localhost:${PORT}`);
});