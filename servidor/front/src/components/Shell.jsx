import { BellRing, Clock3, MapPinned, Radio, Settings2, Users } from 'lucide-react'
import { ago } from '../utils/format'
import { unseen } from '../utils/alerts'
import { useNow } from '../hooks/useNow'

export const PAGES = [
  { id: 'visao-geral', name: 'Agora', icon: MapPinned },
  { id: 'dispositivos', name: 'Chaveiros', icon: Users },
  { id: 'setores', name: 'Áreas', icon: Radio },
  { id: 'historico', name: 'Histórico', icon: Clock3 },
  { id: 'alertas', name: 'Alertas', icon: BellRing },
  { id: 'configuracoes', name: 'Ajustes', icon: Settings2 },
]

function Mark() {
  // Pino de "você está aqui", o mesmo das placas de sinalização
  return (
    <svg className="brand-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.5a7 7 0 0 0-7 7c0 5.2 7 12 7 12s7-6.8 7-12a7 7 0 0 0-7-7Z" />
      <circle cx="12" cy="9.5" r="2.6" />
    </svg>
  )
}

// Estado da conexão: ao vivo, atrasado ou sem conexão
function LiveStatus({ updated, error, onRetry }) {
  const now = useNow()
  const text = updated ? `Atualizado ${ago(updated, now)}` : 'Conectando…'
  if (error)
    return (
      <button className="live is-down" onClick={onRetry}>
        <span className="live-dot" aria-hidden="true" />
        Sem conexão. Tentar de novo
      </button>
    )
  return (
    <span className="live">
      {/* A chave reinicia o pulso a cada atualização */}
      <span className="live-dot" key={updated?.getTime()} aria-hidden="true" />
      {text}
    </span>
  )
}

export default function Shell({ page, data, children }) {
  // Selo no menu: alertas abertos que ninguém marcou como vistos
  const pending = unseen(data.alertas ?? []).length
  return (
    <div className="shell">
      {/* A navegação usa o hash, então o atalho só move o foco */}
      <a
        className="skip-link"
        href="#conteudo"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('conteudo').focus()
        }}
      >
        Pular para o conteúdo
      </a>
      <header className="topbar">
        <a
          className="brand"
          href="#visao-geral"
          aria-label="AquiIoT, ir para Agora"
        >
          <Mark />
          AquiIoT
        </a>
        <nav className="nav" aria-label="Seções">
          {PAGES.map(({ id, name, icon: Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              aria-current={page === id ? 'page' : undefined}
            >
              <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
              <span>{name}</span>
              {id === 'alertas' && pending > 0 && (
                <span className="nav-badge" aria-label={`${pending} sem ver`}>
                  {pending}
                </span>
              )}
            </a>
          ))}
        </nav>
        <LiveStatus
          updated={data.updated}
          error={data.error}
          onRetry={data.refresh}
        />
      </header>
      <main id="conteudo" className="page" tabIndex={-1}>
        {children}
      </main>
    </div>
  )
}

export function PageHeader({ title, children, actions }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {children && <p className="lede">{children}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  )
}
