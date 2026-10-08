const express = require('express')
const {
  getCheckedList,
  getCheckedIds,
  getStudent,
  saveSnapshot,
  getLatestSnapshot,
  getActiveSession,
  db
} = require('../database/db')

module.exports = (io) => {
  const router = express.Router()

  // GET /api/camera2/checklist/:session_id
  router.get('/checklist/:session_id', (req, res) => {
    const { session_id } = req.params
    const list = getCheckedList(session_id)
    res.json({
      session_id,
      count: list.length,
      students: list
    })
  })

  // GET /api/camera2/checklist/active
  router.get('/checklist/active', (req, res) => {
    const session = getActiveSession()
    if (!session) return res.status(404).json({ error: 'ไม่มี session ที่เปิดอยู่' })
    const list = getCheckedList(session.id)
    res.json({
      session_id: session.id,
      subject:    session.subject_name,
      room:       session.room,
      count:      list.length,
      students:   list
    })
  })

  // GET /api/camera2/latest/active
  // ดึง snapshot ล่าสุดของ session ที่เปิดอยู่ตอนนี้
  router.get('/latest/active', (req, res) => {
    const session = getActiveSession()
    if (!session) return res.status(404).json({ error: 'ไม่มี session ที่เปิดอยู่' })
    const snapshot = getLatestSnapshot(session.id)
    if (!snapshot) return res.status(404).json({ error: 'ยังไม่มีข้อมูลจากกล้อง' })
    res.json(snapshot)
  })

  // GET /api/camera2/latest/:session_id
  // ดึง snapshot ล่าสุดที่กล้องส่งมา (ใช้ดูผลใน Postman หรือ dashboard)
  router.get('/latest/:session_id', (req, res) => {
    const { session_id } = req.params
    const snapshot = getLatestSnapshot(session_id)
    if (!snapshot) return res.status(404).json({ error: 'ยังไม่มีข้อมูลจากกล้อง' })
    res.json(snapshot)
  })

  // POST /api/camera2/verify
  // กล้อง 2 ส่ง count_in_room มาทุก 10 วินาที
  router.post('/verify', (req, res) => {
    let { session_id, count_in_room, detected_ids } = req.body

    // ถ้าไม่ส่ง session_id มา → ดึง session active อัตโนมัติ
    if (!session_id) {
      const session = getActiveSession()
      if (!session) return res.status(404).json({ error: 'ไม่มี session ที่เปิดอยู่' })
      session_id = session.id
    }

    // count_in_room ต้องส่งมาจากกล้องเสมอ
    if (count_in_room === undefined || count_in_room === null) {
      return res.status(400).json({ error: 'ต้องส่ง count_in_room จากกล้อง' })
    }

    // ดึงรายชื่อที่เช็คจาก DB
    const checkedIds    = getCheckedIds(session_id)
    const count_checked = checkedIds.length
    const is_matched    = count_checked === count_in_room

    // หาคนที่เช็คแต่ไม่อยู่ในห้อง (ถ้ากล้อง 2 ส่ง detected_ids มาด้วย)
    const detectedList    = detected_ids || []
    const missingIds      = detectedList.length > 0
      ? checkedIds.filter(id => !detectedList.includes(id))
      : []
    const missingStudents = missingIds.map(id => getStudent(id)).filter(Boolean)

    // บันทึก snapshot ลง DB
    saveSnapshot(session_id, count_checked, count_in_room, is_matched, missingStudents)

    const result = {
      session_id,
      count_checked,
      count_in_room,
      is_matched,
      missing: missingStudents
    }

    // Push ไป Dashboard แบบ real-time
    io.emit('verification_result', result)

    console.log(`📊 Verify session ${session_id}: checked=${count_checked}, room=${count_in_room}, matched=${is_matched}`)

    res.json({ success: true, ...result })
  })

  return router
}