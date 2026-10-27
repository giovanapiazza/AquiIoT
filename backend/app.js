const express = require('express')
const cors = require('cors')
const { HttpError, queryFilters } = require('./validation')

function createApp(repository) {
  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '32kb' }))
  app.use((req, res, next) => {
    if (req.method === 'POST' && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))) return next(new HttpError(400, 'Envie um objeto JSON.'))
    next()
  })
  app.get('/', (req, res) => res.json({ mensagem: 'API AquiIoT funcionando' }))
  app.get('/api/dispositivos', (req, res) => res.json(repository.listDevices()))
  app.get('/api/setores', (req, res) => res.json(repository.listSectors()))
  app.post('/api/setores', (req, res) => res.status(201).json(repository.createSector(req.body)))
  app.get('/api/eventos', (req, res) => res.json(repository.listEvents(queryFilters(req.query))))
  app.get('/api/eventos/sistema', (req, res) => res.json(repository.listEvents(queryFilters(req.query), true)))
  app.post('/api/eventos', (req, res) => res.status(201).json(repository.recordEvent(req.body)))
  app.get('/api/localizacoes', (req, res) => res.json(repository.listLocations(queryFilters(req.query))))
  app.post('/api/localizacao', (req, res) => res.status(201).json(repository.recordLocation(req.body)))
  app.get('/api/leituras', (req, res) => res.json(repository.listReadings(queryFilters(req.query))))
  app.post('/api/leituras', (req, res) => res.status(201).json(repository.recordReading(req.body)))
  app.get('/api/dispositivos/:id', (req, res) => {
    const device = repository.getDevice(req.params.id)
    if (!device) throw new HttpError(404, 'Dispositivo não encontrado.')
    res.json(device)
  })
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
    if (!/^\d+$/.test(req.params.id)) throw new HttpError(400, 'Identificador de setor inválido.')
    const sector = repository.listSectors().find(item => item.id === Number(req.params.id))
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
