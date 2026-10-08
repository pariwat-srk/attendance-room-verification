const Database = require('better-sqlite3')
const path = require('path')

const databasePath = process.env.ATTENDANCE_DB_PATH
  ? path.resolve(process.env.ATTENDANCE_DB_PATH)
  : path.join(__dirname, 'attendance.db')
const db = new Database(databasePath)
db.pragma('journal_mode = WAL')
db.pragma('busy_timeout = 5000')

// ===========================
// สร้าง Table
// ===========================
db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id  TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    created_at  TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id      TEXT NOT NULL,
    subject_name    TEXT NOT NULL,
    room            TEXT,
    started_at      TEXT DEFAULT (datetime('now','localtime')),
    end_time        TEXT,
    late_threshold  INTEGER DEFAULT 15,
    is_active       INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS attendance_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  INTEGER NOT NULL,
    student_id  TEXT NOT NULL,
    status      TEXT DEFAULT 'ontime',
    checked_at  TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE TABLE IF NOT EXISTS room_snapshots (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id        INTEGER NOT NULL,
    count_checked     INTEGER,
    count_in_room     INTEGER,
    is_matched        INTEGER,
    missing_students  TEXT,
    snapshot_at       TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );
`)

// ===========================
// Migration
// ===========================
const migrate = () => {
  const aCols = db.prepare('PRAGMA table_info(attendance_log)').all().map(c => c.name)
  if (!aCols.includes('status')) {
    db.prepare(`ALTER TABLE attendance_log ADD COLUMN status TEXT DEFAULT 'ontime'`).run()
    console.log('✅ Migration: เพิ่ม status ใน attendance_log')
  }

  const sCols = db.prepare('PRAGMA table_info(sessions)').all().map(c => c.name)
  if (!sCols.includes('late_threshold')) {
    db.prepare('ALTER TABLE sessions ADD COLUMN late_threshold INTEGER DEFAULT 15').run()
    console.log('✅ Migration: เพิ่ม late_threshold ใน sessions')
  }
  if (!sCols.includes('end_time')) {
    db.prepare('ALTER TABLE sessions ADD COLUMN end_time TEXT').run()
    console.log('✅ Migration: เพิ่ม end_time ใน sessions')
  }
}
migrate()

console.log('✅ Database และ Table พร้อมใช้งาน')

// ===========================
// Functions
// ===========================
const getStudent       = (student_id) => db.prepare('SELECT * FROM students WHERE student_id = ?').get(student_id)
const getActiveSession = ()           => db.prepare('SELECT * FROM sessions WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get()
const getSessionById   = (session_id) => db.prepare('SELECT * FROM sessions WHERE id = ?').get(session_id)

const saveAttendance = (session_id, student_id, status = 'ontime') =>
  db.prepare('INSERT INTO attendance_log (session_id, student_id, status) VALUES (?, ?, ?)').run(session_id, student_id, status)

const getCheckedList = (session_id) =>
  db.prepare(`
    SELECT a.student_id, s.name, a.checked_at, a.status
    FROM attendance_log a
    JOIN students s ON a.student_id = s.student_id
    WHERE a.session_id = ?
    ORDER BY a.checked_at ASC
  `).all(session_id)

const getCheckedIds = (session_id) =>
  db.prepare('SELECT student_id FROM attendance_log WHERE session_id = ?').all(session_id).map(r => r.student_id)

const saveSnapshot = (session_id, count_checked, count_in_room, is_matched, missing_students) =>
  db.prepare(`
    INSERT INTO room_snapshots (session_id, count_checked, count_in_room, is_matched, missing_students)
    VALUES (?, ?, ?, ?, ?)
  `).run(session_id, count_checked, count_in_room, is_matched ? 1 : 0, JSON.stringify(missing_students))

const getLatestSnapshot = (session_id) => {
  const row = db.prepare('SELECT * FROM room_snapshots WHERE session_id = ? ORDER BY id DESC LIMIT 1').get(session_id)
  if (!row) return null
  return { ...row, missing_students: JSON.parse(row.missing_students || '[]') }
}

const getSummary = (session_id) => {
  const session  = getSessionById(session_id)
  const attended = db.prepare('SELECT COUNT(*) as count FROM attendance_log WHERE session_id = ?').get(session_id)
  const snapshot = getLatestSnapshot(session_id)
  return { session, count_checked: attended.count, latest_snapshot: snapshot }
}

module.exports = {
  db,
  getStudent, getActiveSession, getSessionById,
  saveAttendance, getCheckedList, getCheckedIds,
  saveSnapshot, getLatestSnapshot, getSummary
}