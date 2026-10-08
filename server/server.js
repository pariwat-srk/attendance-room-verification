const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '.env') })
const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const cors = require('cors')
const { exec } = require('child_process')

const app = express()
const server = http.createServer(app)
const io = new Server(server, {
  cors: { origin: '*' }
})

app.use(cors())
app.use(express.json())

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Attendance Server is running' })
})

app.use(express.static(path.join(__dirname, 'public')))

// Route registration
app.use('/api/camera1', require('./routes/camera1'))
app.use('/api/camera2', require('./routes/camera2')(io))
app.use('/api/dashboard', require('./routes/dashboard'))


io.on('connection', (socket) => {
  console.log('Dashboard connected:', socket.id)
  socket.on('disconnect', () => {
    console.log('Dashboard disconnected:', socket.id)
  })
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`Attendance Server listening at http://localhost:${PORT}`)

  if (process.env.AUTO_OPEN_BROWSER === 'true') {
    const url = `http://localhost:${PORT}/display.html`
    const cmd = process.platform === 'win32' ? `start ${url}`
              : process.platform === 'darwin' ? `open ${url}`
              : `xdg-open ${url}`
    exec(cmd, (err) => {
      if (err) console.log('Could not open browser automatically:', url)
      else console.log('Opened display page:', url)
    })
  }
})
