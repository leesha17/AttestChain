const express = require('express');
const path = require('path');
const { submitAttestation } = require('./fabric');

const app = express();
app.use(express.json());

app.post('/api/analyze', async (req, res) => {
  try {
    const { transactions, batchId } = req.body;

    if (!transactions || !Array.isArray(transactions)) {
      return res.status(400).json({ error: 'Invalid or missing "transactions" array.' });
    }

    // 1. Run ML Anomaly Detection (Python Flask)
    const flaskResponse = await fetch('http://127.0.0.1:5000/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions })
    });

    const mlResult = await flaskResponse.json();

    // 2. Build Privacy-Preserving Compliance Record (No raw PII)
    const attestationId = `ATT-${Date.now()}`;
    const ledgerPayload = {
      attestationId,
      batchId: batchId || `BATCH-${Math.floor(1000 + Math.random() * 9000)}`,
      timestamp: new Date().toISOString(),
      flagged: mlResult.flagged,
      riskScore: mlResult.riskScore,
      metrics: mlResult.metrics,
      recommendation: mlResult.recommendation
    };

    // 3. Commit Cryptographic Proof to Ledger
    const blockchainStatus = await submitAttestation(attestationId, ledgerPayload);

    return res.json({
      success: true,
      batchId: ledgerPayload.batchId,
      timestamp: ledgerPayload.timestamp,
      data: mlResult,
      blockchain: blockchainStatus
    });

  } catch (error) {
    console.error('Error processing transaction analysis:', error.message);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.listen(3000, () => {
  console.log('AttestChain Gateway & Dashboard running at http://localhost:3000');
});