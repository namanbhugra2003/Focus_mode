const express = require('express');
const cors = require('cors');
// Dynamic import for node-fetch to support CommonJS
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
const bodyParser = require('body-parser');
require('dotenv').config();
const db = require('./db');

const app = express();

// Allow Frontend running on port 5173
app.use(cors({
  origin: "https://focus-mode-frontend.onrender.com",
  methods: ["GET", "POST"]
}));

app.use(bodyParser.json());

// --- HELPER: Get Student State ---
async function getStudentState(studentId) {
  try {
    const studentRes = await db.query(
      'SELECT id, name, status, current_intervention_id FROM students WHERE id=$1',
      [studentId]
    );
    
    if (studentRes.rowCount === 0) return null;
    const student = studentRes.rows[0];

    let intervention = null;
    if (student.current_intervention_id) {
      const intRes = await db.query(
        'SELECT id, title, description, status FROM interventions WHERE id=$1',
        [student.current_intervention_id]
      );
      intervention = intRes.rows[0] || null;
    }

    return { ...student, intervention };
  } catch (error) {
    console.error("Error fetching state:", error);
    return null;
  }
}

// --- ROUTE: Get State ---
app.get('/student-state/:id', async (req, res) => {
  try {
    const state = await getStudentState(req.params.id);
    if (!state) return res.status(404).json({ error: 'Student not found. Did you run the SQL INSERT?' });
    res.json(state);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- ROUTE: Daily Check-in ---
app.post('/daily-checkin', async (req, res) => {
  try {
    const { student_id, quiz_score, focus_minutes } = req.body;
    
    // Logic: Pass if Score > 7 AND Focus > 60 mins
    const success = (quiz_score > 7 && focus_minutes > 60);
    const status = success ? 'success' : 'failed';

    // 1. Log the attempt
    await db.query(
      'INSERT INTO daily_logs (student_id, quiz_score, focus_minutes, status) VALUES ($1,$2,$3,$4)',
      [student_id, quiz_score, focus_minutes, status]
    );

    // 2. Update Student Status
    if (success) {
      await db.query('UPDATE students SET status=$1 WHERE id=$2', ['normal', student_id]);
    } else {
      await db.query('UPDATE students SET status=$1 WHERE id=$2', ['locked', student_id]);

      // 3. Trigger n8n Webhook (Fire and Forget)
      if (process.env.N8N_WEBHOOK_URL) {
        console.log(`Triggering Webhook: ${process.env.N8N_WEBHOOK_URL}`);

        // 🔥 ALWAYS send the student_id, quiz_score, focus_minutes
        fetch(process.env.N8N_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            student_id,
            quiz_score,
            focus_minutes
          })
        })
        .then(res => console.log("Webhook sent, status:", res.status))
        .catch(err => console.error("Webhook failed (check is n8n running?):", err.message));
      }
    }

    // 4. Return new state
    return res.json(await getStudentState(student_id));

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- ROUTE: Assign Intervention (Called by n8n) ---
// --- ROUTE: Assign Intervention (Called by n8n) ---
app.post('/assign-intervention', async (req, res) => {
  try {
    console.log("Received intervention request from n8n:", req.body);
    const { task_title, task_description } = req.body;

    // 🔍 1. Find the latest student who is locked and needs intervention
    const studentRes = await db.query(
      "SELECT id FROM students WHERE status='locked' ORDER BY id DESC LIMIT 1"
    );

    if (studentRes.rowCount === 0) {
      return res.status(400).json({ error: 'No locked student found' });
    }

    const student_id = studentRes.rows[0].id;

    // 🏗 2. Create Intervention
    const intRes = await db.query(
      'INSERT INTO interventions (student_id, title, description, status) VALUES ($1,$2,$3,$4) RETURNING id',
      [student_id, task_title, task_description || 'Check email for details', 'assigned']
    );

    // 🔄 3. Update the Student status to "remedial"
    await db.query(
      'UPDATE students SET status=$1, current_intervention_id=$2 WHERE id=$3',
      ['remedial', intRes.rows[0].id, student_id]
    );

    // 📤 4. Return Updated State
    res.json(await getStudentState(student_id));

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- ROUTE: Complete Intervention ---
app.post('/complete-intervention', async (req, res) => {
  try {
    const { student_id } = req.body;
    const state = await getStudentState(student_id);

    if (!state || !state.current_intervention_id) {
      return res.status(400).json({ error: 'No active intervention' });
    }

    // Mark task done
    await db.query(
      'UPDATE interventions SET status=$1 WHERE id=$2',
      ['completed', state.current_intervention_id]
    );

    // Reset student to normal
    await db.query(
      'UPDATE students SET status=$1, current_intervention_id=NULL WHERE id=$2',
      ['normal', student_id]
    );

    res.json(await getStudentState(student_id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
