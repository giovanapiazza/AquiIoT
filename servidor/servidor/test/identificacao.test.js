const { test } = require('node:test')
const assert = require('node:assert/strict')
const { openDatabase } = require('../../banco')
const { createRepository } = require('../repository')
const { decode } = require('../identificacao')

test('decodifica o padrão PPSSAATTNN com o cadastro central', () => {
  assert.deepEqual(decode('0103020301'), { codigo: '0103020301', local: '010302', no: '0301', planta: 'Hospital', setor: 'Enfermaria', area: 'Ala B', tipo: 'ESP8266', numero: '01' })
  assert.equal(decode('0299070205').area, 'Área 07')
  assert.equal(decode('0299070205').setor, 'Setor 99')
  for (const invalid of ['010302030', '01030203011', '01030203a1', 103020301, null]) assert.equal(decode(invalid), null)
})

test('localização por código identifica o chaveiro pelo TTNN e o setor pela área', () => {
  const db = openDatabase(':memory:')
  let now = Date.parse('2026-10-27T10:00:00Z')
  const repository = createRepository(db, { clock: () => now })
  const first = repository.recordLocation({ codigo: '0103020301', rssi: -60, esp32: '0103020201' })
  assert.equal(first.dispositivo, '0301')
  assert.equal(first.setor, 'Hospital · Enfermaria · Ala B')
  assert.equal(first.identificacao.tipo, 'ESP8266')
  now += 1000
  repository.recordLocation({ codigo: '0103030301', rssi: -55 })
  const [device] = repository.listDevices()
  assert.equal(device.id, '0301')
  assert.equal(device.setor, 'Hospital · Enfermaria · Ala C')
  assert.equal(device.codigo, '0103030301')
  assert.equal(device.tipo, 'ESP8266')
  assert.equal(device.numero, '01')
  const sectors = repository.listSectors()
  assert.deepEqual(sectors.map(s => [s.codigo, s.esp32]), [['010302', '0103020201'], ['010303', null]])
  const [movement] = repository.listEvents()
  assert.equal(movement.tipo, 'movimentacao')
  assert.equal(movement.origem, 'Hospital · Enfermaria · Ala B')
  assert.equal(movement.codigo, '0103030301')
  // Setor renomeado continua reconhecido pelo código
  db.prepare("UPDATE setores SET nome = 'Ala B (leitos 1-10)' WHERE codigo = '010302'").run()
  assert.equal(repository.recordLocation({ codigo: '0103020302' }).setor, 'Ala B (leitos 1-10)')
  assert.throws(() => repository.recordLocation({ codigo: '123' }), /10 dígitos/)
  db.close()
})

test('ESP32 registra a área pelo código PPSSAA e envia eventos pelo código', () => {
  const db = openDatabase(':memory:')
  const repository = createRepository(db, { clock: () => Date.parse('2026-10-27T10:00:00Z') })
  const { setor: sector, criado } = repository.createSector({ codigo: '010302', esp32: '0103020201' })
  assert.equal(sector.nome, 'Hospital · Enfermaria · Ala B')
  assert.equal(criado, true)
  // Regravar o mesmo ESP32 não é erro e não duplica nada
  assert.equal(repository.createSector({ codigo: '010302', esp32: '0103020201' }).criado, false)
  // Área grande: segundo ESP32 na mesma área
  assert.equal(repository.createSector({ codigo: '010302', esp32: '0103020202' }).criado, true)
  assert.deepEqual(repository.listSectors()[0].receptores, ['0103020201', '0103020202'])
  assert.throws(() => repository.createSector({ codigo: '010303', esp32: '0103020202' }), /ESP32 já associado a outro setor/)
  assert.equal(repository.recordLocation({ codigo: '0103020301' }).setor, sector.nome)
  assert.equal(repository.listSectors().length, 1)
  repository.recordEvent({ tipo: 'leitura_setor', mensagem: 'Leitura', setor: '010302' })
  assert.equal(repository.listEvents({}, true).find(e => e.tipo === 'leitura_setor').setor, sector.nome)
  // Área descoberta antes pela detecção recebe o ESP32 depois
  repository.recordLocation({ codigo: '0103010302' })
  assert.equal(repository.createSector({ codigo: '010301', esp32: '0103010201' }).setor.nome, 'Hospital · Enfermaria · Ala A')
  assert.throws(() => repository.createSector({ codigo: '12' }), /6 dígitos/)
  // Código de uma área usado com o nome de outro setor já cadastrado
  repository.createSector({ nome: 'Sala técnica' })
  assert.throws(() => repository.createSector({ codigo: '010302', nome: 'Sala técnica' }), /Código já associado a outro setor/)
  assert.equal(repository.listSectors().find(s => s.nome === 'Sala técnica').codigo, null)
  db.close()
})

