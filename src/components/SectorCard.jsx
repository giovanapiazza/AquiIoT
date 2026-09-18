function SectorCard(props) {
  const dispositivosDoSetor = props.dispositivos.filter(
    dispositivo => dispositivo.setor === props.setor.nome
  )

  return (
    <div className="sector-card">
      <h3>{props.setor.nome}</h3>

      <p>
        Receptor: {props.setor.esp32}
      </p>

      <p>
        Dispositivos: {dispositivosDoSetor.length}
      </p>

      <div className="sector-devices">
        {dispositivosDoSetor.map(
          dispositivo => (
            <span key={dispositivo.id}>
              {dispositivo.id}
            </span>
          )
        )}
      </div>
    </div>
  )
}

export default SectorCard