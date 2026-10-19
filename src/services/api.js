export const API_URL = (
  import.meta.env.VITE_API_URL || 'http://localhost:3000'
).replace(/\/$/, '')

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
