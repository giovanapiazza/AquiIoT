import { Menu, Search, Plus } from 'lucide-react'

function Topbar({
  busca,
  setBusca,
  onMenuClick,
  title,
  subtitle,
  onAdd,
  updated,
  error,
}) {
  const agora = updated || new Date()

  const data = agora.toLocaleDateString('pt-BR')

  const horario = agora.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <header className="topbar">
      <div className="topbar-title">
        <button
          className="mobile-menu"
          onClick={onMenuClick}
          aria-label="Abrir menu"
        >
          <Menu size={20} />
        </button>

        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </div>

      <div className="topbar-actions">
        <div className="update-info">
          <span className={`update-dot ${error ? 'unavailable' : ''}`}></span>

          <div>
            <strong>
              {error
                ? 'Falha na atualização'
                : updated
                  ? 'Dados atualizados'
                  : 'Aguardando servidor'}
            </strong>
            <span>{updated ? `${data} · ${horario}` : '—'}</span>
          </div>
        </div>

        {setBusca && (
          <div className="search-box">
            <Search size={14} />

            <input
              type="text"
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Buscar dispositivo, setor ou tag..."
            />
          </div>
        )}

        {onAdd && (
          <button className="primary-button" type="button" onClick={onAdd}>
            <Plus size={14} />
            Adicionar dispositivo
          </button>
        )}
      </div>
    </header>
  )
}

export default Topbar
