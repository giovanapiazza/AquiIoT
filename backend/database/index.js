const { DatabaseSync } = require('node:sqlite')
const { mkdirSync, readFileSync, readdirSync } = require('node:fs')
const { dirname, join, resolve } = require('node:path')

const DEFAULT_DATABASE_PATH = join(__dirname, '..', 'data', 'aquiiot.sqlite')

function openDatabase(filename = process.env.DATABASE_PATH || DEFAULT_DATABASE_PATH) {
  const path = filename === ':memory:' ? filename : resolve(filename)
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  try {
    db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;')
    db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (versao TEXT PRIMARY KEY, aplicada_em INTEGER NOT NULL) STRICT')
    const migrations = readdirSync(join(__dirname, 'migrations')).filter(file => file.endsWith('.sql')).sort()
    const applied = db.prepare('SELECT versao FROM schema_migrations').all().map(row => row.versao)
    if (applied.some(version => !migrations.includes(version))) throw new Error('Banco com migração desconhecida; use uma versão compatível do backend.')
    for (const version of migrations) {
      if (applied.includes(version)) continue
      db.exec('BEGIN IMMEDIATE')
      try {
        db.exec(readFileSync(join(__dirname, 'migrations', version), 'utf8'))
        db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(version, Date.now())
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    }
    return db
  } catch (error) {
    db.close()
    throw error
  }
}
module.exports = { openDatabase, DEFAULT_DATABASE_PATH }
