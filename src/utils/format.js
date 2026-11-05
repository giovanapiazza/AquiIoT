export const display = (value) =>
  value === undefined || value === null || value === '' ? '—' : String(value)
export const signal = (value) => (value == null ? '—' : `${value} dBm`)

// A API armazena UTC; a interface usa o mesmo fuso dos horários legados.
const TZ = 'America/Sao_Paulo'
const dateInSaoPaulo = new Intl.DateTimeFormat('sv-SE', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
})
export const eventDay = value => dateInSaoPaulo.format(new Date(value))
export const eventDateTime = value => new Date(value).toLocaleString('pt-BR', { timeZone: TZ })
export const clock = value =>
  new Date(value).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })

// "agora mesmo", "há 12 s", "há 5 min", "há 3 h", "ontem", "há 8 dias".
// Trunca em vez de arredondar (59 min é "há 59 min", não "há 1 h"); a partir
// de 24 h conta dias do calendário, como os títulos do histórico.
export function ago(value, now = Date.now()) {
  if (!value) return null
  const seconds = Math.max(0, Math.floor((now - new Date(value)) / 1000))
  if (seconds < 5) return 'agora mesmo'
  if (seconds < 60) return `há ${seconds} s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  const days = Math.round(
    (Date.parse(eventDay(now)) - Date.parse(eventDay(value))) / 86400000,
  )
  return days <= 1 ? 'ontem' : `há ${days} dias`
}

// Título de um dia no histórico: "Hoje", "Ontem" ou "terça, 28 de outubro"
export function dayTitle(day, now = Date.now()) {
  const today = eventDay(now)
  const yesterday = eventDay(now - 86400000)
  if (day === today) return 'Hoje'
  if (day === yesterday) return 'Ontem'
  return new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

// Força do sinal em 3 níveis, para as barrinhas
export function signalLevel(rssi) {
  if (rssi == null) return 0
  if (rssi >= -55) return 3
  if (rssi >= -70) return 2
  return 1
}
export const signalWord = ['sem leitura', 'fraco', 'médio', 'forte']

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
export { plural }
