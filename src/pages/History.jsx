import { display, signal } from '../utils/format'
import { useState } from 'react'
import { Details, Modal, Search, SectorFilter } from '../components/DataUI'
// Horários sem data não permitem inferir o dia: a ordem da API é preservada nesse caso.
function fullDate(event) {
  const value = event.data || event.timestamp || event.dataHora
  return typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}/.test(value) &&
    !Number.isNaN(Date.parse(value))
    ? value
    : null
}
export default function History({ eventos }) {
  const [search, setSearch] = useState('')
  const [sector, setSector] = useState('')
  const [date, setDate] = useState('')
  const [selected, setSelected] = useState(null)
  const dated = eventos.length > 0 && eventos.every((e) => fullDate(e))
  const filtered = eventos.filter(
    (e) =>
      String(e.dispositivo || '')
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (!sector || [e.origem, e.destino, e.setor].includes(sector)) &&
      (!dated || !date || fullDate(e).slice(0, 10) === date),
  )
  if (dated)
    filtered.sort((a, b) => Date.parse(fullDate(b)) - Date.parse(fullDate(a)))
  return (
    <>
      <div className="filters">
        <Search
          value={search}
          onChange={setSearch}
          label="Buscar dispositivo"
        />
        <SectorFilter
          values={[
            ...new Set(
              eventos
                .flatMap((e) => [e.origem, e.destino, e.setor])
                .filter(Boolean),
            ),
          ]}
          value={sector}
          onChange={setSector}
        />
        <label className="filter-field">
          <span>Data</span>
          <input
            type="date"
            disabled={!dated}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      </div>
      <p className="muted">
        {filtered.length} de {eventos.length} registros
      </p>
      {!dated && (
        <p className="muted">
          A API não fornece data completa para todos os registros. Filtro de
          data indisponível; registros na ordem de recebimento, com os mais
          recentes primeiro.
        </p>
      )}
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {['Horário', 'Dispositivo', 'Origem', 'Destino', 'RSSI'].map(
                (h) => (
                  <th key={h}>{h}</th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.map((e, i) => (
              <tr key={e.id ?? i}>
                <td>{display(fullDate(e) || e.horario)}</td>
                <td>
                  <button
                    className="text-button"
                    onClick={() => setSelected(e)}
                  >
                    {display(e.dispositivo)}
                  </button>
                </td>
                <td>{display(e.origem)}</td>
                <td>{display(e.destino || e.setor)}</td>
                <td>{signal(e.rssi)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <p className="table-empty">Nenhum registro encontrado.</p>
        )}
      </div>
      {selected && (
        <Modal title="Detalhes do registro" onClose={() => setSelected(null)}>
          <Details data={selected} />
        </Modal>
      )}
    </>
  )
}
