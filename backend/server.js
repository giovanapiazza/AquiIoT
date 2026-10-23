const { openDatabase } = require('./database')
const { createRepository } = require('./repository')
const { createApp } = require('./app')

const port = Number(process.env.PORT || 3000)
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválida.')
const db = openDatabase()
let repository
try {
  repository = createRepository(db, { offlineAfterMs: Number(process.env.OFFLINE_AFTER_MS || 120000) })
} catch (error) { db.close(); throw error }
const app = createApp(repository)
const server = app.listen(port, process.env.HOST || '0.0.0.0', () => {
  console.log(`Servidor AquiIoT rodando na porta ${port}, com persistência SQLite.`)
})
server.on('error', error => { console.error('Não foi possível iniciar o servidor:', error.message); db.close(); process.exitCode = 1 })
let stopping = false
function shutdown() {
  if (stopping) return
  stopping = true
  server.close(() => { db.close() })
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
