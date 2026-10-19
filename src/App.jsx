import { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import { Modal } from './components/DataUI'
import Dashboard from './pages/Dashboard'
import Devices from './pages/Devices'
import Sectors from './pages/Sectors'
import History from './pages/History'
import Settings from './pages/Settings'
import { useData } from './hooks/useData'
import './pages/Dashboard.css'
import './pages/Pages.css'
const pages = {
  'visao-geral': ['Visão geral', 'Localização e estado dos dispositivos'],
  dispositivos: [
    'Dispositivos',
    'Gerenciamento e monitoramento dos dispositivos',
  ],
  setores: ['Setores', 'Áreas monitoradas pelo sistema'],
  historico: ['Histórico', 'Registros de localização dos dispositivos'],
  configuracoes: ['Configurações', 'Preferências e informações do sistema'],
}
const currentPage = () =>
  Object.hasOwn(pages, location.hash.slice(1))
    ? location.hash.slice(1)
    : 'visao-geral'
export default function App() {
  const [page, setPage] = useState(currentPage)
  const [menu, setMenu] = useState(false)
  const [search, setSearch] = useState('')
  const [add, setAdd] = useState(false)
  const [interval, setIntervalValue] = useState(() => {
    try {
      const value = Number(localStorage.getItem('aquiiot.interval'))
      return [2, 5, 10].includes(value) ? value : 5
    } catch {
      return 5
    }
  })
  const data = useData(interval)
  useEffect(() => {
    const change = () => {
      setPage(currentPage())
      setMenu(false)
      setSearch('')
    }
    window.addEventListener('hashchange', change)
    return () => window.removeEventListener('hashchange', change)
  }, [])
  useEffect(() => {
    document.title = `${pages[page][0]} · AquiIoT`
  }, [page])
  function navigate(id) {
    location.hash = id
    setMenu(false)
  }
  function saveInterval(value) {
    setIntervalValue(value)
    try {
      localStorage.setItem('aquiiot.interval', String(value))
    } catch {
      /* A preferência continua válida nesta sessão. */
    }
  }
  return (
    <div className="app-layout">
      <Sidebar
        ativo={page}
        onNavigate={navigate}
        aberto={menu}
        onClose={() => setMenu(false)}
      />
      <div className="main-area">
        <Topbar
          title={pages[page][0]}
          subtitle={pages[page][1]}
          busca={search}
          setBusca={page === 'visao-geral' ? setSearch : null}
          onMenuClick={() => setMenu(true)}
          onAdd={
            ['visao-geral', 'dispositivos'].includes(page)
              ? () => setAdd(true)
              : null
          }
          updated={data.updated}
          error={data.error}
        />
        <main className="dashboard-content" key={page}>
          {page !== 'configuracoes' && data.error && (
            <div className="connection-error" role="alert">
              {data.error}
              {data.updated && ' Exibindo a última consulta bem-sucedida.'}
              <button className="text-button" onClick={data.refresh}>
                Tentar novamente
              </button>
            </div>
          )}
          {page === 'configuracoes' ? (
            <Settings interval={interval} onIntervalChange={saveInterval} />
          ) : data.loading ? (
            <p role="status" className="muted">
              Carregando dados…
            </p>
          ) : !data.updated ? null : page === 'visao-geral' ? (
            <Dashboard {...data} busca={search} onNavigate={navigate} />
          ) : page === 'dispositivos' ? (
            <Devices {...data} />
          ) : page === 'setores' ? (
            <Sectors {...data} />
          ) : (
            <History {...data} />
          )}
        </main>
      </div>
      {add && (
        <Modal title="Adicionar dispositivo" onClose={() => setAdd(false)}>
          <p className="muted">
            O backend atual não oferece cadastro manual de dispositivos. Novos
            dispositivos são registrados ao receber uma detecção em POST
            /api/localizacao.
          </p>
          <form>
            <fieldset disabled>
              <label className="filter-field">
                <span>Identificador</span>
                <input placeholder="Identificador do dispositivo" />
              </label>
              <label className="filter-field">
                <span>Nome (opcional)</span>
                <input placeholder="Nome do dispositivo" />
              </label>
              <button className="primary-button" type="submit">
                Cadastro indisponível
              </button>
            </fieldset>
          </form>
        </Modal>
      )}
    </div>
  )
}
