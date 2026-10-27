function SectorBlock({
  setor,
  dispositivos
}) {
  const dispositivosDoSetor = dispositivos.filter(
    dispositivo => dispositivo.setor === setor.nome
  )

  return (
    <div className="sector-block">
      <div className="sector-heading">
        <div>
          <h3>{setor.nome}</h3>
          <span>{setor.esp32}</span>
        </div>

        <strong>
          {dispositivosDoSetor.length}
        </strong>
      </div>

      <div className="sector-device-list">
        {dispositivosDoSetor.length === 0 ? (
          <p className="sector-empty">
            Nenhum dispositivo neste setor
          </p>
        ) : (
          dispositivosDoSetor.map(dispositivo => {
            const online =
              dispositivo.status === "online"

            return (
              <div
                className="sector-device"
                key={dispositivo.id}
              >
                <div className="device-main">
                  <span
                    className={
                      online
                        ? "status-dot online"
                        : "status-dot offline"
                    }
                  ></span>

                  <strong>
                    {dispositivo.id}
                  </strong>
                </div>

                <div className="device-reading">
                  {online ? (
                    <>
                      <span>Online</span>
                      <time>
                        {dispositivo.ultimaAtualizacao || "--:--"}
                      </time>
                    </>
                  ) : (
                    <span className="offline-text">
                      Offline
                    </span>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default SectorBlock