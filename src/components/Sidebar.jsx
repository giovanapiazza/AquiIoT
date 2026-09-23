import {
  LayoutDashboard,
  Radio,
  Map,
  History,
  Settings
} from "lucide-react"

function Sidebar({ ativo, onNavigate, aberto, onClose }) {
  const itens = [
    {
      id: "visao-geral",
      nome: "Visão geral",
      icone: LayoutDashboard
    },
    {
      id: "dispositivos",
      nome: "Dispositivos",
      icone: Radio
    },
    {
      id: "setores",
      nome: "Setores",
      icone: Map
    },
    {
      id: "historico",
      nome: "Histórico",
      icone: History
    },
    {
      id: "configuracoes",
      nome: "Configurações",
      icone: Settings
    }
  ]

  function navegar(id) {
    onNavigate(id)
    onClose()

    const elemento = document.getElementById(id)

    if (elemento) {
      elemento.scrollIntoView({
        behavior: "smooth"
      })
    }
  }

  return (
    <>
      {aberto && (
        <div
          className="sidebar-overlay"
          onClick={onClose}
        />
      )}

      <aside className={`sidebar ${aberto ? "open" : ""}`}>
        <div className="sidebar-brand">
          <div className="logo-mark">A</div>

          <div>
            <strong>AquiIoT</strong>
            <span>Projeto de localização indoor</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {itens.map(item => {
            const Icone = item.icone

            return (
              <button
                key={item.id}
                className={ativo === item.id ? "active" : ""}
                onClick={() => navegar(item.id)}
              >
                <Icone
                  className="nav-icon"
                  size={16}
                  strokeWidth={1.7}
                />

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