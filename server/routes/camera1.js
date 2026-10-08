const express = require('express')
const router  = express.Router()
const multer  = require('multer')
const { getStudent, getActiveSession, getSessionById, saveAttendance, db } = require('../database/db')

const upload = multer({ dest: 'uploads/' })

let _io = null
const setIO = (io) => { _io = io }

// GET /api/camera1/session/active
router.get('/session/active', (req, res) => {
  const session = getActiveSession()
  if (!session) return res.status(404).json({ error: 'ไม่มี session ที่เปิดอยู่' })
  res.json(session)
})

// POST /api/camera1/checkin
router.post('/checkin', (req, res) => {
  const { student_id, session_id } = req.body
  if (!student_id || !session_id)
    return res.status(400).json({ error: 'ต้องส่ง student_id และ session_id' })

  const student = getStudent(student_id)
  if (!student) return res.status(404).json({ error: 'ไม่พบนักศึกษา' })

  const session = getSessionById(session_id)
  if (!session) return res.status(404).json({ error: 'ไม่พบ session' })

  // เช็คว่า session ยังเปิดอยู่
  if (!session.is_active)
    return res.status(403).json({ success: false, error: 'session_closed', message: 'ปิดรับการเช็คชื่อแล้ว' })

  // เช็คเวลาปิด
  if (session.end_time) {
    const now  = new Date()
    const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
    if (hhmm >= session.end_time) {
      db.prepare('UPDATE sessions SET is_active = 0 WHERE id = ?').run(session.id)
      return res.status(403).json({
        success: false, error: 'session_closed',
        message: `หมดเวลาเช็คชื่อแล้ว (ปิดรับ ${session.end_time} น.)`
      })
    }
  }

  // กันซ้ำ
  const alreadyChecked = db.prepare(
    'SELECT id FROM attendance_log WHERE session_id = ? AND student_id = ?'
  ).get(session_id, student_id)

  if (alreadyChecked) {
    // emit แจ้งว่าเช็คซ้ำ (แสดงบนหน้าจอด้วย)
    if (_io) _io.emit('checkin_result', {
      success:    false,
      duplicate:  true,
      student_id: student.student_id,
      name:       student.name,
      status:     'duplicate',
      message:    'เช็คชื่อซ้ำ'
    })
    return res.status(409).json({ success: false, error: 'duplicate', message: `${student.name} เช็คชื่อไปแล้ว` })
  }

  // คำนวณสาย
  const sessionStart  = new Date(session.started_at.replace(' ', 'T') + '+07:00')
  const now           = new Date()
  const diffMinutes   = Math.floor((now - sessionStart) / 60000)
  const lateThreshold = session.late_threshold ?? 15
  const status        = diffMinutes <= lateThreshold ? 'ontime' : 'late'

  saveAttendance(session_id, student_id, status)

  const payload = {
    success:      true,
    student_id:   student.student_id,
    name:         student.name,
    subject:      session.subject_name,
    room:         session.room,
    status,
    late_minutes: diffMinutes,
    checked_at:   now.toLocaleTimeString('th-TH'),
    message:      status === 'late'
      ? `เช็คชื่อสำเร็จ (สาย ${diffMinutes} นาที)`
      : 'เช็คชื่อสำเร็จ'
  }

  // broadcast ไปทุก client ที่เชื่อมต่ออยู่
  if (_io) _io.emit('checkin_result', payload)

  res.json(payload)
})

module.exports = router
module.exports.setIO = setIO