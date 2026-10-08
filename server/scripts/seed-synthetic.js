const fs = require('fs')
const path = require('path')
const { db } = require('../database/db')

const seedPath = path.join(__dirname, '..', '..', 'sample-data', 'seed.sql')
const sql = fs.readFileSync(seedPath, 'utf8')

db.exec(sql)

const counts = {
  students: db.prepare('SELECT COUNT(*) AS count FROM students').get().count,
  sessions: db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count,
  attendance: db.prepare('SELECT COUNT(*) AS count FROM attendance_log').get().count,
  snapshots: db.prepare('SELECT COUNT(*) AS count FROM room_snapshots').get().count
}

console.log('Synthetic attendance data initialized:', counts)
db.close()