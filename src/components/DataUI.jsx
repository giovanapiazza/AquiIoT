import { useEffect, useRef } from 'react'
import { Search as SearchIcon, X } from 'lucide-react'
import { signalLevel, signalWord } from '../utils/format'

// Janela modal. `side` abre como painel lateral (detalhes de um item).
export function Modal({ title, subtitle, children, onClose, side = false }) {
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
      className={side ? 'dialog dialog-side' : 'dialog'}
      onCancel={(e) => {
        // Quem fecha é o React (desmontando); assim o onClose pode recusar
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      aria-labelledby="dialog-title"
    >
      <div className="dialog-body">
        <header className="dialog-heading">
          <div>
            <h2 id="dialog-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar">
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  )
}

// Rótulo e valor; esconde campos vazios
export function Fields({ items }) {
  return (
    <dl className="fields">
      {items
        .filter(([, value]) => value || value === 0)
        .map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
    </dl>
  )
}

export function Presence({ online, children }) {
  return (
    <span className={`presence ${online ? 'is-here' : 'is-away'}`}>
      <span className="presence-dot" aria-hidden="true" />
      {children ?? (online ? 'Presente' : 'Fora de alcance')}
    </span>
  )
}

export function SignalBars({ rssi }) {
  const level = signalLevel(rssi)
  const label =
    rssi == null ? 'Sinal sem leitura' : `Sinal ${signalWord[level]}, ${rssi} dBm`
  return (
    <span className="signal" data-level={level} role="img" aria-label={label} title={label}>
      <i />
      <i />
      <i />
    </span>
  )
}

export function Search({ value, onChange, label, placeholder }) {
  return (
    <label className="search">
      <span className="visually-hidden">{label}</span>
      <SearchIcon size={16} aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || label}
      />
    </label>
  )
}

// Escolha única entre poucas opções, sempre visíveis
export function Segmented({ label, value, onChange, options }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([id, text]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          onClick={() => onChange(id)}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

export function SelectField({ label, value, onChange, children }) {
  return (
    <label className="field field-inline">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </label>
  )
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  )
}
