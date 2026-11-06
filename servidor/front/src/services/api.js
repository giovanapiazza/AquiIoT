// Sem VITE_API_URL a API é a da própria página: o Vite repassa /api ao backend
// (vite.config.js), inclusive na Raspberry pelo Tailscale Funnel
export const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

export async function getCollection(resource, signal) {
  const response = await fetch(`${API_URL}/api/${resource}`, {
    signal: signal || AbortSignal.timeout(8000),
  })
  if (!response.ok)
    throw new Error(`Falha ao consultar ${resource} (HTTP ${response.status}).`)
  const data = await response.json()
  if (!Array.isArray(data)) throw new Error(`Resposta inválida de ${resource}.`)
  return data
}
export async function testConnection() {
  await Promise.all(
    ['dispositivos', 'setores', 'eventos'].map((resource) =>
      getCollection(resource),
    ),
  )
}
// Cadastra ou renomeia um dispositivo (usado ao gravar um chaveiro)
export async function saveDevice(id, nome) {
  const response = await fetch(
    `${API_URL}/api/dispositivos/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome }),
      signal: AbortSignal.timeout(8000),
    },
  )
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.erro || `HTTP ${response.status}`)
  return data
}

// Cadastra a área e o ESP32 dela (200 = já estava cadastrado). Um 409 é
// conflito de verdade, como ESP32 já associado a outra área.
export async function registerSector(codigo, esp32) {
  const response = await fetch(`${API_URL}/api/setores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo, esp32 }),
    signal: AbortSignal.timeout(8000),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok)
    throw Object.assign(new Error(data.erro || `HTTP ${response.status}`), {
      status: response.status,
    })
  return data
}

// Nomes de plantas, setores, áreas e tipos do padrão PPSSAATTNN
export async function getIdentification() {
  const response = await fetch(`${API_URL}/api/identificacao`, {
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

// Requisição que altera dados; devolve o JSON ou lança o erro da API
async function send(method, path, body) {
  const response = await fetch(`${API_URL}/api/${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.erro || `HTTP ${response.status}`)
  return data
}

// Exclusão apaga junto o histórico do item (detecções, leituras e alertas)
export const deleteDevice = (id) =>
  send('DELETE', `dispositivos/${encodeURIComponent(id)}`)
export const deleteSector = (id) => send('DELETE', `setores/${id}`)

// Alertas por limite de sensor
export const createAlertRule = (rule) => send('POST', 'alertas/regras', rule)
export const updateAlertRule = (id, rule) =>
  send('PUT', `alertas/regras/${id}`, rule)
export const deleteAlertRule = (id) => send('DELETE', `alertas/regras/${id}`)
export const acknowledgeAlert = (id) =>
  send('POST', `alertas/${id}/reconhecer`)
