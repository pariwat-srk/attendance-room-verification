const express = require('express')
const router = express.Router()
const http = require('http')
const { getSummary, getCheckedList, getLatestSnapshot, db } = require('../database/db')

// ─── ฟังก์ชัน ส่ง count ไป camera2 ──────────────────────────────────────────
function sendCountToCamera2(session_id) {
  try {
    const count = db.prepare(
      'SELECT COUNT(*) as c FROM attendance_log WHERE session_id = ?'
    ).get(session_id).c

    const body = JSON.stringify({ session_id, count_in_room: count })
    const req = http.request({
      hostname: 'localhost',
      port: process.env.PORT || 3000,
      path: '/api/camera2/verify',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    })
    req.on('error', () => {}) // กัน crash ถ้า camera2 ไม่ตอบ
    req.write(body)
    req.end()
    console.log(`📤 ส่ง count_in_room=${count} ไป camera2 (session ${session_id})`)
  } catch (err) {
    console.error('❌ sendCountToCamera2 error:', err.message)
  }
}

// ─── auto-close sessions ───────────────────────────────────────────────────
// ทุก 1 นาที เช็คว่ามี session ที่ถึงเวลาปิดแล้วหรือเปล่า
const autoCloseIntervalMs = Number(process.env.AUTO_CLOSE_INTERVAL_MS || 60_000)

