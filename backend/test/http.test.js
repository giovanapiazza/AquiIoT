const { test } = require('node:test')
const assert = require('node:assert/strict')
const { openDatabase } = require('../database')
const { createRepository } = require('../repository')
const { createApp } = require('../app')

test('API persiste detecções e oferece consultas compatíveis com a interface', async t => {
  const db = openDatabase(':memory:')
  let now = Date.parse('2026-10-23T10:00:00Z')
  const repository = createRepository(db, { clock: () => now })
  const server = createApp(repository).listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject) })
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close() })
  const base = `http://127.0.0.1:${server.address().port}`
  async function request(path, body, expected = 200) {
    const response = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await response.json()
    assert.equal(response.status, expected, JSON.stringify(data))
    return data
  }
  assert.deepEqual(await request('/api/dispositivos'), [])
  assert.deepEqual(await request('/api/setores'), [])
  assert.deepEqual(await request('/api/eventos'), [])
  const sala = await request('/api/setores', { nome: 'Sala A', esp32: 'ESP32-A' }, 201)
  await request('/api/localizacao', { dispositivo: 'CHAVE-01', setor: 'Sala A', rssi: -48, temperatura: 22, luminosidade: 150 }, 201)
  now += 1000
  await request('/api/localizacao', { dispositivo: 'CHAVE-01', setor: 'Sala B', rssi: -50 }, 201)
  const devices = await request('/api/dispositivos')
  assert.equal(devices[0].id, 'CHAVE-01')
  assert.equal(devices[0].status, 'online')
  assert.equal(devices[0].setor, 'Sala B')
  assert.match(devices[0].ultimaAtualizacao, /^\d{2}:\d{2}:\d{2}$/)
  const events = await request('/api/eventos')
  assert.equal(events.length, 2)
  assert.equal(events[0].origem, 'Sala A')
  assert.equal(events[0].destino, 'Sala B')
  assert.equal(events[0].rssi, -50)
  assert.equal(events[0].tipo, 'movimentacao')
  assert.equal(events[0].data, '2026-10-23T10:00:01.000Z')
  assert.equal((await request('/api/dispositivos/CHAVE-01/localizacao')).setor, 'Sala B')
  assert.equal((await request('/api/dispositivos/CHAVE-01/historico')).length, 2)
  assert.deepEqual(await request(`/api/setores/${sala.id}/dispositivos`), [])
  assert.equal((await request('/api/localizacoes?setor=Sala%20B&limite=1')).length, 1)
  assert.equal((await request('/api/localizacoes?inicio=2026-10-23T10%3A00%3A01Z&fim=2026-10-23T10%3A00%3A01Z')).length, 1)
  await request('/api/leituras', { dispositivo: 'CHAVE-01', temperatura: 0 }, 201)
  const latest = await request('/api/dispositivos/CHAVE-01/leituras/ultima')
  assert.equal(latest.temperatura.valor, 0)
  assert.equal(latest.luminosidade.valor, 150)
  assert.equal((await request('/api/leituras?setor=Sala%20A')).length, 1)
  await request('/api/eventos', { tipo: 'alerta', nivel: 'aviso', mensagem: 'Bateria baixa', dispositivo: 'CHAVE-01', detalhes: { bateria: 10 } }, 201)
  assert.equal((await request('/api/eventos')).length, 2)
  assert.equal((await request('/api/eventos/sistema')).length, 4)
  assert.deepEqual((await request('/api/eventos/sistema?tipo=alerta'))[0].detalhes, { bateria: 10 })
  for (const [path, body] of [
    ['/api/localizacao', { dispositivo: {}, setor: 'A' }],
    ['/api/localizacao', { dispositivo: 'A', setor: 'A', rssi: 'forte' }],
    ['/api/localizacao', { dispositivo: 'A', setor: 'A', luminosidade: -1 }],
    ['/api/leituras', { dispositivo: 'CHAVE-01' }],
    ['/api/eventos', { tipo: 'movimentacao', mensagem: 'Injetado' }],
  ]) await request(path, body, 400)
  await request('/api/setores', { nome: 'Outro', esp32: 'ESP32-A' }, 409)
  await request('/api/localizacoes?limite=0', undefined, 400)
  await request('/api/localizacoes?inicio=2026-10-23', undefined, 400)
  await request('/api/dispositivos/inexistente', undefined, 404)
  await request('/api/leituras', { dispositivo: 'inexistente', temperatura: 20 }, 404)
  const malformed = await fetch(base + '/api/localizacao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })
  assert.equal(malformed.status, 400)
  assert.ok((await malformed.json()).erro)
  now += 120000
  assert.equal((await request('/api/dispositivos'))[0].status, 'offline')
})
