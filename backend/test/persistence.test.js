const { test } = require('node:test')
const assert = require('node:assert/strict')
const { mkdtempSync, rmSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { openDatabase } = require('../database')
const { createRepository } = require('../repository')
const { queryFilters, sensors } = require('../validation')

const START = Date.parse('2026-10-23T12:00:00.000Z')

function setup(t) {
  const db = openDatabase(':memory:')
  let now = START
  const repo = createRepository(db, { clock: () => now, offlineAfterMs: 120000 })
  t.after(() => db.close())
  return { db, repo, setTime: value => { now = value } }
}

function counts(db) {
  return Object.fromEntries(
    ['dispositivos', 'setores', 'localizacoes', 'leituras_ambientais', 'eventos']
      .map(table => [table, db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get().total]),
  )
}

test('um banco novo não apresenta registros fictícios e habilita integridade referencial', t => {
  const { db, repo } = setup(t)
  assert.deepEqual(repo.listDevices(), [])
  assert.deepEqual(repo.listSectors(), [])
  assert.deepEqual(repo.listLocations(), [])
  assert.deepEqual(repo.listEvents(), [])
  assert.deepEqual(repo.listEvents({}, true), [])
  assert.equal(repo.getDevice('INEXISTENTE'), undefined)
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1)
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
})

test('registros sobrevivem à reabertura e migrações não se repetem', t => {
  const directory = mkdtempSync(join(tmpdir(), 'aquiiot-persistence-'))
  const filename = join(directory, 'nested', 'aquiiot.sqlite')
  let db
  t.after(() => {
    if (db) db.close()
    rmSync(directory, { recursive: true, force: true })
  })
  db = openDatabase(filename)
  let repo = createRepository(db, { clock: () => START })
  repo.createSector({ nome: 'Laboratório', esp32: 'ESP32-LAB', descricao: 'Bancadas' })
  repo.recordLocation({ dispositivo: 'CHAVEIRO-001', setor: 'Laboratório', rssi: -48, temperatura: 24, luminosidade: 100 })
  const before = counts(db)
  const migrations = db.prepare('SELECT COUNT(*) AS total FROM schema_migrations').get().total
  assert.ok(migrations > 0)
  db.close()
  db = undefined

  db = openDatabase(filename)
  repo = createRepository(db, { clock: () => START })
  assert.deepEqual(counts(db), before)
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM schema_migrations').get().total, migrations)
  assert.equal(repo.getDevice('CHAVEIRO-001').setor, 'Laboratório')
  assert.equal(repo.listSectors()[0].esp32, 'ESP32-LAB')
  assert.equal(repo.latestReadings('CHAVEIRO-001').temperatura.valor, 24)
  assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal')
})

test('primeira detecção cadastra dispositivo e setor reais sem inventar origem ou receptor', t => {
  const { db, repo } = setup(t)
  repo.recordLocation({ dispositivo: 'CHAVEIRO-001', setor: 'Sala 01', rssi: -50 })
  const device = repo.getDevice('CHAVEIRO-001')
  assert.equal(device.id, 'CHAVEIRO-001')
  assert.equal(device.setor, 'Sala 01')
  assert.equal(device.rssi, -50)
  assert.equal(device.status, 'online')
  assert.equal(typeof device.ultimaAtualizacao, 'string')
  assert.equal(repo.listSectors().length, 1)
  assert.equal(repo.listSectors()[0].esp32, null)
  const event = repo.listEvents()[0]
  assert.equal(event.dispositivo, 'CHAVEIRO-001')
  assert.equal(event.setor, 'Sala 01')
  assert.equal(event.origem, null)
  assert.equal(event.rssi, -50)
  assert.equal(event.data, new Date(START).toISOString())
  assert.equal(typeof event.horario, 'string')
  assert.deepEqual(counts(db), { dispositivos: 1, setores: 1, localizacoes: 1, leituras_ambientais: 0, eventos: 1 })
})

