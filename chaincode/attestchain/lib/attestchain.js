'use strict';

const { Contract } = require('fabric-contract-api');

class AttestChainContract extends Contract {

    async initLedger(ctx) {
        console.info('AttestChain Ledger Initialized');
    }

    // 1. IssueAttestation
    async IssueAttestation(ctx, attestationId, senderId, purposeCategory, expiryDate, docHash) {
        const clientMSPID = ctx.clientIdentity.getMSPID();
        if (clientMSPID !== 'IssuingBankOrgMSP') {
            throw new Error(`Unauthorized: Only IssuingBankOrg can issue attestations. Caller: ${clientMSPID}`);
        }

        const exists = await this._attestationExists(ctx, attestationId);
        if (exists) {
            throw new Error(`Attestation ${attestationId} already exists.`);
        }

        const attestation = {
            docType: 'attestation',
            attestationId,
            senderId,
            issuingBank: clientMSPID,
            purposeCategory,
            expiryDate,
            status: 'VALID',
            issuedAt: new Date().toISOString(),
            cumulativeUsageUSD: 0
        };

        await ctx.stub.putState(attestationId, Buffer.from(JSON.stringify(attestation)));

        if (docHash) {
            const privateData = { attestationId, docHash, uploadedAt: new Date().toISOString() };
            await ctx.stub.putPrivateData('AttestationPrivateCollection', attestationId, Buffer.from(JSON.stringify(privateData)));
        }

        await this._logAuditEvent(ctx, attestationId, 'ISSUE_ATTESTATION', `Issued by ${clientMSPID} for Sender ${senderId}`);
        return JSON.stringify(attestation);
    }

    // 2. VerifyAttestation
    async VerifyAttestation(ctx, attestationId, targetPurpose) {
        const attestationBytes = await ctx.stub.getState(attestationId);
        if (!attestationBytes || attestationBytes.length === 0) {
            throw new Error(`Attestation ${attestationId} does not exist.`);
        }

        const attestation = JSON.parse(attestationBytes.toString());

        if (attestation.status !== 'VALID') {
            return JSON.stringify({ isValid: false, reason: `Attestation status is ${attestation.status}` });
        }

        if (new Date(attestation.expiryDate) < new Date()) {
            return JSON.stringify({ isValid: false, reason: 'Attestation has expired' });
        }

        const consentKey = `CONSENT_${attestation.senderId}_${ctx.clientIdentity.getMSPID()}`;
        const consentBytes = await ctx.stub.getState(consentKey);
        if (!consentBytes || consentBytes.length === 0) {
            return JSON.stringify({ isValid: false, reason: 'Consent not granted to verifier organization' });
        }
        const consent = JSON.parse(consentBytes.toString());
        if (!consent.active) {
            return JSON.stringify({ isValid: false, reason: 'Sender revoked consent for this verifier' });
        }

        if (targetPurpose && attestation.purposeCategory !== targetPurpose) {
            return JSON.stringify({ isValid: false, reason: `Purpose mismatch. Allowed: ${attestation.purposeCategory}, Requested: ${targetPurpose}` });
        }

        await this._logAuditEvent(ctx, attestationId, 'VERIFY_ATTESTATION', `Verified by ${ctx.clientIdentity.getMSPID()}`);
        return JSON.stringify({ isValid: true, attestation });
    }

    // 3. GrantConsent
    async GrantConsent(ctx, senderId, granteeMSP) {
        const consentKey = `CONSENT_${senderId}_${granteeMSP}`;
        const consent = {
            docType: 'consent',
            senderId,
            granteeMSP,
            active: true,
            grantedAt: new Date().toISOString()
        };

        await ctx.stub.putState(consentKey, Buffer.from(JSON.stringify(consent)));
        await this._logAuditEvent(ctx, senderId, 'GRANT_CONSENT', `Consent granted to ${granteeMSP}`);
        return JSON.stringify(consent);
    }

    // 4. RevokeConsent
    async RevokeConsent(ctx, senderId, granteeMSP) {
        const consentKey = `CONSENT_${senderId}_${granteeMSP}`;
        const consentBytes = await ctx.stub.getState(consentKey);
        if (!consentBytes || consentBytes.length === 0) {
            throw new Error(`No active consent record found for Sender ${senderId} and MSP ${granteeMSP}`);
        }

        const consent = JSON.parse(consentBytes.toString());
        consent.active = false;
        consent.revokedAt = new Date().toISOString();

        await ctx.stub.putState(consentKey, Buffer.from(JSON.stringify(consent)));
        await this._logAuditEvent(ctx, senderId, 'REVOKE_CONSENT', `Consent revoked for ${granteeMSP}`);
        return JSON.stringify(consent);
    }

