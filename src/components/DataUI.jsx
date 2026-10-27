import { display, signal } from '../utils/format'
import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

export function Status({ value }) {
  return (
    <span className="table-status">
      <span
        className={`status-dot ${value === 'online' ? 'online' : value === 'offline' ? 'offline' : ''}`}
      />
      {value === 'online' ? 'Online' : value === 'offline' ? 'Offline' : '—'}
    </span>
  )
}
export function Search({ value, onChange, label }) {
  return (
    <label className="filter-field">
      <span>{label}</span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label}
      />
    </label>
  )
}
export function SectorFilter({ values, value, onChange }) {
  return (
    <label className="filter-field">
      <span>Setor</span>
      <select
        aria-label="Setor"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Todos os setores</option>
        {values.map((item) => (
          <option key={item}>{item}</option>
        ))}
      </select>
    </label>
  )
}
export function Modal({ title, children, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    const dialog = ref.current
    dialog.showModal()
    return () => {
      dialog.close()
      previous?.focus()
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className="detail-dialog"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      aria-labelledby="dialog-title"
    >
      <div className="dialog-heading">
        <h2 id="dialog-title">{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Fechar">
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  )
}
export function Details({ data }) {
  return (
    <dl className="details-list">
      {Object.entries(data).map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>
            {display(
              typeof value === 'object' && value !== null
                ? JSON.stringify(value)
                : value,
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}
export function DeviceTable({ devices, onSelect }) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            {[
              'Dispositivo',
              'Setor atual',
              'Status',
              'RSSI',
              'Última atualização',
            ].map((title) => (
              <th key={title}>{title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {devices.map((device) => (
            <tr key={device.id}>
              <td>
                <button
                  className="text-button"
                  onClick={() => onSelect(device)}
                >
                  {device.nome || device.id}
                </button>
                {device.nome && <small>{device.id}</small>}
              </td>
              <td>{display(device.setor)}</td>
              <td>
                <Status value={device.status} />
              </td>
              <td>{signal(device.rssi)}</td>
              <td>{display(device.ultimaAtualizacao)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!devices.length && (
        <p className="table-empty">Nenhum dispositivo encontrado.</p>
      )}
    </div>
  )
}
