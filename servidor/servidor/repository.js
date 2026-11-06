const { HttpError, text, number, sensors } = require('./validation')
const { decode, nomeLocal, tipos } = require('./identificacao')

// Sensores que aceitam regra de alerta. Áreas (ESP32) mandam temperatura,
// umidade, LDR e som; chaveiros mandam temperatura e luminosidade em lux.
const SENSORES = {
  temperatura: { nome: 'Temperatura', unidade: ' °C' },
  umidade: { nome: 'Umidade', unidade: '%' },
  luminosidade: { nome: 'Luminosidade', unidade: ' lx' },
  luminosidade_adc: { nome: 'Luminosidade (LDR)', unidade: '' },
  som: { nome: 'Som', unidade: '' },
}
// Valores de um evento leitura_setor (detalhes enviados pelo ESP32 da área)
function sectorValues(detalhes) {
  return { temperatura: detalhes.temperatura_c, umidade: detalhes.umidade_percentual, luminosidade_adc: detalhes.luminosidade_adc, som: detalhes.som_variacao }
}
const RESERVED_EVENTS = ['deteccao', 'movimentacao', 'leitura_ambiental', 'cadastro', 'saida', 'alerta_sensor', 'alerta_resolvido', 'exclusao']

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
      if (readings.temperatura !== null || readings.luminosidade !== null) {
        insertReading(dispositivo, readings, localizacaoId, now)
        evaluateAlerts(readings, { setorId: destination.id, dispositivo }, now)
      }
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
      evaluateAlerts(values, { setorId: location?.setor_id ?? null, dispositivo }, now)
      return { id: Number(reading.lastInsertRowid), dispositivo, ...values, data: iso(now) }
    })
  }
  function recordEvent(input) {
    const tipo = text(input.tipo, 'Tipo', { max: 80 })
    if (RESERVED_EVENTS.includes(tipo)) throw new HttpError(400, 'Tipo reservado ao registro de localização ou leitura.')
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
      // Sensores da área chegam como evento leitura_setor, com os valores em detalhes
      if (tipo === 'leitura_setor' && destination && input.detalhes) evaluateAlerts(sectorValues(input.detalhes), { setorId: destination.id }, now)
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

  // ---------------------------------------------------------------- alertas
  function ruleView(row) {
    return { id: row.id, sensor: row.sensor, operador: row.operador, limite: row.limite, setorId: row.setor_id, setor: row.setor_nome ?? null, nivel: row.nivel, ativa: row.ativa === 1, descricao: row.descricao, data: iso(row.criado_em) }
  }
  const RULE_SELECT = 'SELECT r.*, s.nome AS setor_nome FROM regras_alerta r LEFT JOIN setores s ON s.id = r.setor_id'
  function getRule(id) {
    const row = db.prepare(`${RULE_SELECT} WHERE r.id = ?`).get(id)
    if (!row) throw new HttpError(404, 'Regra de alerta não encontrada.')
    return row
  }
  function listAlertRules() { return db.prepare(`${RULE_SELECT} ORDER BY r.id`).all().map(ruleView) }
  // Campos ausentes mantêm o valor atual (`current`), para a edição parcial
  function ruleInput(input, current) {
    const pick = key => input[key] === undefined ? current?.[key] : input[key]
    const sensor = pick('sensor')
    if (!Object.hasOwn(SENSORES, sensor)) throw new HttpError(400, `Sensor deve ser um de: ${Object.keys(SENSORES).join(', ')}.`)
    const operador = pick('operador')
    if (!['maior', 'menor'].includes(operador)) throw new HttpError(400, 'Operador deve ser "maior" ou "menor".')
    const limite = number(pick('limite'), 'Limite')
    if (limite === null) throw new HttpError(400, 'Informe o limite.')
    const nivel = pick('nivel') ?? 'aviso'
    if (!['aviso', 'erro'].includes(nivel)) throw new HttpError(400, 'Nível deve ser "aviso" ou "erro".')
    const ativa = pick('ativa') ?? true
    if (typeof ativa !== 'boolean') throw new HttpError(400, 'Ativa deve ser verdadeiro ou falso.')
    const setorId = input.setorId === undefined ? current?.setorId ?? null : input.setorId
    if (setorId !== null && (!Number.isSafeInteger(setorId) || !db.prepare('SELECT id FROM setores WHERE id = ?').get(setorId))) throw new HttpError(404, 'Área não encontrada.')
    const descricao = input.descricao === undefined ? current?.descricao ?? null : text(input.descricao, 'Descrição', { optional: true, max: 200 })
    return { sensor, operador, limite, nivel, ativa, setorId, descricao }
  }
  function createAlertRule(input) {
    const r = ruleInput(input)
    return transaction(() => {
      const result = db.prepare('INSERT INTO regras_alerta (sensor, operador, limite, setor_id, nivel, ativa, descricao, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(r.sensor, r.operador, r.limite, r.setorId, r.nivel, r.ativa ? 1 : 0, r.descricao, clock())
      return ruleView(getRule(Number(result.lastInsertRowid)))
    })
  }
  function updateAlertRule(id, input) {
    return transaction(() => {
      const current = ruleView(getRule(id))
      const r = ruleInput(input, current)
      db.prepare('UPDATE regras_alerta SET sensor = ?, operador = ?, limite = ?, setor_id = ?, nivel = ?, ativa = ?, descricao = ? WHERE id = ?').run(r.sensor, r.operador, r.limite, r.setorId, r.nivel, r.ativa ? 1 : 0, r.descricao, id)
      // Com o limite ou o alcance mudados, os alertas abertos perdem o sentido:
      // a próxima leitura abre um novo, se ainda estiver fora do limite
      db.prepare('UPDATE alertas SET resolvido_em = ? WHERE regra_id = ? AND resolvido_em IS NULL').run(clock(), id)
      return ruleView(getRule(id))
    })
  }
  function deleteAlertRule(id) {
    return transaction(() => {
      getRule(id)
      db.prepare('DELETE FROM regras_alerta WHERE id = ?').run(id)
      return { id, excluida: true }
    })
  }
  const violates = (rule, value) => rule.operador === 'maior' ? value > rule.limite : value < rule.limite
  // Compara as leituras recebidas com as regras ativas. Abre um alerta quando a
  // origem passa do limite, atualiza o valor enquanto continua fora e encerra
  // quando volta. Roda dentro da transação de quem gravou a leitura.
  function evaluateAlerts(values, { setorId = null, dispositivo = null }, now) {
    const origem = dispositivo ? `dispositivo:${dispositivo}` : setorId !== null ? `setor:${setorId}` : null
    if (!origem) return
    for (const [sensor, value] of Object.entries(values)) {
      if (!Object.hasOwn(SENSORES, sensor) || typeof value !== 'number' || !Number.isFinite(value)) continue
      const rules = db.prepare('SELECT * FROM regras_alerta WHERE ativa = 1 AND sensor = ? AND (setor_id IS NULL OR setor_id = ?)').all(sensor, setorId)
      for (const rule of rules) {
        const open = db.prepare('SELECT id FROM alertas WHERE regra_id = ? AND origem = ? AND resolvido_em IS NULL').get(rule.id, origem)
        if (violates(rule, value)) {
          if (open) { db.prepare('UPDATE alertas SET valor_atual = ?, atualizado_em = ? WHERE id = ?').run(value, now, open.id); continue }
          const alerta = db.prepare('INSERT INTO alertas (regra_id, origem, setor_id, dispositivo_id, valor, valor_atual, iniciado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(rule.id, origem, setorId, dispositivo, value, value, now, now)
          const { nome, unidade } = SENSORES[sensor]
          insertEvent({ tipo: 'alerta_sensor', nivel: rule.nivel, mensagem: `${nome} ${rule.operador === 'maior' ? 'acima' : 'abaixo'} do limite: ${value}${unidade} (limite ${rule.limite}${unidade}).`, dispositivo, setorId, detalhes: { alerta: Number(alerta.lastInsertRowid), regra: rule.id, sensor, valor: value, limite: rule.limite } }, now)
        } else if (open) {
          db.prepare('UPDATE alertas SET resolvido_em = ?, valor_atual = ?, atualizado_em = ? WHERE id = ?').run(now, value, now, open.id)
          insertEvent({ tipo: 'alerta_resolvido', mensagem: `${SENSORES[sensor].nome} voltou ao normal: ${value}${SENSORES[sensor].unidade}.`, dispositivo, setorId, detalhes: { alerta: open.id, regra: rule.id, sensor, valor: value } }, now)
        }
      }
    }
  }
  function listAlerts({ estado = 'abertos', limite = 200 } = {}) {
    const where = estado === 'abertos' ? 'WHERE a.resolvido_em IS NULL' : ''
    return db.prepare(`SELECT a.*, r.sensor, r.operador, r.limite, r.nivel, s.nome AS setor, d.nome AS dispositivo_nome
      FROM alertas a JOIN regras_alerta r ON r.id = a.regra_id LEFT JOIN setores s ON s.id = a.setor_id LEFT JOIN dispositivos d ON d.id = a.dispositivo_id
      ${where} ORDER BY a.resolvido_em IS NOT NULL, a.iniciado_em DESC, a.id DESC LIMIT ?`).all(limite).map(row => ({
      id: row.id, regraId: row.regra_id, sensor: row.sensor, operador: row.operador, limite: row.limite, nivel: row.nivel,
      setor: row.setor, dispositivo: row.dispositivo_id, dispositivoNome: row.dispositivo_nome,
      valor: row.valor, valorAtual: row.valor_atual, inicio: iso(row.iniciado_em), atualizado: iso(row.atualizado_em),
      resolvido: iso(row.resolvido_em), reconhecido: iso(row.reconhecido_em), aberto: row.resolvido_em === null,
    }))
  }
  function acknowledgeAlert(id) {
    return transaction(() => {
      const result = db.prepare('UPDATE alertas SET reconhecido_em = coalesce(reconhecido_em, ?) WHERE id = ?').run(clock(), id)
      if (result.changes === 0) throw new HttpError(404, 'Alerta não encontrado.')
      return { id, reconhecido: true }
    })
  }

  // --------------------------------------------------------------- exclusão
  // O histórico usa ON DELETE RESTRICT; excluir apaga junto o que só faz
  // sentido com o item (detecções, leituras, eventos e alertas dele). Um
  // evento `exclusao` sem vínculo registra a operação.
  function deleteDevice(id) {
    return transaction(() => {
      const device = db.prepare('SELECT id, nome FROM dispositivos WHERE id = ?').get(id)
      if (!device) throw new HttpError(404, 'Dispositivo não encontrado.')
      const counts = {
        localizacoes: db.prepare('SELECT count(*) AS n FROM localizacoes WHERE dispositivo_id = ?').get(id).n,
        leituras: db.prepare('SELECT count(*) AS n FROM leituras_ambientais WHERE dispositivo_id = ?').get(id).n,
      }
      db.prepare('DELETE FROM eventos WHERE dispositivo_id = ? OR localizacao_id IN (SELECT id FROM localizacoes WHERE dispositivo_id = ?)').run(id, id)
      db.prepare('DELETE FROM leituras_ambientais WHERE dispositivo_id = ?').run(id)
      db.prepare('DELETE FROM localizacoes WHERE dispositivo_id = ?').run(id)
      db.prepare('DELETE FROM dispositivos WHERE id = ?').run(id)
      const now = clock()
      insertEvent({ tipo: 'exclusao', mensagem: `Chaveiro ${id}${device.nome ? ` (${device.nome})` : ''} excluído com o histórico.`, detalhes: { dispositivo: id, nome: device.nome, ...counts } }, now)
      return { id, excluido: true, ...counts }
    })
  }
  function deleteSector(id) {
    return transaction(() => {
      const sector = db.prepare('SELECT id, nome, codigo FROM setores WHERE id = ?').get(id)
      if (!sector) throw new HttpError(404, 'Setor não encontrado.')
      const locations = 'SELECT id FROM localizacoes WHERE setor_id = ?'
      const counts = { localizacoes: db.prepare('SELECT count(*) AS n FROM localizacoes WHERE setor_id = ?').get(id).n }
      // Eventos da área e saídas dela somem; movimentações vindas dela para
      // outra área ficam, sem a origem
      db.prepare(`DELETE FROM eventos WHERE setor_id = ? OR localizacao_id IN (${locations}) OR (tipo = 'saida' AND origem_setor_id = ?)`).run(id, id, id)
      db.prepare('UPDATE eventos SET origem_setor_id = NULL WHERE origem_setor_id = ?').run(id)
      // Leituras dos chaveiros continuam, só perdem o vínculo com a detecção
      db.prepare(`UPDATE leituras_ambientais SET localizacao_id = NULL WHERE localizacao_id IN (${locations})`).run(id)
      db.prepare('DELETE FROM localizacoes WHERE setor_id = ?').run(id)
      db.prepare('DELETE FROM receptores WHERE setor_id = ?').run(id)
      db.prepare('DELETE FROM setores WHERE id = ?').run(id)
      insertEvent({ tipo: 'exclusao', mensagem: `Área ${sector.nome} excluída com o histórico.`, detalhes: { setor: sector.nome, codigo: sector.codigo, ...counts } }, clock())
      return { id, excluido: true, ...counts }
    })
  }
  return { listSectors, createSector, deleteSector, deleteDevice, listAlertRules, createAlertRule, updateAlertRule, deleteAlertRule, listAlerts, acknowledgeAlert, listDevices: deviceRows, getDevice, saveDevice, recordLocation, recordDeparture, recordReading, recordEvent, listLocations, listEvents, listReadings, latestReadings }
}
module.exports = { createRepository, SENSORES }
