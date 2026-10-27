import { useState } from "react"

function DeviceStatus({
  dispositivos,
  buscaGeral
}) {
  const [busca, setBusca] = useState("")

  const termo = (
    busca || buscaGeral
  ).toLowerCase()

  const filtrados = dispositivos.filter(
    dispositivo =>
      dispositivo.id
        .toLowerCase()
        .includes(termo) ||
      dispositivo.setor
        .toLowerCase()
        .includes(termo)
  )

  return (
    <section
      className="device-status"
      id="dispositivos"
    >
      <div className="section-title">
        <div>
          <h2>Status dos dispositivos</h2>
          <p>Estado e última leitura</p>
        </div>
      </div>

      <div className="small-search">
        <span>⌕</span>

        <input
          value={busca}
          onChange={event =>
            setBusca(event.target.value)
          }
          placeholder="Buscar dispositivo..."
        />
      </div>

      <div className="device-table">
        <div className="device-table-header">
          <span>Dispositivo</span>
          <span>Setor</span>
          <span>Estado</span>
          <span>Leitura</span>
        </div>

        {filtrados.length === 0 ? (
          <div className="table-empty">
            Nenhum dispositivo encontrado.
          </div>
        ) : (
          filtrados.map(dispositivo => {
            const online =
              dispositivo.status === "online"

            return (
              <div
                className="device-table-row"
                key={dispositivo.id}
              >
                <strong>
                  {dispositivo.id}
                </strong>

                <span>
                  {dispositivo.setor}
                </span>

                <span className="table-status">
                  <span
                    className={
                      online
                        ? "status-dot online"
                        : "status-dot offline"
                    }
                  ></span>

                  <span
                    className={
                      online
                        ? ""
                        : "offline-text"
                    }
                  >
                    {online
                      ? "Online"
                      : "Offline"}
                  </span>
                </span>

                <span>
                  {dispositivo.ultimaAtualizacao || "—"}
                </span>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}

export default DeviceStatus