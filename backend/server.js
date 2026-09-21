const express = require("express")
const cors = require("cors")

const app = express()
const PORT = 3000

app.use(cors())
app.use(express.json())

let dispositivos = [
  {
    id: "CHAVEIRO-001",
    setor: "Sala 01",
    status: "online",
    rssi: -48,
    ultimaAtualizacao: "16:45:10"
  },
  {
    id: "CHAVEIRO-002",
    setor: "Sala 01",
    status: "online",
    rssi: -52,
    ultimaAtualizacao: "16:44:32"
  },
  {
    id: "CHAVEIRO-003",
    setor: "Sala 02",
    status: "offline",
    rssi: null,
    ultimaAtualizacao: "16:30:15"
  }
]

const setores = [
  {
    id: 1,
    nome: "Sala 01",
    esp32: "ESP32-01"
  },
  {
    id: 2,
    nome: "Sala 02",
    esp32: "ESP32-02"
  }
]

let eventos = [
  {
    id: 1,
    dispositivo: "CHAVEIRO-001",
    setor: "Sala 01",
    horario: "16:45:10"
  },
  {
    id: 2,
    dispositivo: "CHAVEIRO-002",
    setor: "Sala 01",
    horario: "16:44:32"
  },
  {
    id: 3,
    dispositivo: "CHAVEIRO-003",
    setor: "Sala 02",
    horario: "16:30:15"
  }
]

app.get("/", (req, res) => {
  res.json({
    mensagem: "API AquiIoT funcionando"
  })
})

app.get("/api/dispositivos", (req, res) => {
  res.json(dispositivos)
})

app.get("/api/setores", (req, res) => {
  res.json(setores)
})

app.get("/api/eventos", (req, res) => {
  res.json(eventos)
})

app.post("/api/localizacao", (req, res) => {
  const { dispositivo, setor, rssi } = req.body

  if (!dispositivo || !setor) {
    return res.status(400).json({
      erro: "Dispositivo e setor são obrigatórios"
    })
  }

  const horario = new Date().toLocaleTimeString("pt-BR", {
    hour12: false
  })

  const dispositivoEncontrado = dispositivos.find(
    item => item.id === dispositivo
  )

  if (dispositivoEncontrado) {
    dispositivoEncontrado.setor = setor
    dispositivoEncontrado.status = "online"
    dispositivoEncontrado.rssi = rssi
    dispositivoEncontrado.ultimaAtualizacao = horario
  } else {
    dispositivos.push({
      id: dispositivo,
      setor: setor,
      status: "online",
      rssi: rssi,
      ultimaAtualizacao: horario
    })
  }

  const novoEvento = {
    id: Date.now(),
    dispositivo: dispositivo,
    setor: setor,
    horario: horario
  }

  eventos.unshift(novoEvento)

  console.log(
    `${dispositivo} detectado em ${setor} | RSSI: ${rssi}`
  )

  res.status(201).json({
    mensagem: "Localização registrada com sucesso",
    dispositivo: dispositivo,
    setor: setor,
    rssi: rssi
  })
})

app.listen(PORT, () => {
  console.log(`Servidor AquiIoT rodando na porta ${PORT}`)
})