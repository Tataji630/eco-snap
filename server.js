require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'db.json');
const JWT_SECRET = 'eco-snap-super-secret-key-2026';

app.use(cors());
app.use(bodyParser.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// DB Helpers
function readDB() {
  if (!fs.existsSync(DB_PATH)) return initDB();
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch { return initDB(); }
}
function writeDB(data) { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8'); }
function initDB() {
  const db = {
    users: [
      { id: 'admin-1', name: 'Admin', email: 'admin@ecosnap.com', password: bcrypt.hashSync('admin123', 10), role: 'admin', phone: '1234567890', createdAt: new Date().toISOString() },
      { id: 'worker-1', name: 'Rajesh Kumar', email: 'rajesh@ecosnap.com', password: bcrypt.hashSync('worker123', 10), role: 'worker', phone: '9876543210', createdAt: new Date().toISOString() },
      { id: 'citizen-1', name: 'Priya Sharma', email: 'priya@example.com', password: bcrypt.hashSync('citizen123', 10), role: 'citizen', phone: '9876543212', createdAt: new Date().toISOString() }
    ],
    complaints: [
      {
        id: 'comp-1', citizenId: 'citizen-1', workerId: 'worker-1', description: 'Garbage dump near bus stop.',
        address: 'MG Road, Hyderabad', latitude: 17.385, longitude: 78.487, category: 'solid_waste', status: 'completed',
        photoBefore: null, photoAfter: null, createdAt: new Date(Date.now() - 5 * 864e5).toISOString(), acceptedAt: new Date(Date.now() - 4 * 864e5).toISOString(), completedAt: new Date(Date.now() - 3 * 864e5).toISOString()
      }
    ],
    notifications: []
  };
  writeDB(db); return db;
}

// Auth Middleware
function auth(req, res, next) {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (ex) {
    res.status(400).json({ error: 'Invalid token.' });
  }
}

// ─── AUTHENTICATION ROUTES ───
app.post('/api/auth/register', (req, res) => {
  const { name, email, password, role, phone } = req.body;
  if (!name || !email || !password || !role) return res.status(400).json({ error: 'Required fields missing.' });
  const db = readDB();
  if (db.users.find(u => u.email === email)) return res.status(409).json({ error: 'Email already exists.' });

  const user = { id: uuidv4(), name, email, password: bcrypt.hashSync(password, 10), role, phone, createdAt: new Date().toISOString() };
  db.users.push(user); writeDB(db);

  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET);
  res.json({ token, user: { id: user.id, name, email, role, phone } });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const db = readDB();
  const user = db.users.find(u => u.email === email);
  if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Invalid credentials.' });

  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone } });
});

app.get('/api/auth/me', auth, (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone } });
});

// ─── COMPLAINTS ROUTES ───
app.post('/api/complaints', auth, (req, res) => {
  if (req.user.role !== 'citizen') return res.status(403).json({ error: 'Only citizens can create complaints.' });
  
  const { photoBefore } = req.body;
  let imageHash = null;
  const db = readDB();
  
  if (photoBefore) {
    const matches = photoBefore.match(/^data:(image\/\w+);base64,(.+)$/);
    if (matches) {
       imageHash = crypto.createHash('sha256').update(matches[2]).digest('hex');
       if (db.complaints.find(c => c.imageHash === imageHash)) {
         return res.status(400).json({ error: 'This image has already been uploaded.' });
       }
    }
  }

  const c = {
    id: uuidv4(), citizenId: req.user.id, ...req.body, status: 'pending',
    workerId: null, photoAfter: null, imageHash, createdAt: new Date().toISOString(), acceptedAt: null, completedAt: null
  };
  db.complaints.push(c);
  // Notify workers
  db.users.filter(u => u.role === 'worker').forEach(w => {
    db.notifications.push({ id: uuidv4(), userId: w.id, message: 'New garbage complaint in your area.', type: 'new_complaint', complaintId: c.id, read: false, createdAt: new Date().toISOString() });
  });
  writeDB(db);
  res.json(c);
});