test('detecções no mesmo setor e movimentações mantêm origem e histórico correto', t => {
  const { repo, setTime } = setup(t)
  repo.recordLocation({ dispositivo: 'TAG', setor: 'Sala A', rssi: -60 })
  setTime(START + 1000)
  repo.recordLocation({ dispositivo: 'TAG', setor: 'Sala A', rssi: -55 })
  setTime(START + 2000)
  repo.recordLocation({ dispositivo: 'TAG', setor: 'Sala B', rssi: -45 })
  const events = repo.listEvents()
  assert.equal(events.length, 3)
  assert.equal(events[0].tipo, 'movimentacao')
  assert.equal(events[0].origem, 'Sala A')
  assert.equal(events[0].setor, 'Sala B')
  assert.equal(events[1].tipo, 'deteccao')
  assert.equal(events[2].origem, null)
  assert.equal(repo.getDevice('TAG').setor, 'Sala B')
  assert.equal(repo.getDevice('TAG').rssi, -45)
  assert.equal(repo.listLocations({ dispositivo: 'TAG' }).length, 3)
  assert.equal(repo.listDevices().filter(device => device.setor === 'Sala A').length, 0)
  assert.equal(repo.listDevices().filter(device => device.setor === 'Sala B').length, 1)
})

test('falha ao gravar evento reverte localização, cadastros e sensores na mesma transação', t => {
  const { db, repo, setTime } = setup(t)
  repo.recordLocation({ dispositivo: 'TAG', setor: 'Sala A', rssi: -60, temperatura: 20 })
  const before = counts(db)
  const oldDevice = repo.getDevice('TAG')
  db.exec("CREATE TRIGGER forced_event_failure BEFORE INSERT ON eventos BEGIN SELECT RAISE(ABORT, 'forced rollback'); END")
  setTime(START + 1000)
  assert.throws(() => repo.recordLocation({ dispositivo: 'NOVO', setor: 'Sala nova', rssi: -30, temperatura: 30, luminosidade: 900 }))
  assert.deepEqual(counts(db), before)
  assert.equal(repo.getDevice('NOVO'), undefined)
  assert.throws(() => repo.recordLocation({ dispositivo: 'TAG', setor: 'Sala B', rssi: -20, temperatura: 40 }))
  assert.deepEqual(counts(db), before)
  assert.deepEqual(repo.getDevice('TAG'), oldDevice)
  assert.equal(repo.latestReadings('TAG').temperatura.valor, 20)
})

test('falha na leitura ambiental reverte também o evento e a localização já inseridos', t => {
  const { db, repo } = setup(t)
  db.exec("CREATE TRIGGER forced_reading_failure BEFORE INSERT ON leituras_ambientais BEGIN SELECT RAISE(ABORT, 'forced sensor rollback'); END")
  assert.throws(() => repo.recordLocation({ dispositivo: 'NOVO', setor: 'Sala nova', temperatura: 20 }))
  assert.deepEqual(counts(db), { dispositivos: 0, setores: 0, localizacoes: 0, leituras_ambientais: 0, eventos: 0 })
})

test('setor descoberto pode receber receptor sem duplicar setor nem permitir receptor compartilhado', t => {
  const { repo } = setup(t)
  repo.recordLocation({ dispositivo: 'TAG', setor: 'Sala A' })
  const initialId = repo.listSectors()[0].id
  repo.createSector({ nome: 'Sala A', esp32: 'ESP32-A', descricao: 'Primeiro andar' })
  assert.equal(repo.listSectors().length, 1)
  assert.equal(repo.listSectors()[0].id, initialId)
  assert.equal(repo.listSectors()[0].esp32, 'ESP32-A')
  assert.equal(repo.getDevice('TAG').setor, 'Sala A')
  assert.throws(() => repo.createSector({ nome: 'Sala B', esp32: 'ESP32-A' }), error => error.status === 409)
  assert.throws(() => repo.createSector({ nome: 'Sala A', esp32: 'ESP32-B' }), error => error.status === 409)
  assert.equal(repo.listSectors().length, 1)
})

test('chaves estrangeiras impedem referências inválidas e exclusão do histórico referenciado', t => {
  const { db, repo } = setup(t)
  repo.recordLocation({ dispositivo: 'TAG', setor: 'Sala A', rssi: -60 })
  const sectorId = db.prepare('SELECT id FROM setores WHERE nome = ?').get('Sala A').id
  assert.throws(() => db.prepare('INSERT INTO localizacoes (dispositivo_id, setor_id, registrado_em) VALUES (?, ?, ?)').run('INEXISTENTE', sectorId, START), /FOREIGN KEY/)
  assert.throws(() => db.prepare('INSERT INTO localizacoes (dispositivo_id, setor_id, registrado_em) VALUES (?, ?, ?)').run('TAG', 999999, START), /FOREIGN KEY/)
  assert.throws(() => db.prepare('DELETE FROM dispositivos WHERE id = ?').run('TAG'), /FOREIGN KEY/)
  assert.throws(() => db.prepare('DELETE FROM setores WHERE id = ?').run(sectorId), /FOREIGN KEY/)
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
})

