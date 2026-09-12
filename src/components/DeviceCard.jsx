function DeviceCard(props) {
    return (
        <div>
            <h3>{props.dispositivo.id}</h3>

            <p>Setor: {props.dispositivo.setor}</p>
            <p>Status: {props.dispositivo.status}</p>
            <p>RSSI: {props.dispositivo.rssi} dBm</p>
        </div>
    )

} export default DeviceCard