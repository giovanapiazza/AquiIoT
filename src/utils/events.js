// O setor manda uma detecção a cada ~10 s enquanto o chaveiro está na área.
// Para o histórico ser legível, detecções seguidas do mesmo chaveiro na mesma
// área viram uma única permanência ("esteve na Ala B das 15:45 às 15:50").
const GAP_MS = 3 * 60 * 1000

const time = (event) => Date.parse(event.data)

export function visits(eventos) {
  const sorted = eventos
    .filter((e) => e.data && !Number.isNaN(time(e)))
    .toSorted((a, b) => time(a) - time(b) || a.id - b.id)
  const open = new Map() // permanência aberta por chaveiro
  const result = []
  for (const event of sorted) {
    const device = event.dispositivo
    const current = open.get(device)
    // Área PPSSAA de quem informou: detecção traz o código completo; a saída,
    // nos detalhes
    const local = (event.codigo || event.detalhes?.codigo)?.slice(0, 6) ?? null
    // Saída atrasada de uma área que o chaveiro já deixou (gravada antes de o
    // backend passar a recusá-las): não encerra a permanência atual
    if (event.tipo === 'saida' && current?.local && local && current.local !== local)
      continue
    if (event.tipo === 'saida') {
      open.delete(device)
      result.push({
        key: `s${event.id}`,
        kind: 'saida',
        dispositivo: device,
        setor: event.origem || event.setor,
        inicio: event.data,
        fim: event.data,
        eventos: [event],
      })
      continue
    }
    const setor = event.destino || event.setor
    const continues =
      current &&
      current.setor === setor &&
      time(event) - Date.parse(current.fim) <= GAP_MS
    if (continues) {
      current.fim = event.data
      current.eventos.push(event)
      if (event.rssi != null) current.rssi = event.rssi
      continue
    }
    const visit = {
      key: `v${event.id}`,
      kind: 'permanencia',
      dispositivo: device,
      setor,
      origem: current?.setor && current.setor !== setor ? current.setor : null,
      local,
      inicio: event.data,
      fim: event.data,
      rssi: event.rssi,
      eventos: [event],
    }
    open.set(device, visit)
    result.push(visit)
  }
  return result.reverse()
}

// Última leitura de sensores de cada área, pelo nome da área
export function latestReadings(leituras) {
  const result = new Map()
  for (const e of leituras) {
    if (!e.setor || result.has(e.setor) || !e.detalhes) continue
    result.set(e.setor, {
      data: e.data,
      temperatura: e.detalhes.temperatura_c ?? null,
      umidade: e.detalhes.umidade_percentual ?? null,
    })
  }
  return result
}