    // 5. RevokeAttestation
    async RevokeAttestation(ctx, attestationId, reason) {
        const clientMSPID = ctx.clientIdentity.getMSPID();
        const attestationBytes = await ctx.stub.getState(attestationId);
        if (!attestationBytes || attestationBytes.length === 0) {
            throw new Error(`Attestation ${attestationId} does not exist.`);
        }

        const attestation = JSON.parse(attestationBytes.toString());
        if (clientMSPID !== attestation.issuingBank && clientMSPID !== 'RegulatorOrgMSP') {
            throw new Error(`Unauthorized: Only issuing bank or regulator can revoke attestation.`);
        }

        attestation.status = 'REVOKED';
        attestation.revocationReason = reason;
        attestation.revokedAt = new Date().toISOString();

        await ctx.stub.putState(attestationId, Buffer.from(JSON.stringify(attestation)));
        await this._logAuditEvent(ctx, attestationId, 'REVOKE_ATTESTATION', `Revoked by ${clientMSPID}. Reason: ${reason}`);
        return JSON.stringify(attestation);
    }

    // 6. CheckPurpose
    async CheckPurpose(ctx, attestationId, purposeCode) {
        const attestationBytes = await ctx.stub.getState(attestationId);
        if (!attestationBytes || attestationBytes.length === 0) {
            throw new Error(`Attestation ${attestationId} does not exist.`);
        }

        const attestation = JSON.parse(attestationBytes.toString());
        const isMatched = attestation.purposeCategory === purposeCode;

        return JSON.stringify({
            attestationId,
            configuredPurpose: attestation.purposeCategory,
            requestedPurpose: purposeCode,
            isAllowed: isMatched
        });
    }

    // 7. TrackUsage
    async TrackUsage(ctx, attestationId, amountUSD) {
        const attestationBytes = await ctx.stub.getState(attestationId);
        if (!attestationBytes || attestationBytes.length === 0) {
            throw new Error(`Attestation ${attestationId} does not exist.`);
        }

        const attestation = JSON.parse(attestationBytes.toString());
        const parsedAmount = parseFloat(amountUSD);

        const LRS_ANNUAL_LIMIT = 250000;
        if (attestation.cumulativeUsageUSD + parsedAmount > LRS_ANNUAL_LIMIT) {
            throw new Error(`Transaction exceeds LRS limit of $${LRS_ANNUAL_LIMIT}. Current usage: $${attestation.cumulativeUsageUSD}, Requested: $${parsedAmount}`);
        }

        attestation.cumulativeUsageUSD += parsedAmount;
        await ctx.stub.putState(attestationId, Buffer.from(JSON.stringify(attestation)));

        await this._logAuditEvent(ctx, attestationId, 'TRACK_USAGE', `Amount: $${parsedAmount}. Total: $${attestation.cumulativeUsageUSD}`);
        return JSON.stringify(attestation);
    }

    // 8. GetAuditTrail
    async GetAuditTrail(ctx, entityId) {
        const iterator = await ctx.stub.getHistoryForKey(entityId);
        const results = [];

        while (true) {
            const res = await iterator.next();
            if (res.value) {
                const tx = {
                    txId: res.value.txId,
                    timestamp: new Date(res.value.timestamp.seconds.low * 1000).toISOString(),
                    isDelete: res.value.isDelete
                };

                if (res.value.value.length > 0) {
                    tx.value = JSON.parse(res.value.value.toString('utf8'));
                }
                results.push(tx);
            }
            if (res.done) {
                await iterator.close();
                break;
            }
        }
        return JSON.stringify(results);
    }

    async _logAuditEvent(ctx, entityId, action, details) {
        const auditId = `AUDIT_${entityId}_${ctx.stub.getTxID()}`;
        const auditLog = {
            docType: 'audit',
            auditId,
            entityId,
            action,
            performedBy: ctx.clientIdentity.getMSPID(),
            timestamp: new Date().toISOString(),
            details
        };
        await ctx.stub.putState(auditId, Buffer.from(JSON.stringify(auditLog)));
    }

    async _attestationExists(ctx, attestationId) {
        const bytes = await ctx.stub.getState(attestationId);
        return bytes && bytes.length > 0;
    }
}

module.exports = AttestChainContract;