setInterval(() => {
  const now  = new Date()
  const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`

  const expired = db.prepare(`
    SELECT id, end_time, started_at FROM sessions
    WHERE is_active = 1 AND end_time IS NOT NULL AND end_time != ''
  `).all()

  expired.forEach(s => {
    if (hhmm >= s.end_time) {
      db.prepare('UPDATE sessions SET is_active = 0 WHERE id = ?').run(s.id)
      console.log(`⏰ Auto-closed session ${s.id} (end_time=${s.end_time})`)
      sendCountToCamera2(s.id) // ← ส่งอัตโนมัติ
    }
  })
}, autoCloseIntervalMs)

// ─── endpoint เดิม ─────────────────────────────────────────────────────────
router.get('/summary/:session_id', (req, res) => {
  const { session_id } = req.params
  const summary = getSummary(session_id)
  if (!summary.session) return res.status(404).json({ error: 'ไม่พบ session' })
  res.json(summary)
})

router.get('/attendance/:session_id', (req, res) => {
  const { session_id } = req.params
  res.json(getCheckedList(session_id))
})

router.get('/snapshot/:session_id', (req, res) => {
  const { session_id } = req.params
  const snapshot = getLatestSnapshot(session_id)
  if (!snapshot) return res.status(404).json({ error: 'ยังไม่มีผลตรวจสอบ' })
  res.json(snapshot)
})

// ─── ตั้งเวลาสาย ────────────────────────────────────────────────────────────
router.post('/session/late-threshold', (req, res) => {
  const { session_id, minutes } = req.body
  if (!session_id || !minutes) return res.status(400).json({ error: 'ต้องส่ง session_id และ minutes' })
  db.prepare('UPDATE sessions SET late_threshold = ? WHERE id = ?').run(minutes, session_id)
  res.json({ success: true })
})

// ─── สร้าง session ใหม่ ─────────────────────────────────────────────────────
router.post('/session/create', (req, res) => {
  const { subject_id, subject_name, room, class_start_time, class_end_time, late_threshold } = req.body
  if (!subject_id || !subject_name || !class_start_time || !class_end_time) {
    return res.status(400).json({ error: 'ต้องส่ง subject_id, subject_name, class_start_time และ class_end_time' })
  }
  if (class_end_time <= class_start_time) {
    return res.status(400).json({ error: 'เวลาปิดต้องมากกว่าเวลาเปิด' })
  }

  db.prepare('UPDATE sessions SET is_active = 0').run()

  const now  = new Date()
  const yyyy = now.getFullYear()
  const mm   = String(now.getMonth()+1).padStart(2,'0')
  const dd   = String(now.getDate()).padStart(2,'0')
  const startedAt = `${yyyy}-${mm}-${dd} ${class_start_time}:00`

  const result = db.prepare(`
    INSERT INTO sessions (subject_id, subject_name, room, started_at, end_time, late_threshold, is_active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(subject_id, subject_name, room ?? '', startedAt, class_end_time, late_threshold ?? 15)

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(result.lastInsertRowid)
  res.json({ success: true, session })
})

// ─── ดึง session active ──────────────────────────────────────────────────────
router.get('/session/active', (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get()
  if (!session) return res.status(404).json({ error: 'ไม่มี session ที่เปิดอยู่' })
  res.json(session)
})

// ─── ดึง sessions ทั้งหมดของวันนี้ ───────────────────────────────────────────
router.get('/sessions/today', (req, res) => {
  const now  = new Date()
  const yyyy = now.getFullYear()
  const mm   = String(now.getMonth()+1).padStart(2,'0')
  const dd   = String(now.getDate()).padStart(2,'0')
  const today = `${yyyy}-${mm}-${dd}`
  const sessions = db.prepare(`
    SELECT s.*, COUNT(a.id) as checked_count
    FROM sessions s
    LEFT JOIN attendance_log a ON a.session_id = s.id
    WHERE date(s.started_at) = ?
    GROUP BY s.id
    ORDER BY s.started_at ASC
  `).all(today)
  res.json({ sessions })
})

// ─── ปิด session (manual) ─────────────────────────────────────────────────────
router.post('/session/close', (req, res) => {
  const { session_id } = req.body
  if (session_id) {
    db.prepare('UPDATE sessions SET is_active = 0 WHERE id = ?').run(session_id)
    sendCountToCamera2(session_id) // ← ส่งพร้อมปิดคลาส
  } else {
    db.prepare('UPDATE sessions SET is_active = 0').run()
  }
  res.json({ success: true })
})

// ─── ดึงข้อมูลการเช็คชื่อของ session ─────────────────────────────────────────
router.get('/attendance/session/:session_id', (req, res) => {
  const { session_id } = req.params
  try {
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(session_id)
    if (!session) return res.status(404).json({ error: 'ไม่พบ session' })

    const allStudents = db.prepare('SELECT * FROM students').all()
    const checked = db.prepare(`
      SELECT student_id, strftime('%H:%M', checked_at) as checkTime, status
      FROM attendance_log WHERE session_id = ?
    `).all(session_id)

    const checkedMap = {}
    checked.forEach(c => { checkedMap[c.student_id] = { checkTime: c.checkTime, status: c.status } })

    const students = allStudents.map(s => ({
      studentId: s.student_id,
      name:      s.name,
      checkTime: checkedMap[s.student_id]?.checkTime ?? null,
      status:    checkedMap[s.student_id]
        ? (checkedMap[s.student_id].status === 'late' ? 'late' : 'present')
        : 'absent'
    }))

    const present = students.filter(s => s.status === 'present').length
    const late    = students.filter(s => s.status === 'late').length
    const absent  = students.filter(s => s.status === 'absent').length
    const percent = students.length > 0
      ? Math.round(((present+late)/students.length)*100)+'%' : '0%'

    res.json({ session, total: students.length, present, late, absent, percent, students })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// ─── ดึงวันที่ที่มีข้อมูล ────────────────────────────────────────────────────
router.get('/attendance/dates', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT DISTINCT date(started_at) as date FROM sessions ORDER BY date DESC
    `).all()
    res.json({ dates: rows.map(r => r.date) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── ดึง sessions ของวันที่เลือก (สำหรับ history) ───────────────────────────
router.get('/sessions/date', (req, res) => {
  const { date } = req.query
  if (!date) return res.status(400).json({ error: 'กรุณาระบุ date' })
  try {
    const sessions = db.prepare(`
      SELECT s.*, COUNT(a.id) as checked_count
      FROM sessions s
      LEFT JOIN attendance_log a ON a.session_id = s.id
      WHERE date(s.started_at) = ?
      GROUP BY s.id
      ORDER BY s.started_at ASC
    `).all(date)
    res.json({ sessions })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router