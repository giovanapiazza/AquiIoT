import { useState } from 'react'
import { Details, DeviceTable, Modal, Search } from '../components/DataUI'
export default function Sectors({ setores, dispositivos }) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [device, setDevice] = useState(null)
  const filtered = setores.filter((s) =>
    s.nome.toLowerCase().includes(search.toLowerCase()),
  )
  return (
    <>
      <div className="summary-stats">
        <div>
          <strong>{setores.length}</strong>
          <span>setores monitorados</span>
        </div>
      </div>
      <div className="filters">
        <Search value={search} onChange={setSearch} label="Buscar setor" />
      </div>
      <div className="sector-grid">
        {filtered.map((s) => {
          const devices = dispositivos.filter((d) => d.setor === s.nome)
          return (
            <button
              className="sector-block sector-select"
              key={s.id}
              onClick={() => setSelected(s)}
            >
              <div className="sector-heading">
                <div>
                  <h3>{s.nome}</h3>
                  <span>ESP32: {s.esp32 || '—'}</span>
                </div>
                <strong>{devices.length}</strong>
              </div>
              <p>{devices.length} dispositivos presentes</p>
              <div className="sector-counts">
                <span>
                  {devices.filter((d) => d.status === 'online').length} online
                </span>
                <span>
                  {devices.filter((d) => d.status === 'offline').length} offline
                </span>
              </div>
            </button>
          )
        })}
      </div>
      {!filtered.length && (
        <p className="table-empty">Nenhum setor encontrado.</p>
      )}
      {selected && (
        <Modal
          title={selected.nome}
          onClose={() => {
            setSelected(null)
            setDevice(null)
          }}
        >
          <Details data={selected} />
          <DeviceTable
            devices={dispositivos.filter((d) => d.setor === selected.nome)}
            onSelect={setDevice}
          />
          {device && (
            <>
              <h3>Dispositivo selecionado</h3>
              <Details
                data={dispositivos.find((d) => d.id === device.id) || device}
              />
            </>
          )}
        </Modal>
      )}
    </>
  )
}
