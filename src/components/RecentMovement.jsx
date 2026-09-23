function RecentMovement({ evento }) {
  if (!evento) {
    return (
      <div className="recent-movement">
        <span className="movement-label">
          Última movimentação
        </span>

        <span className="movement-empty">
          Nenhuma movimentação registrada.
        </span>
      </div>
    )
  }

  return (
    <div className="recent-movement">
      <span className="movement-label">
        Última movimentação
      </span>

      <div className="movement-data">
        <strong>{evento.dispositivo}</strong>

        <span>
          {evento.origem
            ? `${evento.origem} → ${evento.setor}`
            : evento.setor}
        </span>

        <time>{evento.horario}</time>
      </div>
    </div>
  )
}

export default RecentMovement