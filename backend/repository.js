const { HttpError, text, number, sensors } = require('./validation')
const { decode, nomeLocal, tipos } = require('./identificacao')

const iso = value => value == null ? null : new Date(value).toISOString()
const time = value => value == null ? null : new Date(value).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false })

function createRepository(db, { clock = Date.now, offlineAfterMs = 120000 } = {}) {
  if (!Number.isSafeInteger(offlineAfterMs) || offlineAfterMs <= 0) throw new Error('OFFLINE_AFTER_MS deve ser um inteiro positivo.')
  function transaction(action) {
    db.exec('BEGIN IMMEDIATE')
    try { const result = action(); db.exec('COMMIT'); return result } catch (error) { db.exec('ROLLBACK'); throw error }
  }
  function getSector(name) { return db.prepare('SELECT * FROM setores WHERE nome = ?').get(name) }
  function ensureSector(name, now) {
    db.prepare('INSERT INTO setores (nome, criado_em) VALUES (?, ?) ON CONFLICT(nome) DO NOTHING').run(name, now)
    return getSector(name)
  }
  // Setor da área PPSSAA; cria com o nome do cadastro central se ainda não existe
  function ensureArea(info, now) {
    const existing = getSectorByCode(info.local)
    if (existing) return existing
    const nome = nomeLocal(info)
    db.prepare('INSERT INTO setores (nome, codigo, criado_em) VALUES (?, ?, ?) ON CONFLICT(nome) DO UPDATE SET codigo = excluded.codigo WHERE codigo IS NULL').run(nome, info.local, now)
    const sector = getSector(nome)
    if (sector.codigo !== info.local) throw new HttpError(409, `O setor ${nome} já está associado a outro código.`)
    return sector
  }
  function latestLocation(device) {
    return db.prepare('SELECT * FROM localizacoes WHERE dispositivo_id = ? ORDER BY registrado_em DESC, id DESC LIMIT 1').get(device)
  }
  function requireDevice(id) {
    if (!db.prepare('SELECT id FROM dispositivos WHERE id = ?').get(id)) throw new HttpError(404, 'Dispositivo não encontrado.')
  }
  // Setor com seus receptores (ESP32); `esp32` é o primeiro, para clientes antigos
  function sectorView(row) {
    const receptores = db.prepare('SELECT id FROM receptores WHERE setor_id = ? ORDER BY criado_em, id').all(row.id).map(r => r.id)
    return { id: row.id, nome: row.nome, codigo: row.codigo, esp32: receptores[0] ?? null, receptores, descricao: row.descricao }
  }
  function listSectors() { return db.prepare('SELECT * FROM setores ORDER BY id').all().map(sectorView) }
  function getSectorByCode(codigo) { return db.prepare('SELECT * FROM setores WHERE codigo = ?').get(codigo) }
  function createSector(input) {
    // `codigo` (PPSSAA) identifica a área; sem `nome`, usa o nome do cadastro central
    const codigo = input.codigo === undefined || input.codigo === null ? null : input.codigo
    if (codigo !== null && (typeof codigo !== 'string' || !/^\d{6}$/.test(codigo))) throw new HttpError(400, 'Código do setor deve ter 6 dígitos (PPSSAA).')
    const nome = codigo !== null && input.nome === undefined ? getSectorByCode(codigo)?.nome ?? nomeLocal(decode(`${codigo}0000`)) : text(input.nome, 'Nome')
    const esp32 = text(input.esp32, 'ESP32', { optional: true })
    const descricao = text(input.descricao, 'Descrição', { optional: true, max: 1000 })
    // Configura também setores descobertos previamente por uma detecção real.
    // Cadastrar de novo o que já existe não é erro (o ESP32 se recadastra ao
    // ser regravado); `criado` diz se algo novo entrou no banco.
    return transaction(() => {
      const byCode = codigo === null ? null : getSectorByCode(codigo)
      const byName = getSector(nome)
      // Nome informado de um setor e código que já pertence a outro
      if (byCode && byName && byCode.id !== byName.id) throw new HttpError(409, 'Código já associado a outro setor.')
      const existing = byCode || byName
      if (existing && codigo !== null && existing.codigo !== null && existing.codigo !== codigo) throw new HttpError(409, 'Setor já associado a outro código.')
      const owner = esp32 ? db.prepare('SELECT setor_id FROM receptores WHERE id = ?').get(esp32) : null
      if (owner && owner.setor_id !== existing?.id) throw new HttpError(409, 'ESP32 já associado a outro setor.')
      const now = clock()
      if (existing) db.prepare('UPDATE setores SET descricao = coalesce(?, descricao), codigo = coalesce(codigo, ?) WHERE id = ?').run(descricao, codigo, existing.id)
      else db.prepare('INSERT INTO setores (nome, codigo, descricao, criado_em) VALUES (?, ?, ?, ?)').run(nome, codigo, descricao, now)
      const setor = existing ? getSector(existing.nome) : getSector(nome)
      const novoReceptor = Boolean(esp32 && !owner)
      if (novoReceptor) db.prepare('INSERT INTO receptores (id, setor_id, criado_em) VALUES (?, ?, ?)').run(esp32, setor.id, now)
      return { setor: sectorView(setor), criado: !existing || novoReceptor }
    })
  }
  function deviceRows(sector) {
    const now = clock()
    const rows = db.prepare(`SELECT d.id, d.nome, d.desconectado_em, s.nome AS setor, l.rssi, l.codigo, l.registrado_em
      FROM dispositivos d LEFT JOIN localizacoes l ON l.id = (
        SELECT id FROM localizacoes WHERE dispositivo_id = d.id ORDER BY registrado_em DESC, id DESC LIMIT 1
      ) LEFT JOIN setores s ON s.id = l.setor_id
      ${sector ? 'WHERE s.nome = ?' : ''} ORDER BY d.id`).all(...(sector ? [sector] : []))
    return rows.map(row => ({ id: row.id, nome: row.nome, setor: row.setor, status: row.registrado_em != null && now - row.registrado_em < offlineAfterMs && !(row.desconectado_em >= row.registrado_em) ? 'online' : 'offline', rssi: row.rssi, ultimaAtualizacao: time(row.registrado_em), data: iso(row.registrado_em), ...identification(row.id, row.codigo) }))
  }
  // Dispositivos no padrão TTNN mostram o tipo e o último código PPSSAATTNN recebido
  function identification(id, codigo) {
    const info = decode(codigo)
    if (info) return { codigo, tipo: info.tipo, numero: info.numero }
    if (/^\d{4}$/.test(id)) return { codigo: null, tipo: tipos[id.slice(0, 2)] ?? `Tipo ${id.slice(0, 2)}`, numero: id.slice(2) }
    return {}
  }
  function getDevice(id) { return deviceRows().find(device => device.id === id) }
  function insertEvent({ tipo, nivel = 'info', mensagem, dispositivo = null, setorId = null, origemId = null, localizacaoId = null, detalhes = null }, now) {
    return db.prepare(`INSERT INTO eventos (tipo, nivel, mensagem, dispositivo_id, setor_id, origem_setor_id, localizacao_id, detalhes, registrado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(tipo, nivel, mensagem, dispositivo, setorId, origemId, localizacaoId, detalhes === null ? null : JSON.stringify(detalhes), now)
  }
  function insertReading(dispositivo, values, locationId, now) {
    return db.prepare('INSERT INTO leituras_ambientais (dispositivo_id, localizacao_id, temperatura, luminosidade, registrado_em) VALUES (?, ?, ?, ?, ?)').run(dispositivo, locationId, values.temperatura, values.luminosidade, now)
  }
  function recordLocation(input) {
    // Com `codigo` (PPSSAATTNN), o dispositivo é o TTNN e o setor é a área PPSSAA
    const info = input.codigo === undefined ? null : decode(input.codigo)
    if (input.codigo !== undefined && !info) throw new HttpError(400, 'Código deve ter 10 dígitos (PPSSAATTNN).')
    const dispositivo = info ? info.no : text(input.dispositivo, 'Dispositivo')
    const setorNome = info ? null : text(input.setor, 'Setor')
    const esp32 = text(input.esp32, 'ESP32', { optional: true })
    // Nome do usuário gravado no chaveiro; atualiza o nome do dispositivo
    const nome = text(input.nome, 'Nome', { optional: true, max: 60 })
    const rssi = number(input.rssi, 'RSSI', { min: -127, max: 0, integer: true })
    const readings = sensors(input)
    return transaction(() => {
      const now = clock()
      db.prepare('INSERT INTO dispositivos (id, nome, criado_em) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET nome = coalesce(excluded.nome, nome)').run(dispositivo, nome, now)
      const destination = info ? ensureArea(info, now) : ensureSector(setorNome, now)
      // ESP32 ainda desconhecido vira receptor da área onde detectou
      if (esp32 && !db.prepare('SELECT id FROM receptores WHERE id = ?').get(esp32)) db.prepare('INSERT INTO receptores (id, setor_id, criado_em) VALUES (?, ?, ?)').run(esp32, destination.id, now)
      const previous = latestLocation(dispositivo)
      const location = db.prepare('INSERT INTO localizacoes (dispositivo_id, setor_id, rssi, codigo, registrado_em) VALUES (?, ?, ?, ?, ?)').run(dispositivo, destination.id, rssi, info?.codigo ?? null, now)
      const localizacaoId = Number(location.lastInsertRowid)
      const moved = previous && previous.setor_id !== destination.id
      insertEvent({ tipo: moved ? 'movimentacao' : 'deteccao', mensagem: moved ? 'Mudança de setor detectada.' : 'Dispositivo detectado no setor.', dispositivo, setorId: destination.id, origemId: previous?.setor_id ?? null, localizacaoId }, now)
      if (readings.temperatura !== null || readings.luminosidade !== null) insertReading(dispositivo, readings, localizacaoId, now)
      return { mensagem: 'Localização registrada com sucesso', dispositivo, nome, setor: destination.nome, rssi, id: localizacaoId, data: iso(now), ...(info && { identificacao: info }) }
    })
  }
  // Cadastro feito pela interface ao gravar um chaveiro, antes da primeira detecção
  function saveDevice(id, input) {
    const dispositivo = text(id, 'Dispositivo')
    const nome = text(input.nome, 'Nome', { max: 60 })
    return transaction(() => {
      const now = clock()
      const previous = db.prepare('SELECT nome FROM dispositivos WHERE id = ?').get(dispositivo)
      db.prepare('INSERT INTO dispositivos (id, nome, criado_em) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET nome = excluded.nome').run(dispositivo, nome, now)
      insertEvent({ tipo: 'cadastro', mensagem: previous ? `Dispositivo associado a ${nome} (antes: ${previous.nome ?? 'sem nome'}).` : `Dispositivo cadastrado para ${nome}.`, dispositivo }, now)
      return getDevice(dispositivo)
    })
  }
  // O ESP32 avisa que o chaveiro saiu da rede do setor
  function recordDeparture(input) {
    const info = input.codigo === undefined ? null : decode(input.codigo)
    if (input.codigo !== undefined && !info) throw new HttpError(400, 'Código deve ter 10 dígitos (PPSSAATTNN).')
    const dispositivo = info ? info.no : text(input.dispositivo, 'Dispositivo')
    return transaction(() => {
      requireDevice(dispositivo)
      const now = clock()
      const location = latestLocation(dispositivo)
      // Aviso atrasado: a área só percebe a saída ~15 s depois, e o chaveiro
      // pode já ter sido detectado em outra área. Nesse caso nada muda.
      if (info && location?.codigo && location.codigo.slice(0, 6) !== info.local) return { ...getDevice(dispositivo), ignorado: true }
      db.prepare('UPDATE dispositivos SET desconectado_em = ? WHERE id = ?').run(now, dispositivo)
      insertEvent({ tipo: 'saida', mensagem: 'Dispositivo saiu da rede do setor.', dispositivo, origemId: location?.setor_id ?? null, detalhes: info ? { codigo: info.codigo } : null }, now)
      return getDevice(dispositivo)
    })
  }
  function recordReading(input) {
    const dispositivo = text(input.dispositivo, 'Dispositivo')
    const values = sensors(input)
    if (values.temperatura === null && values.luminosidade === null) throw new HttpError(400, 'Informe temperatura ou luminosidade.')
    return transaction(() => {
      requireDevice(dispositivo)
      const now = clock()
      const location = latestLocation(dispositivo)
      const reading = insertReading(dispositivo, values, location?.id ?? null, now)
      insertEvent({ tipo: 'leitura_ambiental', mensagem: 'Leitura ambiental recebida.', dispositivo, setorId: location?.setor_id ?? null }, now)
      return { id: Number(reading.lastInsertRowid), dispositivo, ...values, data: iso(now) }
    })
  }
  function recordEvent(input) {
    const tipo = text(input.tipo, 'Tipo', { max: 80 })
    if (['deteccao', 'movimentacao', 'leitura_ambiental', 'cadastro', 'saida'].includes(tipo)) throw new HttpError(400, 'Tipo reservado ao registro de localização ou leitura.')
    const nivel = input.nivel === undefined ? 'info' : input.nivel
    if (!['info', 'aviso', 'erro'].includes(nivel)) throw new HttpError(400, 'Nível inválido.')
    const mensagem = text(input.mensagem, 'Mensagem', { max: 2000 })
    const dispositivo = text(input.dispositivo, 'Dispositivo', { optional: true })
    const setor = text(input.setor, 'Setor', { optional: true })
    if (input.detalhes != null && (typeof input.detalhes !== 'object' || Array.isArray(input.detalhes))) throw new HttpError(400, 'Detalhes deve ser um objeto JSON.')
    return transaction(() => {
      if (dispositivo) requireDevice(dispositivo)
      // O ESP32 no padrão PPSSAATTNN informa o setor pelo código PPSSAA
      const destination = setor ? getSector(setor) ?? (/^\d{6}$/.test(setor) ? getSectorByCode(setor) : undefined) : null
      if (setor && !destination) throw new HttpError(404, 'Setor não encontrado.')
      const now = clock()
      const event = insertEvent({ tipo, nivel, mensagem, dispositivo, setorId: destination?.id ?? null, detalhes: input.detalhes ?? null }, now)
      return { id: Number(event.lastInsertRowid), tipo, nivel, mensagem, dispositivo, setor, data: iso(now) }
    })
  }
  function filteredQuery(select, filters, columns, base = '1 = 1') {
    const clauses = [base], values = []
    for (const key of ['dispositivo', 'setor', 'tipo']) {
      if (filters[key] !== undefined && columns[key]) { clauses.push(`${columns[key]} = ?`); values.push(filters[key]) }
    }
    for (const [key, operator] of [['inicio', '>='], ['fim', '<=']]) {
      if (filters[key] !== undefined) { clauses.push(`${columns.data} ${operator} ?`); values.push(filters[key]) }
    }
    return db.prepare(`${select} WHERE ${clauses.join(' AND ')} ORDER BY ${columns.data} DESC, ${columns.id} DESC LIMIT ? OFFSET ?`).all(...values, filters.limite ?? 1000, filters.offset ?? 0)
  }
  function listLocations(filters = {}) {
    return filteredQuery(`SELECT l.id, l.dispositivo_id AS dispositivo, s.nome AS setor, l.rssi, l.codigo, l.registrado_em FROM localizacoes l JOIN setores s ON s.id = l.setor_id`, filters, { dispositivo: 'l.dispositivo_id', setor: 's.nome', data: 'l.registrado_em', id: 'l.id' }).map(row => ({ id: row.id, dispositivo: row.dispositivo, setor: row.setor, rssi: row.rssi, codigo: row.codigo, data: iso(row.registrado_em), horario: time(row.registrado_em) }))
  }
  function listEvents(filters = {}, system = false) {
    return filteredQuery(`SELECT e.*, s.nome AS setor, o.nome AS origem, l.rssi, l.codigo FROM eventos e LEFT JOIN setores s ON s.id = e.setor_id LEFT JOIN setores o ON o.id = e.origem_setor_id LEFT JOIN localizacoes l ON l.id = e.localizacao_id`, filters, { dispositivo: 'e.dispositivo_id', setor: 's.nome', tipo: 'e.tipo', data: 'e.registrado_em', id: 'e.id' }, system ? '1 = 1' : "((e.tipo IN ('deteccao', 'movimentacao') AND e.localizacao_id IS NOT NULL) OR e.tipo = 'saida')").map(row => ({ id: row.id, dispositivo: row.dispositivo_id, setor: row.setor, horario: time(row.registrado_em), origem: row.origem, destino: row.setor, rssi: row.rssi, codigo: row.codigo, data: iso(row.registrado_em), tipo: row.tipo, nivel: row.nivel, mensagem: row.mensagem, detalhes: row.detalhes === null ? null : JSON.parse(row.detalhes) }))
  }
  function listReadings(filters = {}) {
    return filteredQuery(`SELECT a.*, s.nome AS setor FROM leituras_ambientais a LEFT JOIN localizacoes l ON l.id = a.localizacao_id LEFT JOIN setores s ON s.id = l.setor_id`, filters, { dispositivo: 'a.dispositivo_id', setor: 's.nome', data: 'a.registrado_em', id: 'a.id' }).map(row => ({ id: row.id, dispositivo: row.dispositivo_id, localizacaoId: row.localizacao_id, setor: row.setor, temperatura: row.temperatura, luminosidade: row.luminosidade, data: iso(row.registrado_em) }))
  }
  function latestReadings(id) {
    requireDevice(id)
    const result = { dispositivo: id }
    for (const field of ['temperatura', 'luminosidade']) {
      const row = db.prepare(`SELECT ${field} AS valor, registrado_em FROM leituras_ambientais WHERE dispositivo_id = ? AND ${field} IS NOT NULL ORDER BY registrado_em DESC, id DESC LIMIT 1`).get(id)
      result[field] = row ? { valor: row.valor, data: iso(row.registrado_em) } : null
    }
    return result
  }
  return { listSectors, createSector, listDevices: deviceRows, getDevice, saveDevice, recordLocation, recordDeparture, recordReading, recordEvent, listLocations, listEvents, listReadings, latestReadings }
}
module.exports = { createRepository }
