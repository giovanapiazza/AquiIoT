import { useEffect } from 'react'
import { LayoutDashboard, Radio, Map, History, Settings } from 'lucide-react'

function Sidebar({ ativo, onNavigate, aberto, onClose }) {
  useEffect(() => {
    if (!aberto) return
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [aberto, onClose])
  const itens = [
    {
      id: 'visao-geral',
      nome: 'Visão geral',
      icone: LayoutDashboard,
    },
    {
      id: 'dispositivos',
      nome: 'Dispositivos',
      icone: Radio,
    },
    {
      id: 'setores',
      nome: 'Setores',
      icone: Map,
    },
    {
      id: 'historico',
      nome: 'Histórico',
      icone: History,
    },
    {
      id: 'configuracoes',
      nome: 'Configurações',
      icone: Settings,
    },
  ]

  function navegar(id) {
    onNavigate(id)
    onClose()
  }

  return (
    <>
      {aberto && <div className="sidebar-overlay" onClick={onClose} />}

      <aside className={`sidebar ${aberto ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="logo-mark">A</div>

          <div>
            <strong>AquiIoT</strong>
            <span>Projeto de localização indoor</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {itens.map((item) => {
            const Icone = item.icone

            return (
              <button
                key={item.id}
                aria-current={ativo === item.id ? 'page' : undefined}
                className={ativo === item.id ? 'active' : ''}
                onClick={() => navegar(item.id)}
              >
                <Icone className="nav-icon" size={16} strokeWidth={1.7} />

                {item.nome}
              </button>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <strong>AquiIoT</strong>
          <span>Versão 1.0</span>
          <span>Projeto acadêmico</span>
        </div>
      </aside>
    </>
  )
}

export default Sidebar
