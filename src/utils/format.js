export const display = (value) =>
  value === undefined || value === null || value === '' ? '—' : String(value)
export const signal = (value) => (value == null ? '—' : `${value} dBm`)

// A API armazena UTC; a interface usa o mesmo fuso dos horários legados.
const dateInSaoPaulo = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
})
export const eventDay = value => dateInSaoPaulo.format(new Date(value))
export const eventDateTime = value => new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
