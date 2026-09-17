import SummaryCard from '../components/SummaryCard.jsx'
import Header from '../components/Header.jsx'
import dispositivos from '../data/mockData.js'
import DeviceCard from '../components/DeviceCard.jsx'
import './Dashboard.css'

function Dashboard() {

  const dispositivosOnline = dispositivos.filter(
    dispositivo => dispositivo.status === "online"
  );

  const setores = dispositivos.map(
    dispositivo => dispositivo.setor
  );
  const setoresUnicos = new Set(setores);

  return (
    <div className='dashboard'>
      <Header />

      <div className='resumo'>
        <SummaryCard titulo="Dispositivos" valor={dispositivos.length} />
        <SummaryCard titulo="Setores" valor={setoresUnicos.size} />
        <SummaryCard titulo="Online" valor={dispositivosOnline.length} />
      </div>

      <div className='dispositivos'>
        {dispositivos.map((dispositivo) => (
          <DeviceCard key={dispositivo.id} dispositivo={dispositivo} />
        ))}
      </div>
    </div>
  )
}

export default Dashboard