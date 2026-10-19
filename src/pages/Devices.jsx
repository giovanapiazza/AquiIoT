import { useState } from 'react'
import {
  DeviceTable,
  Details,
  Modal,
  Search,
  SectorFilter,
} from '../components/DataUI'
export default function Devices({ dispositivos, setores }) {
  const [search, setSearch] = useState('')
  const [sector, setSector] = useState('')
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState(null)
  const devices = dispositivos.filter(
    (d) =>
      `${d.nome || ''} ${d.id}`.toLowerCase().includes(search.toLowerCase()) &&
      (!sector || d.setor === sector) &&
      (!status || d.status === status),
  )
  return (
    <>
      <div className="summary-stats">
        {[
          ['total', dispositivos.length],
          ['online', dispositivos.filter((d) => d.status === 'online').length],
          [
            'offline',
            dispositivos.filter((d) => d.status === 'offline').length,
          ],
        ].map(([label, count]) => (
          <div key={label}>
            <strong>{count}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="filters">
        <Search
          value={search}
          onChange={setSearch}
          label="Buscar nome ou identificador"
        />
        <SectorFilter
          values={[
            ...new Set(
              [
                ...setores.map((s) => s.nome),
                ...dispositivos.map((d) => d.setor),
              ].filter(Boolean),
            ),
          ]}
          value={sector}
          onChange={setSector}
        />
        <label className="filter-field">
          <span>Status</span>
          <select
            aria-label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Todos</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
          </select>
        </label>
      </div>
      <DeviceTable devices={devices} onSelect={setSelected} />
      {selected && (
        <Modal
          title="Detalhes do dispositivo"
          onClose={() => setSelected(null)}
        >
          <Details
            data={dispositivos.find((d) => d.id === selected.id) || selected}
          />
        </Modal>
      )}
    </>
  )
}
