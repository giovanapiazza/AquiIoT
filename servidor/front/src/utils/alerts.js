import { areaName, personName } from './places'

// Mesmos sensores de servidor/servidor/repository.js (SENSORES). Áreas (ESP32)
// medem temperatura, umidade, LDR e som; chaveiros, temperatura e lux.
export const SENSORS = {
  temperatura: { name: 'Temperatura', unit: ' °C', from: 'áreas e chaveiros' },
  umidade: { name: 'Umidade', unit: '%', from: 'áreas (DHT11)' },
  luminosidade_adc: { name: 'Luminosidade (LDR)', unit: '', from: 'áreas, valor do ADC de 0 a 4095' },
  som: { name: 'Som', unit: '', from: 'áreas, variação do microfone' },
  luminosidade: { name: 'Luminosidade (lux)', unit: ' lx', from: 'chaveiros' },
}

export const LEVELS = { aviso: 'Aviso', erro: 'Crítico' }

export const sensorName = (sensor) => SENSORS[sensor]?.name ?? sensor
export const formatValue = (sensor, value) =>
  `${Number(value).toLocaleString('pt-BR')}${SENSORS[sensor]?.unit ?? ''}`

// "acima de 30 °C"
export const condition = ({ sensor, operador, limite }) =>
  `${operador === 'maior' ? 'acima de' : 'abaixo de'} ${formatValue(sensor, limite)}`

// Quem passou do limite: o chaveiro (pessoa) ou a área
export function alertSource(alert, dispositivos = []) {
  if (alert.dispositivo) {
    const device = dispositivos.find((d) => d.id === alert.dispositivo)
    return personName(device ?? { nome: alert.dispositivoNome }, alert.dispositivo)
  }
  return alert.setor ? areaName(alert.setor) : 'Área excluída'
}

// Alertas abertos que ainda ninguém reconheceu: são os que chamam atenção
export const unseen = (alertas) => alertas.filter((a) => a.aberto && !a.reconhecido)
