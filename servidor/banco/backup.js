const { backup } = require('node:sqlite')
const { resolve, dirname } = require('node:path')
const { existsSync, mkdirSync } = require('node:fs')
const { openDatabase, DEFAULT_DATABASE_PATH } = require('./index')

async function main() {
  const destination = process.argv[2]
  if (!destination) throw new Error('Uso: npm run db:backup -- /caminho/backup.sqlite')
  const target = resolve(destination)
  const source = process.env.DATABASE_PATH || DEFAULT_DATABASE_PATH
  if (!existsSync(source)) throw new Error('Banco de origem não encontrado.')
  if (existsSync(target)) throw new Error('Destino já existe; escolha outro arquivo para preservar o backup anterior.')
  mkdirSync(dirname(target), { recursive: true })
  const db = openDatabase(source)
  try { await backup(db, target); console.log(`Backup concluído: ${target}`) } finally { db.close() }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
