from flask import Flask, request, jsonify
import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest

app = Flask(__name__)

def train_model():
    x_train = np.array([
        [500, 24, 1],
        [2000, 48, 1],
        [9500, 2, 5],
        [9800, 1, 4],
        [25000, 72, 1],
        [9900, 3, 6],
        [100, 10, 1]
    ])

    clf = IsolationForest(contamination=0.3, random_state=42)
    clf.fit(x_train)
    return clf

model = train_model()

@app.route('/detect', methods=['POST'])
def detect_structuring():
    data = request.get_json()
    txs = data.get('transactions', [])

    if not txs:
        return jsonify({
            'flagged': False,
            'reason': 'No transactions provided'
        })

    df = pd.DataFrame(txs)

    # Fallback default if timestamp or amountUSD are missing
    if 'timestamp' not in df.columns:
        df['timestamp'] = pd.to_datetime('now')
    else:
        df['timestamp'] = pd.to_datetime(df['timestamp'])

    if 'amountUSD' not in df.columns:
        df['amountUSD'] = 0.0

    total_amount = df['amountUSD'].sum()
    tx_count = len(df)

    time_span_hours = max(
        (df['timestamp'].max() - df['timestamp'].min()).total_seconds() / 3600.0,
        0.1
    )

    avg_amount = df['amountUSD'].mean()

    near_threshold_count = len(
        df[
            (df['amountUSD'] >= 9000) &
            (df['amountUSD'] < 10000)
        ]
    )

    features = np.array([
        [avg_amount, time_span_hours, tx_count]
    ])

    prediction = model.predict(features)[0]

    is_anomaly = (
        prediction == -1 or
        near_threshold_count >= 2
    )

    return jsonify({
        'flagged': bool(is_anomaly),
        'riskScore': 0.89 if is_anomaly else 0.12,
        'metrics': {
            'totalAmountUSD': float(total_amount),
            'txCount': int(tx_count),
            'timeSpanHours': round(float(time_span_hours), 2),
            'nearThresholdTxs': int(near_threshold_count)
        },
        'recommendation':
            'FLAG_FOR_COMPLIANCE_REVIEW'
            if is_anomaly else 'PASS'
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)