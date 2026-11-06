import { useEffect, useRef, useState } from 'react'
import { SlidersHorizontal, Zap } from 'lucide-react'
import { serialSupported } from '../services/serial'
import { useFlashing } from '../hooks/useFlasher'

// Partes comuns às janelas "Gravar chaveiro" e "Adicionar setor"

function SerialLog({ lines }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [lines])
  if (!lines.length) return null
  return (
    <details className="serial-log">
      <summary>Mensagens da porta serial</summary>
      <pre ref={ref}>{lines.join('\n')}</pre>
    </details>
  )
}

export function Check({ checked, onChange, children }) {
  return (
    <label className="check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {children}
    </label>
  )
}

// Progresso, mensagem, botão e registro
export function FlashFooter({ flasher }) {
  const { busy, progress, status, log } = flasher
  return (
    <>
      {progress !== null && (
        <progress
          className="flash-progress"
          value={progress}
          max={1}
          aria-label="Progresso da gravação"
        />
      )}
      {busy && (
        <p className="flash-busy" role="alert">
          Não feche esta janela, não recarregue a página e não desconecte o
          cabo até a gravação terminar.
        </p>
      )}
      {status && (
        <p
          className={status.ok ? 'flash-ok' : 'flash-error'}
          role="status"
        >
          {status.text}
        </p>
      )}
      <div className="flash-actions">
        <button className="button button-primary" type="submit" disabled={busy}>
          {busy ? `Gravando… ${Math.round(progress * 100)}%` : 'Gravar'}
        </button>
      </div>
      <SerialLog lines={log} />
    </>
  )
}

// Abas Básica e Avançada, ou o aviso de navegador sem Web Serial
export function FlashTabs({ basic, advanced }) {
  const [tab, setTab] = useState('basica')
  // Trocar de aba desmontaria a gravação em andamento
  const flashing = useFlashing()
  if (!serialSupported())
    return (
      <p className="flash-error">
        Este navegador não oferece Web Serial. Use o Chrome, o Edge ou o Firefox
        151 ou mais recente, abrindo o AquiIoT por https:// ou por localhost.
      </p>
    )
  return (
    <>
      <div className="tabs" role="tablist">
        {[
          ['basica', 'Básica', Zap],
          ['avancada', 'Avançada', SlidersHorizontal],
        ].map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            disabled={flashing && tab !== id}
            className={tab === id ? 'active' : ''}
            onClick={() => setTab(id)}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>
      {tab === 'basica' ? basic : advanced}
    </>
  )
}
