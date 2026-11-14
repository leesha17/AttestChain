# AttestChain — Drunix Pre-Settlement AML & Compliance Oracle

**AttestChain** is a privacy-preserving Anti-Money Laundering (AML) and Bank Secrecy Act (BSA) compliance microservice built to integrate directly into the **Drunix / Hyperledger Fabric** ecosystem.

## Architecture & Drunix Integration

1. **Drunix Upstream Trigger (`POST /api/analyze`):** Before settling a transaction batch, Drunix invokes AttestChain's REST webhook.
2. **Off-Chain ML Screening (`Python / IsolationForest`):** Evaluates transaction velocity, volume, and sub-$10,000 structuring patterns without exposing raw customer PII on-chain.
3. **Immutable On-Chain Attestation (`Hyperledger Fabric`):** Generates a deterministic SHA-256 cryptographic proof of the compliance verdict and commits it to the Fabric ledger (`RecordAttestation`).
4. **Drunix Audit Verification (`GET /api/attestations/:id`):** Allows Drunix smart contracts and compliance officers to verify pre-settlement clearance on demand.

```text
[ Drunix Core Platform ]
         │
         ├─── POST /api/analyze ───► [ Node.js Drunix Gateway (:3000) ]
         │                                    │
         │                                    ├───► [ Python IsolationForest (:5000) ]
         │                                    │
         │                                    └───► [ Hyperledger Fabric Ledger ]
         │
         └─── GET /api/attestations/:id ◄──── [ Cryptographic SHA-256 Proof ]