test('consultas filtram dispositivo, setor, período e paginação com desempate estável por id', t => {
  const { repo, setTime } = setup(t)
  repo.recordLocation({ dispositivo: 'TAG-1', setor: 'Sala A', rssi: -60 })
  setTime(START + 1000)
  repo.recordLocation({ dispositivo: 'TAG-1', setor: 'Sala B', rssi: -50 })
  repo.recordLocation({ dispositivo: 'TAG-2', setor: 'Sala A', rssi: -40 })
  setTime(START + 2000)
  repo.recordLocation({ dispositivo: 'TAG-1', setor: 'Sala A', rssi: -30 })
  const locations = repo.listLocations()
  assert.equal(locations.length, 4)
  assert.deepEqual(locations.map(item => item.dispositivo), ['TAG-1', 'TAG-2', 'TAG-1', 'TAG-1'])
  assert.equal(repo.listLocations({ dispositivo: 'TAG-1' }).length, 3)
  assert.equal(repo.listLocations({ setor: 'Sala A' }).length, 3)
  const sameTime = repo.listLocations({ inicio: START + 1000, fim: START + 1000 })
  assert.equal(sameTime.length, 2)
  assert.deepEqual(sameTime.map(item => item.dispositivo), ['TAG-2', 'TAG-1'])
  assert.equal(repo.listLocations({ limite: 1, offset: 1 })[0].id, locations[1].id)
  assert.equal(repo.listEvents({ dispositivo: 'TAG-2' }).length, 1)
  assert.equal(repo.listEvents({ inicio: START + 1000, fim: START + 1000 }).length, 2)
  assert.equal(repo.listEvents({ limite: 1, offset: 1 })[0].dispositivo, 'TAG-2')
  assert.deepEqual(repo.listLocations({ dispositivo: 'INEXISTENTE' }), [])
})

test('status expira conforme relógio e retorna online após nova detecção', t => {
  const { repo, setTime } = setup(t)
  repo.recordLocation({ dispositivo: 'TAG', setor: 'Sala A' })
  assert.equal(repo.getDevice('TAG').status, 'online')
  assert.equal(repo.getDevice('TAG').rssi, null)
  setTime(START + 119999)
  assert.equal(repo.getDevice('TAG').status, 'online')
  setTime(START + 120001)
  assert.equal(repo.getDevice('TAG').status, 'offline')
  assert.equal(repo.listDevices()[0].status, 'offline')
  repo.recordLocation({ dispositivo: 'TAG', setor: 'Sala A', rssi: -42 })
  assert.equal(repo.getDevice('TAG').status, 'online')
})

test('leituras parciais preservam última medida de cada sensor e vínculo à localização', t => {
  const { db, repo, setTime } = setup(t)
  repo.recordLocation({ dispositivo: 'TAG', setor: 'Sala A' })
  assert.deepEqual(repo.latestReadings('TAG'), { dispositivo: 'TAG', temperatura: null, luminosidade: null })
  repo.recordReading({ dispositivo: 'TAG', temperatura: 20, luminosidade: 100 })
  setTime(START + 1000)
  repo.recordReading({ dispositivo: 'TAG', luminosidade: 200 })
  let latest = repo.latestReadings('TAG')
  assert.deepEqual(latest.temperatura, { valor: 20, data: new Date(START).toISOString() })
  assert.deepEqual(latest.luminosidade, { valor: 200, data: new Date(START + 1000).toISOString() })
  setTime(START + 2000)
  repo.recordLocation({ dispositivo: 'TAG', setor: 'Sala B', temperatura: 21 })
  latest = repo.latestReadings('TAG')
  assert.equal(latest.temperatura.valor, 21)
  assert.equal(latest.luminosidade.valor, 200)
  const rows = db.prepare('SELECT l.setor_id, s.nome FROM leituras_ambientais a JOIN localizacoes l ON l.id = a.localizacao_id JOIN setores s ON s.id = l.setor_id ORDER BY a.id').all()
  assert.deepEqual(rows.map(row => row.nome), ['Sala A', 'Sala A', 'Sala B'])
  assert.equal(repo.listLocations().length, 2, 'uma leitura avulsa não cria detecção')
})

