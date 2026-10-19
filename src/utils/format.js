export const display = (value) =>
  value === undefined || value === null || value === '' ? '—' : String(value)
export const signal = (value) => (value == null ? '—' : `${value} dBm`)
