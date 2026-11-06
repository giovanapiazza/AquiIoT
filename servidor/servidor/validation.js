class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}
function text(value, field, { optional = false, max = 120 } = {}) {
  if (optional && (value === undefined || value === null)) return null
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new HttpError(400, `${field} deve ser um texto de 1 a ${max} caracteres.`)
  return value.trim()
}
function number(value, field, { min = -Infinity, max = Infinity, integer = false } = {}) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw new HttpError(400, `${field} inválido.`)
  return value
}
function sensors(input) {
  return {
    temperatura: number(input.temperatura, 'Temperatura'),
    luminosidade: number(input.luminosidade, 'Luminosidade', { min: 0 }),
  }
}
function queryFilters(query) {
  const result = {}
  for (const field of ['dispositivo', 'setor', 'tipo']) if (query[field] !== undefined) result[field] = text(query[field], field)
  for (const field of ['inicio', 'fim']) {
    if (query[field] !== undefined) {
      const value = query[field]
      // A zona é obrigatória para eliminar ambiguidade entre clientes e a Raspberry Pi.
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new HttpError(400, `${field} deve ser uma data ISO 8601 com fuso horário.`)
      const [year, month, day] = value.slice(0, 10).split('-').map(Number)
      const calendar = new Date(0)
      calendar.setUTCFullYear(year, month - 1, day)
      if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day || Number(value.slice(11, 13)) > 23) throw new HttpError(400, `${field} contém uma data inválida.`)
      result[field] = Date.parse(value)
    }
  }
  if (result.inicio !== undefined && result.fim !== undefined && result.inicio > result.fim) throw new HttpError(400, 'inicio deve ser anterior ou igual a fim.')
  for (const [field, fallback, min, max] of [['limite', 1000, 1, 10000], ['offset', 0, 0, Number.MAX_SAFE_INTEGER]]) {
    const raw = query[field]
    const value = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : raw === undefined ? fallback : NaN
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new HttpError(400, `${field} inválido (entre ${min} e ${max}).`)
    result[field] = value
  }
  return result
}
module.exports = { HttpError, text, number, sensors, queryFilters }
