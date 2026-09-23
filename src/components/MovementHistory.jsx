function MovementHistory({ eventos }) {
  return (
    <section
      className="history-section"
      id="historico"
    >
      <div className="section-title history-title">
        <div>
          <h2>Últimas movimentações</h2>
          <p>Registros recentes dos dispositivos</p>
        </div>

        <button type="button">
          Ver histórico completo
        </button>
      </div>

      <div className="history-scroll">
        <div className="history-table">
          <div className="history-header">
            <span>Horário</span>
            <span>Dispositivo</span>
            <span>Origem</span>
            <span>Destino</span>
            <span>Sinal</span>
          </div>

          {eventos.length === 0 ? (
            <div className="history-empty">
              Nenhuma movimentação registrada.
            </div>
          ) : (
            eventos.map(evento => (
              <div
                className="history-row"
                key={evento.id}
              >
                <time>{evento.horario}</time>

                <strong>
                  {evento.dispositivo}
                </strong>

                <span>
                  {evento.origem || "—"}
                </span>

                <span>
                  {evento.setor}
                </span>

                <span>
                  {evento.rssi
                    ? `${evento.rssi} dBm`
                    : "—"}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  )
}

export default MovementHistory