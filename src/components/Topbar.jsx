import {
  Menu,
  Search,
  Plus
} from "lucide-react"

function Topbar({
  busca,
  setBusca,
  onMenuClick
}) {
  const agora = new Date()

  const data = agora.toLocaleDateString("pt-BR")

  const horario = agora.toLocaleTimeString(
    "pt-BR",
    {
      hour: "2-digit",
      minute: "2-digit"
    }
  )

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
          <h1>Visão geral</h1>
          <p>Localização e estado dos dispositivos</p>
        </div>
      </div>

      <div className="topbar-actions">
        <div className="update-info">
          <span className="update-dot"></span>

          <div>
            <strong>Atualizado recentemente</strong>
            <span>{data} · {horario}</span>
          </div>
        </div>

        <div className="search-box">
          <Search size={14} />

          <input
            type="text"
            value={busca}
            onChange={event => setBusca(event.target.value)}
            placeholder="Buscar dispositivo, setor ou tag..."
          />
        </div>

        <button
          className="primary-button"
          type="button"
        >
          <Plus size={14} />
          Adicionar dispositivo
        </button>
      </div>
    </header>
  )
}

export default Topbar