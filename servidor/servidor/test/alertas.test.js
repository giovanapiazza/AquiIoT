const { test } = require('node:test')
const assert = require('node:assert/strict')
const { openDatabase } = require('../../banco')
const { createRepository } = require('../repository')
const { createApp } = require('../app')

function setup() {
  const db = openDatabase(':memory:')
  const clock = { now: Date.parse('2026-11-06T12:00:00Z') }
  const repository = createRepository(db, { clock: () => clock.now })
  return { db, clock, repository }
}
// Leitura dos sensores de uma área, como o ESP32 envia
const sectorReading = (repository, setor, detalhes) =>
  repository.recordEvent({ tipo: 'leitura_setor', setor, mensagem: 'Leitura dos sensores do setor.', detalhes: { esp32: '0103020201', ...detalhes } })

test('regra de alerta valida os campos e pode ser editada e excluída', () => {
  const { db, repository } = setup()
  const { setor } = repository.createSector({ codigo: '010302', esp32: '0103020201' })
  assert.throws(() => repository.createAlertRule({ sensor: 'pressao', operador: 'maior', limite: 1 }), /Sensor deve ser/)
  assert.throws(() => repository.createAlertRule({ sensor: 'temperatura', operador: 'igual', limite: 1 }), /Operador/)
  assert.throws(() => repository.createAlertRule({ sensor: 'temperatura', operador: 'maior' }), /limite/)
  assert.throws(() => repository.createAlertRule({ sensor: 'temperatura', operador: 'maior', limite: '30' }), /Limite inválido/)
  assert.throws(() => repository.createAlertRule({ sensor: 'temperatura', operador: 'maior', limite: 30, setorId: 999 }), /Área não encontrada/)
  const rule = repository.createAlertRule({ sensor: 'temperatura', operador: 'maior', limite: 30, setorId: setor.id })
  assert.deepEqual([rule.sensor, rule.operador, rule.limite, rule.setor, rule.nivel, rule.ativa], ['temperatura', 'maior', 30, setor.nome, 'aviso', true])
  const edited = repository.updateAlertRule(rule.id, { limite: 28, nivel: 'erro' })
  assert.deepEqual([edited.sensor, edited.limite, edited.nivel, edited.setorId], ['temperatura', 28, 'erro', setor.id])
  assert.equal(repository.listAlertRules().length, 1)
  repository.deleteAlertRule(rule.id)
  assert.equal(repository.listAlertRules().length, 0)
  assert.throws(() => repository.deleteAlertRule(rule.id), /não encontrada/)
  db.close()
})

test('leitura da área fora do limite abre um alerta, atualiza e encerra ao voltar', () => {
  const { db, clock, repository } = setup()
  repository.createSector({ codigo: '010302', esp32: '0103020201' })
  const rule = repository.createAlertRule({ sensor: 'temperatura', operador: 'maior', limite: 30 })
  repository.createAlertRule({ sensor: 'umidade', operador: 'menor', limite: 20 })
  sectorReading(repository, '010302', { temperatura_c: 25, umidade_percentual: 50 })
  assert.equal(repository.listAlerts().length, 0)

  clock.now += 1000
  sectorReading(repository, '010302', { temperatura_c: 31.5, umidade_percentual: 50 })
  let [alert] = repository.listAlerts()
  assert.deepEqual([alert.regraId, alert.sensor, alert.valor, alert.valorAtual, alert.aberto, alert.setor], [rule.id, 'temperatura', 31.5, 31.5, true, 'Hospital · Enfermaria · Ala B'])

  // Continua fora do limite: o mesmo alerta, valor atualizado
  clock.now += 1000
  sectorReading(repository, '010302', { temperatura_c: 33, umidade_percentual: 50 })
  assert.equal(repository.listAlerts().length, 1)
  ;[alert] = repository.listAlerts()
  assert.deepEqual([alert.valor, alert.valorAtual], [31.5, 33])

  // Valor ausente (sensor com falha) não encerra o alerta
  clock.now += 1000
  sectorReading(repository, '010302', { temperatura_c: null, umidade_percentual: null })
  assert.equal(repository.listAlerts().length, 1)

  clock.now += 1000
  sectorReading(repository, '010302', { temperatura_c: 29, umidade_percentual: 10 })
  const open = repository.listAlerts()
  assert.deepEqual(open.map(a => a.sensor), ['umidade'])
  const all = repository.listAlerts({ estado: 'todos' })
  assert.equal(all.length, 2)
  assert.equal(all.find(a => a.sensor === 'temperatura').resolvido, new Date(clock.now).toISOString())
  const tipos = repository.listEvents({}, true).map(e => e.tipo)
  assert.equal(tipos.filter(t => t === 'alerta_sensor').length, 2)
  assert.equal(tipos.filter(t => t === 'alerta_resolvido').length, 1)
  db.close()
})

