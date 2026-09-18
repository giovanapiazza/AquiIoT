function EventList(props) {
  return (
    <div className="event-list">

      <div className="event-header">
        <span>Horário</span>
        <span>Dispositivo</span>
        <span>Setor</span>
      </div>

      {props.eventos.map(
        evento => (
          <div
            className="event-row"
            key={evento.id}
          >
            <span>{evento.horario}</span>
            <span>{evento.dispositivo}</span>
            <span>{evento.setor}</span>
          </div>
        )
      )}

    </div>
  )
}

export default EventList