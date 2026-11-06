import { useEffect, useRef, useState } from 'react'
import { Search as SearchIcon, Trash2, X } from 'lucide-react'
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

// Ação destrutiva no fim de um painel: confirma, executa e mostra o erro
export function DangerZone({ label, warning, confirmText, onConfirm }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function run() {
    if (!confirm(confirmText)) return
    setBusy(true)
    setError('')
    try {
      await onConfirm()
    } catch (err) {
      setError(`Não foi possível excluir: ${err.message}`)
      setBusy(false)
    }
  }
  return (
    <div className="danger-zone">
      <p className="hint">{warning}</p>
      <button className="button button-danger" onClick={run} disabled={busy}>
        <Trash2 size={18} aria-hidden="true" />
        {busy ? 'Excluindo…' : label}
      </button>
      {error && (
        <p className="flash-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
