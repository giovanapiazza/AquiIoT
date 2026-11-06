const express = require('express')
const cors = require('cors')
const { HttpError, queryFilters } = require('./validation')
const { plantas, tipos } = require('./identificacao')

function numericId(value, name) {
  if (!/^\d{1,15}$/.test(value)) throw new HttpError(400, `Identificador de ${name} inválido.`)
  return Number(value)
}

function createApp(repository) {
  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '32kb' }))
  app.use((req, res, next) => {
    if (['POST', 'PUT'].includes(req.method) && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))) return next(new HttpError(400, 'Envie um objeto JSON.'))
    next()
  })
  app.get('/', (req, res) => res.json({ mensagem: 'API AquiIoT funcionando' }))
  // Cadastro central de nomes do padrão PPSSAATTNN, para as listas da interface
  app.get('/api/identificacao', (req, res) => res.json({ plantas, tipos }))
  app.get('/api/dispositivos', (req, res) => res.json(repository.listDevices()))
  app.get('/api/setores', (req, res) => res.json(repository.listSectors()))
  app.post('/api/setores', (req, res) => {
    const { setor, criado } = repository.createSector(req.body)
    res.status(criado ? 201 : 200).json(setor)
  })
  app.delete('/api/setores/:id', (req, res) => res.json(repository.deleteSector(numericId(req.params.id, 'setor'))))
  // Alertas: regras por limite de sensor e os alertas que elas geram
  app.get('/api/alertas/regras', (req, res) => res.json(repository.listAlertRules()))
  app.post('/api/alertas/regras', (req, res) => res.status(201).json(repository.createAlertRule(req.body)))
  app.put('/api/alertas/regras/:id', (req, res) => res.json(repository.updateAlertRule(numericId(req.params.id, 'regra'), req.body)))
  app.delete('/api/alertas/regras/:id', (req, res) => res.json(repository.deleteAlertRule(numericId(req.params.id, 'regra'))))
  app.get('/api/alertas', (req, res) => {
    const estado = req.query.estado ?? 'abertos'
    if (!['abertos', 'todos'].includes(estado)) throw new HttpError(400, 'estado deve ser "abertos" ou "todos".')
    res.json(repository.listAlerts({ estado, limite: queryFilters({ limite: req.query.limite ?? '200' }).limite }))
  })
  app.post('/api/alertas/:id/reconhecer', (req, res) => res.json(repository.acknowledgeAlert(numericId(req.params.id, 'alerta'))))
  app.get('/api/eventos', (req, res) => res.json(repository.listEvents(queryFilters(req.query))))
  app.get('/api/eventos/sistema', (req, res) => res.json(repository.listEvents(queryFilters(req.query), true)))
  app.post('/api/eventos', (req, res) => res.status(201).json(repository.recordEvent(req.body)))
  app.get('/api/localizacoes', (req, res) => res.json(repository.listLocations(queryFilters(req.query))))
  app.post('/api/localizacao', (req, res) => res.status(201).json(repository.recordLocation(req.body)))
  app.post('/api/saida', (req, res) => res.json(repository.recordDeparture(req.body)))
  app.get('/api/leituras', (req, res) => res.json(repository.listReadings(queryFilters(req.query))))
  app.post('/api/leituras', (req, res) => res.status(201).json(repository.recordReading(req.body)))
  app.get('/api/dispositivos/:id', (req, res) => {
    const device = repository.getDevice(req.params.id)
    if (!device) throw new HttpError(404, 'Dispositivo não encontrado.')
    res.json(device)
  })
  app.put('/api/dispositivos/:id', (req, res) => res.json(repository.saveDevice(req.params.id, req.body)))
  app.delete('/api/dispositivos/:id', (req, res) => res.json(repository.deleteDevice(req.params.id)))
  app.get('/api/dispositivos/:id/localizacao', (req, res) => {
    const device = repository.getDevice(req.params.id)
    if (!device) throw new HttpError(404, 'Dispositivo não encontrado.')
    res.json(device)
  })
  app.get('/api/dispositivos/:id/historico', (req, res) => {
    if (!repository.getDevice(req.params.id)) throw new HttpError(404, 'Dispositivo não encontrado.')
    res.json(repository.listLocations({ ...queryFilters(req.query), dispositivo: req.params.id }))
  })
  app.get('/api/dispositivos/:id/leituras/ultima', (req, res) => res.json(repository.latestReadings(req.params.id)))
  app.get('/api/setores/:id/dispositivos', (req, res) => {
    const sector = repository.listSectors().find(item => item.id === numericId(req.params.id, 'setor'))
    if (!sector) throw new HttpError(404, 'Setor não encontrado.')
    res.json(repository.listDevices(sector.nome))
  })
  app.use((req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }))
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error)
    if (error.status && error.status >= 400 && error.status < 500) return res.status(error.status).json({ erro: error instanceof HttpError ? error.message : 'Requisição inválida.' })
    console.error('Erro ao acessar o banco de dados:', error)
    res.status(500).json({ erro: 'Não foi possível concluir a operação no banco de dados.' })
  })
  return app
}
module.exports = { createApp }