test('nome do usuário enviado pelo chaveiro fica no dispositivo', () => {
  const db = openDatabase(':memory:')
  const repository = createRepository(db, { clock: () => Date.parse('2026-10-27T10:00:00Z') })
  repository.recordLocation({ codigo: '0103020301', nome: 'João Silva' })
  assert.equal(repository.listDevices()[0].nome, 'João Silva')
  repository.recordLocation({ codigo: '0103030301' })
  assert.equal(repository.listDevices()[0].nome, 'João Silva')
  repository.recordLocation({ codigo: '0103030301', nome: 'Maria' })
  assert.equal(repository.listDevices()[0].nome, 'Maria')
  assert.throws(() => repository.recordLocation({ codigo: '0103030301', nome: 'x'.repeat(61) }), /Nome/)
  db.close()
})

test('interface cadastra o chaveiro gravado antes da primeira detecção', () => {
  const db = openDatabase(':memory:')
  const repository = createRepository(db, { clock: () => Date.parse('2026-10-27T10:00:00Z') })
  const device = repository.saveDevice('0301', { nome: 'Ana' })
  assert.deepEqual([device.id, device.nome, device.status, device.tipo], ['0301', 'Ana', 'offline', 'ESP8266'])
  assert.equal(repository.saveDevice('0301', { nome: 'Bruno' }).nome, 'Bruno')
  assert.equal(repository.listEvents({ tipo: 'cadastro' }, true).length, 2)
  repository.recordLocation({ codigo: '0103020301' })
  assert.equal(repository.listDevices()[0].nome, 'Bruno')
  assert.throws(() => repository.saveDevice('0302', {}), /Nome/)
  db.close()
})

test('saída avisada pelo ESP32 deixa o chaveiro offline até a próxima detecção', () => {
  const db = openDatabase(':memory:')
  let now = Date.parse('2026-10-28T10:00:00Z')
  const repository = createRepository(db, { clock: () => now })
  repository.recordLocation({ codigo: '0103020301', nome: 'Ana' })
  assert.equal(repository.listDevices()[0].status, 'online')
  now += 1000
  assert.equal(repository.recordDeparture({ codigo: '0103020301' }).status, 'offline')
  const [saida] = repository.listEvents()
  assert.deepEqual([saida.tipo, saida.origem, saida.destino], ['saida', 'Hospital · Enfermaria · Ala B', null])
  now += 1000
  repository.recordLocation({ codigo: '0103020301' })
  assert.equal(repository.listDevices()[0].status, 'online')
  assert.throws(() => repository.recordDeparture({ codigo: '0103020399' }), /não encontrado/)
  db.close()
})

test('saída atrasada de uma área não tira do ar o chaveiro já detectado em outra', () => {
  const db = openDatabase(':memory:')
  let now = Date.parse('2026-11-05T10:00:00Z')
  const repository = createRepository(db, { clock: () => now })
  repository.recordLocation({ codigo: '0103010301' }) // Ala A
  now += 5000
  repository.recordLocation({ codigo: '0103020301' }) // já na Ala B
  now += 10000
  // A Ala A só percebe a saída agora
  const result = repository.recordDeparture({ codigo: '0103010301' })
  assert.equal(result.ignorado, true)
  assert.equal(result.status, 'online')
  assert.equal(result.setor, 'Hospital · Enfermaria · Ala B')
  assert.equal(repository.listEvents().some(e => e.tipo === 'saida'), false)
  // A saída da área atual continua valendo
  now += 1000
  assert.equal(repository.recordDeparture({ codigo: '0103020301' }).status, 'offline')
  assert.equal(repository.listEvents()[0].origem, 'Hospital · Enfermaria · Ala B')
  db.close()
})

test('catálogo de identificação fica disponível para a interface', async t => {
  const { createApp } = require('../app')
  const db = openDatabase(':memory:')
  const server = createApp(createRepository(db)).listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close() })
  const data = await (await fetch(`http://127.0.0.1:${server.address().port}/api/identificacao`)).json()
  assert.equal(data.plantas['01'].setores['03'].areas['02'], 'Ala B')
  assert.equal(data.tipos['02'], 'ESP32')
})
