# Attendance & Room Verification System

A university team project exploring a backend workflow that compares digital attendance check-ins with anonymous room-occupancy counts. An instructor manages class sessions through a web dashboard, students are validated against session records, and a camera-side people count is compared with the number of stored check-ins.

This prototype verifies **count consistency only**. It does not use facial recognition, identify students from video, or determine which specific person is missing.

## Project evidence

| Instructor dashboard | Redacted API response |
| --- | --- |
| ![Instructor attendance dashboard](screenshots/instructor-dashboard.png) | ![Redacted check-in API evidence](screenshots/checkin-api-redacted.png) |

## My contribution

I was primarily responsible for backend system design, REST API behavior, attendance and session logic, SQLite persistence, integration with the room-counting output, count-comparison behavior, and backend testing and refinement.

The OpenCV/YOLO camera implementation was a team component. I do not claim authorship of the pretrained YOLO model or sole ownership of the complete university project.

## System flow

```text
Instructor dashboard
  -> REST API
  -> Express backend
  -> SQLite sessions and attendance

Digital check-in
  -> student/session validation
  -> duplicate lookup
  -> late classification
  -> attendance_log

Room camera
  -> OpenCV + pretrained YOLOv8 person count
  -> POST /api/camera2/verify
  -> checked-in count vs room count
  -> room_snapshots + verification_result event
```

![Verified system architecture](docs/images/system-architecture.png)

## Backend features

- Instructor-created sessions with active/inactive state
- Student and session validation
- Session-end enforcement
- Configurable late threshold with a 15-minute default
- Sequential duplicate check-in rejection
- Attendance list and summary endpoints
- SQLite persistence using prepared statements
- WAL journal mode and a 5-second busy timeout
- Runtime column migrations for older databases
- Anonymous room-count comparison and snapshot persistence
- Manual and timer-based session closing
- Socket.IO emission for room-verification results

## Room verification

The camera client sends a person count. The backend compares it with the number of check-in rows for the same session:

```text
count_checked === count_in_room
```

A matching count produces `is_matched: true`; a mismatch produces `false`. Both outcomes are stored in `room_snapshots`.

The reviewed client sends `detected_ids: []`, so the system cannot identify a missing individual. See [docs/room-verification.md](docs/room-verification.md).

## Socket.IO status

| Event | Verified status | Evidence |
| --- | --- | --- |
| `verification_result` | **VERIFIED WORKING at server emission boundary** | `server.js` passes `io` into `camera2.js`, which emits the event after saving a snapshot. The bundled dashboard does not subscribe to it. |
| `checkin_result` | **CODE EXISTS BUT WIRING INCOMPLETE** | `camera1.js` defines emit logic and `setIO(io)`, but `server.js` does not call that setter. HTTP check-in responses work independently. |

## Technology stack

- Node.js and Express
- SQLite with `better-sqlite3`
- Socket.IO
- REST API
- HTML, CSS, and browser JavaScript dashboard
- Python
- OpenCV
- Ultralytics YOLOv8 nano pretrained model

## Project structure

```text
server/         Express API, dashboard, SQLite schema, and synthetic seed runner
camera-client/  Anonymous OpenCV/YOLO person-count integration
sample-data/    Synthetic SQL data only
screenshots/    Curated and privacy-reviewed evidence
docs/           Architecture, attendance flow, and room-verification notes
```

## Local setup

### Backend

Prerequisites: Node.js and npm.

```powershell
cd server
npm ci
Copy-Item ..\.env.example .env
npm run seed:synthetic
npm start
```

Open:

- Instructor dashboard: `http://localhost:3000/`
- Check-in display: `http://localhost:3000/display.html`
- Health response: `GET http://localhost:3000/health`

The generated SQLite database is ignored by Git. Use only synthetic data in a recruiter/demo environment.

### Camera client

The camera is optional for backend review. The backend and synthetic API flow were revalidated during cleanup; the camera client was reviewed statically, but the webcam/YOLO runtime was not re-run on this machine. To exercise the physical count path:

```powershell
cd camera-client
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python room_counter.py
```

Ultralytics downloads the pretrained `yolov8n.pt` model when it is not present. Model weights and virtual environments are intentionally excluded from this package.

Relevant environment variables are documented in `.env.example`, including the server URL, webcam index, send interval, confidence threshold, and model path.

## Synthetic sample data

`sample-data/seed.sql` contains only fictional identifiers and names:

- `STU001` — Demo Student One
- `STU002` — Demo Student Two
- `STU003` — Demo Student Three

It also creates one inactive fictional session, two attendance examples, and one matched snapshot. `npm run seed:synthetic` initializes this data in the configured database.

## Technical documentation

- [System architecture](docs/architecture.md)
- [Attendance and late-classification flow](docs/attendance-flow.md)
- [Room-verification flow](docs/room-verification.md)

## Prototype scope and limitations

- Anonymous people counting only; no facial recognition or biometric identification
- Cannot identify which individual is missing when counts differ
- No production authentication or authorization
- CORS and Socket.IO origins are open for local prototype use
- Sequential duplicate checks work, but the database has no unique `(session_id, student_id)` constraint; concurrent requests could race
- Late/session-end calculations assume a host clock aligned with Thailand time and use a fixed `+07:00` offset for session-start parsing
- `checkin_result` Socket.IO wiring is incomplete
- `verification_result` is emitted by the server, but the bundled dashboard does not subscribe to it
- Session closing sends an internal verification request using the check-in count, not a fresh camera measurement
- SQLite foreign-key declarations are present, but normal runtime does not explicitly enable foreign-key enforcement
- Input validation, rate limiting, production error handling, automated tests, CI, deployment configuration, and monitoring are not included
- Real webcam operation and detection accuracy depend on local hardware, lighting, the pretrained model, and camera placement

## Portfolio

[View the Attendance & Room Verification case study](https://zinnarin-portfolio.netlify.app/projects/attendance)

## License

No project-level open-source license is granted by this recruiter-review package. Confirm team ownership and consent before adding one.