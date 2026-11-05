// O backend nomeia cada área como "Planta · Setor · Área" (ver
// backend/identificacao.js). A interface mostra a área em destaque e o
// caminho acima dela.
export function place(nome) {
  const parts = String(nome || '').split(' · ').filter(Boolean)
  if (parts.length < 2) return { area: nome || '—', setor: '', planta: '', path: '' }
  const area = parts.at(-1)
  const setor = parts.at(-2)
  const planta = parts.length > 2 ? parts[0] : ''
  return { area, setor, planta, path: [planta, setor].filter(Boolean).join(' › ') }
}

// Nome curto para frases: "Ala B" ou, se só houver um nível, o nome inteiro
export const areaName = (nome) => place(nome).area

// Agrupa áreas pelo caminho (planta › setor), mantendo a ordem de cadastro
export function groupByPath(setores) {
  const groups = new Map()
  for (const setor of setores) {
    const { path } = place(setor.nome)
    if (!groups.has(path)) groups.set(path, [])
    groups.get(path).push(setor)
  }
  return [...groups].map(([path, areas]) => ({ path, areas }))
}

// Nome de quem usa o chaveiro, ou o número dele
export const personName = (device, id) =>
  device?.nome || `Chaveiro ${device?.id || id || '—'}`