test('regra de uma área ignora as outras; leituras do chaveiro também geram alerta', () => {
  const { db, clock, repository } = setup()
  const { setor: alaB } = repository.createSector({ codigo: '010302' })
  repository.createSector({ codigo: '010303' })
  repository.createAlertRule({ sensor: 'temperatura', operador: 'maior', limite: 30, setorId: alaB.id })
  repository.createAlertRule({ sensor: 'luminosidade', operador: 'menor', limite: 50 })
  sectorReading(repository, '010303', { temperatura_c: 40 })
  assert.equal(repository.listAlerts().length, 0)

  // Chaveiro na Ala B, com sensores
  clock.now += 1000
  repository.recordLocation({ codigo: '0103020301', rssi: -60, temperatura: 35, luminosidade: 10 })
  const alerts = repository.listAlerts()
  assert.deepEqual(alerts.map(a => [a.sensor, a.dispositivo]).sort(), [['luminosidade', '0301'], ['temperatura', '0301']])
  // Origem distinta: a mesma regra pode estar aberta para a área e para o chaveiro
  sectorReading(repository, '010302', { temperatura_c: 31 })
  assert.equal(repository.listAlerts().filter(a => a.sensor === 'temperatura').length, 2)
  clock.now += 1000
  repository.recordReading({ dispositivo: '0301', temperatura: 20 })
  assert.deepEqual(repository.listAlerts().map(a => [a.sensor, a.dispositivo]).sort(), [['luminosidade', '0301'], ['temperatura', null]])
  db.close()
})

test('editar ou desativar a regra encerra os alertas abertos dela', () => {
  const { db, clock, repository } = setup()
  repository.createSector({ codigo: '010302' })
  const rule = repository.createAlertRule({ sensor: 'som', operador: 'maior', limite: 100 })
  sectorReading(repository, '010302', { som_variacao: 500 })
  assert.equal(repository.listAlerts().length, 1)
  repository.updateAlertRule(rule.id, { ativa: false })
  assert.equal(repository.listAlerts().length, 0)
  clock.now += 1000
  sectorReading(repository, '010302', { som_variacao: 500 })
  assert.equal(repository.listAlerts().length, 0)
  repository.updateAlertRule(rule.id, { ativa: true })
  sectorReading(repository, '010302', { som_variacao: 500 })
  const [alert] = repository.listAlerts()
  assert.equal(alert.reconhecido, null)
  repository.acknowledgeAlert(alert.id)
  assert.ok(repository.listAlerts()[0].reconhecido)
  assert.equal(repository.listAlerts()[0].aberto, true)
  assert.throws(() => repository.acknowledgeAlert(9999), /não encontrado/)
  db.close()
})

test('excluir chaveiro apaga o histórico dele e mantém o dos outros', () => {
  const { db, clock, repository } = setup()
  repository.saveDevice('0301', { nome: 'Ana' })
  repository.createAlertRule({ sensor: 'temperatura', operador: 'maior', limite: 30 })
  repository.recordLocation({ codigo: '0103020301', rssi: -60, temperatura: 35 })
  clock.now += 1000
  repository.recordLocation({ codigo: '0103030301', rssi: -60 })
  repository.recordDeparture({ codigo: '0103030301' })
  repository.recordLocation({ codigo: '0103020302', rssi: -50 })
  assert.equal(repository.listAlerts().length, 1)

  const result = repository.deleteDevice('0301')
  assert.deepEqual([result.excluido, result.localizacoes, result.leituras], [true, 2, 1])
  assert.deepEqual(repository.listDevices().map(d => d.id), ['0302'])
  assert.equal(repository.listLocations({ dispositivo: '0301' }).length, 0)
  assert.equal(repository.listEvents({}, true).some(e => e.dispositivo === '0301'), false)
  assert.equal(repository.listAlerts({ estado: 'todos' }).length, 0)
  const [log] = repository.listEvents({ tipo: 'exclusao' }, true)
  assert.match(log.mensagem, /0301 \(Ana\)/)
  assert.throws(() => repository.deleteDevice('0301'), /não encontrado/)
  // Uma nova detecção volta a cadastrá-lo, do zero
  repository.recordLocation({ codigo: '0103020301' })
  assert.equal(repository.listDevices().length, 2)
  db.close()
})

