import { useEffect, useState } from "react"

import Sidebar from "../components/Sidebar.jsx"
import Topbar from "../components/Topbar.jsx"
import SummaryStats from "../components/SummaryStats.jsx"
import SectorGrid from "../components/SectorGrid.jsx"
import DeviceStatus from "../components/DeviceStatus.jsx"
import RecentMovement from "../components/RecentMovement.jsx"
import MovementHistory from "../components/MovementHistory.jsx"

import "./Dashboard.css"

function Dashboard() {
  const [dispositivos, setDispositivos] = useState([])
  const [setores, setSetores] = useState([])
  const [eventos, setEventos] = useState([])

  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)

  const [busca, setBusca] = useState("")
  const [menuAberto, setMenuAberto] = useState(false)
  const [menuAtivo, setMenuAtivo] = useState("visao-geral")

  useEffect(() => {
    async function carregarDados() {
      try {
        const [
          respostaDispositivos,
          respostaSetores,
          respostaEventos
        ] = await Promise.all([
          fetch("http://localhost:3000/api/dispositivos"),
          fetch("http://localhost:3000/api/setores"),
          fetch("http://localhost:3000/api/eventos")
        ])

        if (
          !respostaDispositivos.ok ||
          !respostaSetores.ok ||
          !respostaEventos.ok
        ) {
          throw new Error("Erro ao carregar dados")
        }

        const dadosDispositivos =
          await respostaDispositivos.json()

        const dadosSetores =
          await respostaSetores.json()

        const dadosEventos =
          await respostaEventos.json()

        setDispositivos(dadosDispositivos)
        setSetores(dadosSetores)
        setEventos(dadosEventos)

      } catch (erro) {
        console.error(erro)

        setErro(
          "Não foi possível conectar ao servidor."
        )
      } finally {
        setCarregando(false)
      }
    }

    carregarDados()
  }, [])

  const dispositivosOnline =
    dispositivos.filter(
      dispositivo =>
        dispositivo.status === "online"
    )

  const dispositivosFiltrados =
    dispositivos.filter(dispositivo => {
      const termo = busca.toLowerCase()

      return (
        dispositivo.id
          .toLowerCase()
          .includes(termo) ||
        dispositivo.setor
          .toLowerCase()
          .includes(termo)
      )
    })

  if (carregando) {
    return (
      <div className="full-message">
        Carregando sistema...
      </div>
    )
  }

  if (erro) {
    return (
      <div className="full-message error">
        <strong>Servidor indisponível</strong>
        <span>{erro}</span>
      </div>
    )
  }

  return (
    <div className="app-layout">

      <Sidebar
        ativo={menuAtivo}
        onNavigate={setMenuAtivo}
        aberto={menuAberto}
        onClose={() => setMenuAberto(false)}
      />

      <div className="main-area">

        <Topbar
          busca={busca}
          setBusca={setBusca}
          onMenuClick={() =>
            setMenuAberto(true)
          }
        />

        <main
          className="dashboard-content"
          id="visao-geral"
        >

          <SummaryStats
            dispositivos={dispositivos.length}
            setores={setores.length}
            online={dispositivosOnline.length}
          />

          <div className="dashboard-grid">

            <SectorGrid
              setores={setores}
              dispositivos={dispositivosFiltrados}
            />

            <DeviceStatus
              dispositivos={dispositivos}
              buscaGeral={busca}
            />

          </div>

          <RecentMovement
            evento={eventos[0]}
          />

          <MovementHistory
            eventos={eventos}
          />

        </main>

      </div>

    </div>
  )
}

export default Dashboard