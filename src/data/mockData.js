const dispositivos = [
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

const eventos = [
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

export { dispositivos, setores, eventos }