test('excluir área apaga detecções, receptores e regras dela, mantendo o resto', () => {
  const { db, clock, repository } = setup()
  const { setor: alaB } = repository.createSector({ codigo: '010302', esp32: '0103020201' })
  repository.createAlertRule({ sensor: 'temperatura', operador: 'maior', limite: 30, setorId: alaB.id })
  repository.createAlertRule({ sensor: 'temperatura', operador: 'maior', limite: 50 })
  repository.recordLocation({ codigo: '0103020301', rssi: -60, temperatura: 35 })
  sectorReading(repository, '010302', { temperatura_c: 40 })
  clock.now += 1000
  repository.recordLocation({ codigo: '0103030301', rssi: -60 })
  clock.now += 1000
  repository.recordLocation({ codigo: '0103020302', rssi: -60 })
  repository.recordDeparture({ codigo: '0103020302' })

  const result = repository.deleteSector(alaB.id)
  assert.deepEqual([result.excluido, result.localizacoes], [true, 2])
  assert.deepEqual(repository.listSectors().map(s => s.codigo), ['010303'])
  assert.deepEqual(repository.listAlertRules().map(r => r.limite), [50])
  assert.equal(repository.listAlerts({ estado: 'todos' }).length, 0)
  // 0301 continua, com a movimentação para a Ala C sem origem; a leitura dele fica
  const devices = repository.listDevices()
  assert.deepEqual(devices.map(d => [d.id, d.setor]), [['0301', 'Hospital · Enfermaria · Ala C'], ['0302', null]])
  const [movement] = repository.listEvents({ dispositivo: '0301' })
  assert.deepEqual([movement.tipo, movement.origem], ['movimentacao', null])
  assert.equal(repository.listReadings({ dispositivo: '0301' }).length, 1)
  assert.equal(repository.listEvents({}, true).some(e => e.setor === alaB.nome || e.origem === alaB.nome), false)
  // O ESP32 fica livre para outra área
  assert.equal(repository.createSector({ codigo: '010303', esp32: '0103020201' }).criado, true)
  assert.throws(() => repository.deleteSector(alaB.id), /não encontrado/)
  db.close()
})

test('rotas HTTP de alertas e exclusão', async t => {
  const db = openDatabase(':memory:')
  const repository = createRepository(db)
  const server = createApp(repository).listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close() })
  const base = `http://127.0.0.1:${server.address().port}/api`
  const call = async (method, path, body) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) })
    return { status: response.status, body: await response.json() }
  }
  const created = await call('POST', '/alertas/regras', { sensor: 'temperatura', operador: 'maior', limite: 30 })
  assert.equal(created.status, 201)
  assert.equal((await call('PUT', `/alertas/regras/${created.body.id}`, { limite: 25 })).body.limite, 25)
  assert.equal((await call('POST', '/alertas/regras', { sensor: 'x', operador: 'maior', limite: 1 })).status, 400)
  assert.equal((await call('DELETE', '/alertas/regras/abc')).status, 400)
  assert.equal((await call('GET', '/alertas?estado=talvez')).status, 400)

  await call('POST', '/setores', { codigo: '010302' })
  await call('POST', '/eventos', { tipo: 'leitura_setor', setor: '010302', mensagem: 'x', detalhes: { temperatura_c: 26 } })
  const [alert] = (await call('GET', '/alertas')).body
  assert.equal(alert.valor, 26)
  assert.equal((await call('POST', `/alertas/${alert.id}/reconhecer`)).status, 200)
  assert.equal((await call('POST', '/eventos', { tipo: 'alerta_sensor', mensagem: 'falso' })).status, 400)

  await call('POST', '/localizacao', { codigo: '0103020301', rssi: -60 })
  assert.equal((await call('DELETE', '/dispositivos/0301')).body.excluido, true)
  assert.equal((await call('DELETE', '/dispositivos/0301')).status, 404)
  const [sector] = (await call('GET', '/setores')).body
  assert.equal((await call('DELETE', `/setores/${sector.id}`)).body.excluido, true)
  assert.equal((await call('DELETE', `/setores/${sector.id}`)).status, 404)
  assert.equal((await call('DELETE', '/setores/1x')).status, 400)
  assert.equal((await call('DELETE', `/alertas/regras/${created.body.id}`)).body.excluida, true)
})