test('eventos gerais ficam consultáveis sem poluir histórico de localização', t => {
  const { repo, setTime } = setup(t)
  repo.recordLocation({ dispositivo: 'TAG', setor: 'Sala A' })
  setTime(START + 1000)
  repo.recordEvent({ tipo: 'manutencao', nivel: 'aviso', mensagem: 'Receptor em manutenção', setor: 'Sala A', detalhes: { motivo: 'troca de alimentação' } })
  assert.equal(repo.listEvents().length, 1)
  const all = repo.listEvents({}, true)
  assert.equal(all.length, 2)
  assert.equal(all[0].tipo, 'manutencao')
  assert.deepEqual(all[0].detalhes, { motivo: 'troca de alimentação' })
  assert.equal(repo.listEvents({ tipo: 'manutencao' }, true).length, 1)
})

test('validação rejeita payloads inválidos antes de gravar dados', t => {
  const { db, repo } = setup(t)
  for (const input of [
    {},
    { dispositivo: '', setor: 'Sala' },
    { dispositivo: [], setor: 'Sala' },
    { dispositivo: 'TAG', setor: {} },
    { dispositivo: 'TAG', setor: 'Sala', rssi: '-50' },
    { dispositivo: 'TAG', setor: 'Sala', rssi: -50.5 },
    { dispositivo: 'TAG', setor: 'Sala', rssi: 1 },
    { dispositivo: 'TAG', setor: 'Sala', temperatura: NaN },
    { dispositivo: 'TAG', setor: 'Sala', luminosidade: -1 },
  ]) {
    assert.throws(() => repo.recordLocation(input), error => error.status === 400)
  }
  assert.deepEqual(counts(db), { dispositivos: 0, setores: 0, localizacoes: 0, leituras_ambientais: 0, eventos: 0 })
  assert.throws(() => repo.createSector({ nome: '' }), error => error.status === 400)
  assert.throws(() => repo.recordReading({ dispositivo: 'INEXISTENTE', temperatura: 20 }))
  assert.throws(() => repo.recordEvent({ tipo: 'aviso', nivel: 'invalido', mensagem: 'Teste' }), error => error.status === 400)
  repo.recordLocation({ dispositivo: 'TAG', setor: 'Sala A' })
  assert.throws(() => repo.recordReading({ dispositivo: 'TAG' }), error => error.status === 400)
  assert.throws(() => repo.recordReading({ dispositivo: 'TAG', temperatura: Infinity }), error => error.status === 400)
  assert.equal(counts(db).leituras_ambientais, 0)
})

test('nomes e identificadores são tratados como dados em consultas parametrizadas', t => {
  const { db, repo } = setup(t)
  const dispositivo = "TAG'; DROP TABLE setores; --"
  const setor = "Sala ' A"
  repo.recordLocation({ dispositivo, setor, rssi: -55 })
  assert.equal(repo.getDevice(dispositivo).id, dispositivo)
  assert.equal(repo.listLocations({ dispositivo, setor }).length, 1)
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM setores').get().total, 1)
})

test('filtros HTTP exigem datas com fuso e paginação limitada', () => {
  const filters = queryFilters({ inicio: '2026-10-23T09:00:00-03:00', fim: '2026-10-23T12:00:01Z', limite: '20', offset: '1' })
  assert.equal(filters.inicio, START)
  assert.equal(filters.fim, START + 1000)
  assert.equal(filters.limite, 20)
  assert.equal(filters.offset, 1)
  for (const query of [
    { inicio: '2026-10-23T12:00:00' },
    { inicio: 'não é data' },
    { inicio: '2026-10-24T12:00:00Z', fim: '2026-10-23T12:00:00Z' },
    { limite: '0' },
    { limite: '10001' },
    { offset: '-1' },
    { limite: '1.5' },
  ]) assert.throws(() => queryFilters(query), error => error.status === 400)
  assert.deepEqual(sensors({ temperatura: null, luminosidade: null }), { temperatura: null, luminosidade: null })
  assert.throws(() => sensors({ temperatura: Infinity }), error => error.status === 400)
})
