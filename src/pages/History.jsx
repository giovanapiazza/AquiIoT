import { useMemo, useState } from 'react'
import { PageHeader } from '../components/Shell'
import { Empty, Search, SelectField } from '../components/DataUI'
import { VisitList } from '../components/Visits'
import DeviceSheet from '../components/DeviceSheet'
import { dayTitle, eventDay, plural } from '../utils/format'
import { areaName, personName } from '../utils/places'
import { visits } from '../utils/events'

export default function History({ eventos, dispositivos, setores }) {
  const [search, setSearch] = useState('')
  const [area, setArea] = useState('')
  const [day, setDay] = useState('')
  const [selected, setSelected] = useState(null)
  const byId = new Map(dispositivos.map((d) => [d.id, d]))
  const term = search.trim().toLowerCase()

  const all = useMemo(() => visits(eventos), [eventos])
  const filtered = all.filter(
    (v) =>
      `${personName(byId.get(v.dispositivo), v.dispositivo)} ${v.dispositivo}`
        .toLowerCase()
        .includes(term) &&
      (!area || v.setor === area || v.origem === area) &&
      (!day || eventDay(v.inicio) === day),
  )
  // Agrupa por dia, do mais recente ao mais antigo
  const days = []
  for (const visit of filtered) {
    const key = eventDay(visit.inicio)
    if (days.at(-1)?.key !== key) days.push({ key, visits: [] })
    days.at(-1).visits.push(visit)
  }
  const areas = [
    ...new Set([...setores.map((s) => s.nome), ...all.map((v) => v.setor)].filter(Boolean)),
  ]
  const filtering = term || area || day
  const device = selected && dispositivos.find((d) => d.id === selected)

  return (
    <>
      <PageHeader title="Histórico">
        Por onde cada chaveiro passou. Detecções seguidas na mesma área aparecem
        como uma só permanência.
      </PageHeader>

      <div className="toolbar">
        <Search value={search} onChange={setSearch} label="Buscar pessoa ou chaveiro" />
        <SelectField label="Área" value={area} onChange={setArea}>
          <option value="">Todas</option>
          {areas.map((nome) => (
            <option key={nome} value={nome}>
              {areaName(nome)}
            </option>
          ))}
        </SelectField>
        <label className="field field-inline">
          <span>Dia</span>
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </label>
        {filtering && (
          <button
            className="button button-quiet"
            onClick={() => {
              setSearch('')
              setArea('')
              setDay('')
            }}
          >
            Limpar filtros
          </button>
        )}
      </div>

      {all.length === 0 ? (
        <Empty title="Nenhuma movimentação registrada">
          O histórico começa quando uma área detecta o primeiro chaveiro.
        </Empty>
      ) : days.length === 0 ? (
        <Empty title="Nada encontrado com esses filtros">
          Tente outro dia ou limpe os filtros.
        </Empty>
      ) : (
        days.map(({ key, visits: list }) => (
          <section className="day" key={key} aria-labelledby={`dia-${key}`}>
            <h2 id={`dia-${key}`} className="day-title">
              {dayTitle(key)}
              <span>{plural(list.length, 'registro', 'registros')}</span>
            </h2>
            <VisitList visits={list} devices={dispositivos} onSelect={setSelected} />
          </section>
        ))
      )}

      {device && (
        <DeviceSheet device={device} eventos={eventos} onClose={() => setSelected(null)} />
      )}
    </>
  )
}
