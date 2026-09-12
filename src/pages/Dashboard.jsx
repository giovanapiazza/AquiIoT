import SummaryCard from '../components/SummaryCard.jsx'
import Header from '../components/Header.jsx'
import dispositivos from '../data/mockData.js'
import DeviceCard from '../components/DeviceCard.jsx'

function Dashboard() {

  const dispositivosOnline = dispositivos.filter(
    dispositivo => dispositivo.status === "online"
  );

  const setores = dispositivos.map(
    dispositivo => dispositivo.setor
  );
  const setoresUnicos = new Set(setores);

  return (
    <div>
      <Header />

      <div>
        <SummaryCard titulo="Dispositivos" valor={dispositivos.length} />
        <SummaryCard titulo="Setores" valor={setoresUnicos.size} />
        <SummaryCard titulo="Online" valor={dispositivosOnline.length} />
      </div>

      <div>
        {dispositivos.map((dispositivo) => (
          <DeviceCard key={dispositivo.id} dispositivo={dispositivo} />
        ))}
      </div>
    </div>
  )
}

export default Dashboard