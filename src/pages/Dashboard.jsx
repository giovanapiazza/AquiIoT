import { useEffect, useState } from "react"

import SummaryCard from "../components/SummaryCard.jsx"
import Header from "../components/Header.jsx"
import DeviceCard from "../components/DeviceCard.jsx"
import SectorCard from "../components/SectorCard.jsx"
import EventList from "../components/EventList.jsx"

import "./Dashboard.css"

function Dashboard() {
  const [dispositivos, setDispositivos] = useState([])
  const [setores, setSetores] = useState([])
  const [eventos, setEventos] = useState([])

  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    async function carregarDados() {
      try {
        const respostaDispositivos = await fetch(
          "http://localhost:3000/api/dispositivos"
        )

        const respostaSetores = await fetch(
          "http://localhost:3000/api/setores"
        )

        const respostaEventos = await fetch(
          "http://localhost:3000/api/eventos"
        )

        if (
          !respostaDispositivos.ok ||
          !respostaSetores.ok ||
          !respostaEventos.ok
        ) {
          throw new Error("Erro ao buscar dados da API")
        }

        const dadosDispositivos = await respostaDispositivos.json()
        const dadosSetores = await respostaSetores.json()
        const dadosEventos = await respostaEventos.json()

        setDispositivos(dadosDispositivos)
        setSetores(dadosSetores)
        setEventos(dadosEventos)
      } catch (erro) {
        console.error(erro)

        setErro(
          "Não foi possível conectar com o servidor AquiIoT."
        )
      } finally {
        setCarregando(false)
      }
    }

    carregarDados()
  }, [])

  const dispositivosOnline = dispositivos.filter(
    dispositivo => dispositivo.status === "online"
  )

  if (carregando) {
    return (
      <div className="dashboard">
        <h2>Carregando dados...</h2>
      </div>
    )
  }

  if (erro) {
    return (
      <div className="dashboard">
        <h2>Erro</h2>
        <p>{erro}</p>
      </div>
    )
  }

  return (
    <div className="dashboard">

      <Header />

      <h2>Resumo</h2>

      <div className="resumo">

        <SummaryCard
          titulo="Dispositivos"
          valor={dispositivos.length}
        />

        <SummaryCard
          titulo="Setores"
          valor={setores.length}
        />

        <SummaryCard
          titulo="Online"
          valor={dispositivosOnline.length}
        />

      </div>

      <h2>Dispositivos</h2>

      <div className="dispositivos">

        {dispositivos.map(
          dispositivo => (
            <DeviceCard
              key={dispositivo.id}
              dispositivo={dispositivo}
            />
          )
        )}

      </div>

      <h2>Setores</h2>

      <div className="setores">

        {setores.map(
          setor => (
            <SectorCard
              key={setor.id}
              setor={setor}
              dispositivos={dispositivos}
            />
          )
        )}

      </div>

      <h2>Histórico de localização</h2>

      <EventList eventos={eventos} />

    </div>
  )
}

export default Dashboard