app.get('/api/complaints', auth, (req, res) => {
  const db = readDB();
  let complaints = db.complaints.map(c => {
    const cit = db.users.find(u => u.id === c.citizenId);
    const wor = db.users.find(u => u.id === c.workerId);
    return { ...c, citizenName: cit?.name, workerName: wor?.name };
  });

  if (req.user.role === 'citizen') complaints = complaints.filter(c => c.citizenId === req.user.id);
  else if (req.user.role === 'worker' && req.query.filter === 'mine') complaints = complaints.filter(c => c.workerId === req.user.id);

  res.json(complaints.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

app.get('/api/complaints/:id', auth, (req, res) => {
  const db = readDB();
  const c = db.complaints.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found.' });
  const cit = db.users.find(u => u.id === c.citizenId);
  const wor = db.users.find(u => u.id === c.workerId);
  res.json({ ...c, citizenName: cit?.name, workerName: wor?.name });
});

app.patch('/api/complaints/:id/accept', auth, (req, res) => {
  if (req.user.role !== 'worker') return res.status(403).json({ error: 'Only workers can accept.' });
  const db = readDB();
  const c = db.complaints.find(x => x.id === req.params.id);
  if (!c || c.status !== 'pending') return res.status(400).json({ error: 'Invalid state.' });

  c.status = 'accepted'; c.workerId = req.user.id; c.acceptedAt = new Date().toISOString();
  db.notifications.push({ id: uuidv4(), userId: c.citizenId, message: 'Your complaint was accepted and is being worked on.', type: 'accepted', complaintId: c.id, read: false, createdAt: new Date().toISOString() });
  writeDB(db); res.json(c);
});

app.patch('/api/complaints/:id/complete', auth, (req, res) => {
  if (req.user.role !== 'worker') return res.status(403).json({ error: 'Only workers can complete.' });
  const db = readDB();
  const c = db.complaints.find(x => x.id === req.params.id);
  if (!c || c.status !== 'accepted' || c.workerId !== req.user.id) return res.status(400).json({ error: 'Invalid state or ownership.' });

  c.status = 'completed'; c.photoAfter = req.body.photoAfter; c.completedAt = new Date().toISOString();
  db.notifications.push({ id: uuidv4(), userId: c.citizenId, message: 'Your complaint area has been cleaned! ✅', type: 'completed', complaintId: c.id, read: false, createdAt: new Date().toISOString() });
  writeDB(db); res.json(c);
});

// ─── NOTIFICATIONS ───
app.get('/api/notifications', auth, (req, res) => {
  res.json(readDB().notifications.filter(n => n.userId === req.user.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});
app.patch('/api/notifications/read', auth, (req, res) => {
  const db = readDB();
  db.notifications.filter(n => n.userId === req.user.id).forEach(n => n.read = true);
  writeDB(db); res.json({ success: true });
});

// ─── ADMIN ROUTES ───
app.get('/api/admin/stats', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only.' });
  const db = readDB();
  res.json({
    users: db.users.length,
    workers: db.users.filter(u => u.role === 'worker').length,
    complaints: db.complaints.length,
    completed: db.complaints.filter(c => c.status === 'completed').length,
    pending: db.complaints.filter(c => c.status === 'pending').length,
    accepted: db.complaints.filter(c => c.status === 'accepted').length
  });
});
app.get('/api/admin/users', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only.' });
  res.json(readDB().users.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt })));
});

// ─── IMAGE ANALYSIS ───
app.post('/api/analyze-image', auth, async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'No image provided.' });
    
    const matches = imageBase64.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ error: 'Invalid image format.' });
    }
    const mimeType = matches[1];
    const data = matches[2];

    const imageHash = crypto.createHash('sha256').update(data).digest('hex');
    const db = readDB();
    if (db.complaints.find(c => c.imageHash === imageHash)) {
      return res.json({
        isGarbage: false,
        category: null,
        reason: 'This image has already been uploaded. Please upload a different garbage image.',
        confidenceScore: 100
      });
    }

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
      // Without an API key, we cannot reliably detect garbage, so we strictly reject to be safe.
      return res.json({
        isGarbage: false, category: null,
        reason: 'Invalid image. Please upload a real garbage/waste photo only.', confidenceScore: 100
      });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const prompt = `You are a strict garbage validation AI. Analyze this image. 
1. Validate whether the uploaded image is a REAL-WORLD photograph of actual physical garbage/waste.
2. STRICTLY REJECT the image (set isGarbage: false) if it is ANY of the following:
   - An AI-generated image, synthetic media, digital art, or altered photo
   - A human face, person, or body part
   - A document, PDF screenshot, UI screenshot, text image, or mobile screenshot
   - An illustration, drawing, cartoon, 3D render, clip-art, vector graphic, or logo
   - A clean room, landscape, or normal everyday object that is NOT discarded waste
3. ONLY if it is a real-world, authentic photograph of physical garbage/waste, classify it into 'Recyclable' or 'Non-Recyclable'.
Reply STRICTLY with a valid JSON object matching this schema, without markdown blocks or any other text:
{
  "isGarbage": true/false,
  "category": "Recyclable" | "Non-Recyclable" | null,
  "reason": "brief explanation",
  "confidenceScore": 0-100
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { role: 'user', parts: [
          { text: prompt },
          { inlineData: { data, mimeType } }
        ]}
      ]
    });

    let resultText = response.text().trim();
    if (resultText.startsWith('```json')) {
      resultText = resultText.replace(/^```json/, '').replace(/```$/, '');
    }
    const result = JSON.parse(resultText);
    res.json(result);
  } catch (error) {
    console.error('Error analyzing image:', error);
    res.status(500).json({ error: 'Failed to analyze image. Ensure your Gemini API Key is correct.' });
  }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`🚀 Eco-Snap Server running on port ${PORT}`));
