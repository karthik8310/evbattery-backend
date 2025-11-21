const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 4000;
const DATA_PATH = path.join(__dirname, 'data', 'enc_data.json');

let samples = [];
try {
  const raw = fs.readFileSync(DATA_PATH, 'utf8');
  samples = JSON.parse(raw);
  if (!Array.isArray(samples) || samples.length === 0) {
    console.error('enc_data.json must be a non-empty array');
    process.exit(1);
  }
} catch (err) {
  console.error('Failed to load enc_data.json:', err);
  process.exit(1);
}

let idx = 0;
let latest = generateRecord(samples[0], new Date().toISOString());

// cycle through samples every 3 seconds
setInterval(() => {
  const s = samples[idx];
  latest = generateRecord(s, new Date().toISOString());
  idx = (idx + 1) % samples.length;
}, 3000);

// Function to create AIML outputs from ENC sample
function generateRecord(sample, ts) {
  const enc = sample.enc || sample;
  const temp = enc.temp;
  const voltage = enc.voltage;
  const current = enc.current;
  const soc = enc.soc;
  const soh = enc.soh;

  // Basic heuristics (toy AIML)
  let risk = 'LOW';
  if (temp >= 46 || Math.abs(current) >= 150 || voltage >= 380) risk = 'HIGH';
  else if (temp >= 42 || Math.abs(current) >= 120 || voltage >= 370) risk = 'MEDIUM';

  let fireRisk = 'LOW';
  if (temp >= 50 || (temp >= 46 && Math.abs(current) >= 140)) fireRisk = 'HIGH';
  else if (temp >= 42) fireRisk = 'MEDIUM';

  const highVoltage = voltage >= 375;
  const highCurrent = Math.abs(current) >= 120;
  const charging = current > 0;

  let batteryHealthPred = 'GOOD';
  if (soh < 75) batteryHealthPred = 'POOR';
  else if (soh < 85) batteryHealthPred = 'FAIR';

  const batteryPerformance = soc > 80 ? 'NORMAL' : soc > 50 ? 'DEGRADED' : 'LOW';
  const batteryCondition = soh > 85 ? 'HEALTHY' : soh > 70 ? 'WATCH' : 'REPLACE_SUGGESTED';

  let healthScore = Math.round(soh - ((temp - 25) * 0.2) - (highCurrent ? 5 : 0));
  healthScore = Math.max(0, Math.min(100, healthScore));

  const anomalies = [];
  if (temp >= 46) anomalies.push('High Temperature');
  if (voltage >= 375) anomalies.push('Overvoltage');
  if (Math.abs(current) >= 140) anomalies.push('Very High Current');
  if (soc <= 15) anomalies.push('Low SoC');

  // remaining useful life (toy)
  const RUL_months = Math.max(1, Math.round((soh - 50) * 1.5));

  const aiml = {
    risk,
    fireRisk,
    highVoltage,
    highCurrent,
    charging,
    batteryHealthPred,
    batteryPerformance,
    batteryCondition,
    healthScore,
    anomalies,
    RUL_months,
    summary: `Risk:${risk} | Health:${batteryHealthPred} | ${charging ? 'Charging' : 'Not Charging'}`
  };

  return {
    timestamp: ts,
    enc: { temp, voltage, current, soc, soh },
    aiml
  };
}

// GET latest
app.get('/api/latest', (req, res) => {
  res.json(latest);
});

// GET all samples (original dataset)
app.get('/api/all', (req, res) => {
  res.json(samples);
});

app.get('/api/health', (req, res) => res.json({ ok: true, now: new Date().toISOString() }));

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
