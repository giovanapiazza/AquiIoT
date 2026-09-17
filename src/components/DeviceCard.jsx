function DeviceCard(props) {
  const estaOnline = props.dispositivo.status === "online"

  return (
    <div className={`device-card ${estaOnline ? "online" : "offline"}`}>
      <h3>{props.dispositivo.id}</h3>

      <p>Setor: {props.dispositivo.setor}</p>

      <p>
        Status: {estaOnline ? "Online" : "Offline"}
      </p>

      <p>
        RSSI: {
          props.dispositivo.rssi !== null
            ? `${props.dispositivo.rssi} dBm`
            : "Indisponível"
        }
      </p>

      <p className="ultima-atualizacao">
        Última atualização: {props.dispositivo.ultimaAtualizacao}
      </p>
    </div>
  )
}

export default DeviceCard