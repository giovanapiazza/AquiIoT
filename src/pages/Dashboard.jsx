import SummaryStats from '../components/SummaryStats'
import SectorGrid from '../components/SectorGrid'
import DeviceStatus from '../components/DeviceStatus'
import RecentMovement from '../components/RecentMovement'
import MovementHistory from '../components/MovementHistory'
export default function Dashboard({
  dispositivos,
  setores,
  eventos,
  busca,
  onNavigate,
}) {
  const filtered = dispositivos.filter((d) =>
    `${d.id} ${d.setor}`.toLowerCase().includes(busca.toLowerCase()),
  )
  return (
    <>
      <SummaryStats
        dispositivos={dispositivos.length}
        setores={setores.length}
        online={dispositivos.filter((d) => d.status === 'online').length}
      />
      <div className="dashboard-grid">
        <SectorGrid setores={setores} dispositivos={filtered} />
        <DeviceStatus dispositivos={dispositivos} buscaGeral={busca} />
      </div>
      <RecentMovement evento={eventos[0]} />
      <MovementHistory
        eventos={eventos}
        onViewAll={() => onNavigate('historico')}
      />
    </>
  )
}
