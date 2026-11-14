const express = require('express');
const { submitAttestation } = require('./fabric');

const app = express();
app.use(express.json());

// Store attestation records in memory for audit lookups
const attestationHistory = [];

// 1. Health check endpoint for Drunix
app.get('/api/health', (req, res) => {
  res.json({
    service: 'attestchain-drunix-compliance-plugin',
    status: 'OPERATIONAL',
    mlEngine: 'IsolationForest-v1',
    ledgerTarget: 'Hyperledger-Fabric / Drunix-Channel'
  });
});

// 2. Primary AML Screening & Ledger Commit Webhook
app.post('/api/analyze', async (req, res) => {
  try {
    const { transactions, batchId } = req.body;

    if (!transactions || !Array.isArray(transactions)) {
      return res.status(400).json({ error: 'Invalid or missing "transactions" array.' });
    }

    const flaskResponse = await fetch('http://127.0.0.1:5000/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions })
    });

    const mlResult = await flaskResponse.json();

    const attestationId = `ATT-${Date.now()}`;
    const ledgerPayload = {
      attestationId,
      batchId: batchId || `DRUNIX-BATCH-${Math.floor(1000 + Math.random() * 9000)}`,
      timestamp: new Date().toISOString(),
      flagged: mlResult.flagged,
      riskScore: mlResult.riskScore,
      metrics: mlResult.metrics,
      recommendation: mlResult.recommendation
    };

    const blockchainStatus = await submitAttestation(attestationId, ledgerPayload);

    const record = {
      success: true,
      batchId: ledgerPayload.batchId,
      timestamp: ledgerPayload.timestamp,
      data: mlResult,
      blockchain: blockchainStatus
    };

    attestationHistory.unshift(record);
    return res.json(record);

  } catch (error) {
    console.error('Error processing transaction analysis:', error.message);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// 3. Audit Lookup Endpoints for Drunix
app.get('/api/attestations', (req, res) => {
  res.json({
    count: attestationHistory.length,
    attestations: attestationHistory
  });
});

app.get('/api/attestations/:id', (req, res) => {
  const match = attestationHistory.find(a => a.blockchain.attestationId === req.params.id);
  if (!match) return res.status(404).json({ error: 'Attestation ID not found' });
  res.json(match);
});

app.listen(3000, () => {
  console.log('AttestChain Drunix Plugin running at http://localhost:3000');
});