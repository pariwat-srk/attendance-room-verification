PRAGMA foreign_keys = ON;

DELETE FROM room_snapshots;
DELETE FROM attendance_log;
DELETE FROM sessions;
DELETE FROM students;
DELETE FROM sqlite_sequence
WHERE name IN ('room_snapshots', 'attendance_log', 'sessions', 'students');

INSERT INTO students (student_id, name) VALUES
  ('STU001', 'Demo Student One'),
  ('STU002', 'Demo Student Two'),
  ('STU003', 'Demo Student Three');

INSERT INTO sessions (
  subject_id,
  subject_name,
  room,
  started_at,
  end_time,
  late_threshold,
  is_active
) VALUES (
  'DEMO101',
  'Synthetic Attendance Demo',
  'DEMO-ROOM',
  '2030-01-01 09:00:00',
  '10:00',
  15,
  0
);

INSERT INTO attendance_log (session_id, student_id, status, checked_at)
SELECT id, 'STU001', 'ontime', '2030-01-01 09:05:00'
FROM sessions WHERE subject_id = 'DEMO101';

INSERT INTO attendance_log (session_id, student_id, status, checked_at)
SELECT id, 'STU002', 'late', '2030-01-01 09:20:00'
FROM sessions WHERE subject_id = 'DEMO101';

INSERT INTO room_snapshots (
  session_id,
  count_checked,
  count_in_room,
  is_matched,
  missing_students,
  snapshot_at
)
SELECT id, 2, 2, 1, '[]', '2030-01-01 09:25:00'
FROM sessions WHERE subject_id = 'DEMO101';