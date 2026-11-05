import { useEffect, useState } from 'react'
import Shell, { PAGES } from './components/Shell'
import { Modal } from './components/DataUI'
import KeychainSetup from './components/KeychainSetup'
import SectorSetup from './components/SectorSetup'
import Overview from './pages/Overview'
import Devices from './pages/Devices'
import Sectors from './pages/Sectors'
import History from './pages/History'
import Settings from './pages/Settings'
import { useData } from './hooks/useData'
import { isFlashing } from './hooks/useFlasher'

const currentPage = () => {
  const id = location.hash.slice(1)
  return PAGES.some((p) => p.id === id) ? id : 'visao-geral'
}

// Preferências guardadas neste navegador; sem armazenamento, valem na sessão
function stored(key, fallback, valid) {
  try {
    const value = localStorage.getItem(key)
    return value !== null && valid(value) ? value : fallback
  } catch {
    return fallback
  }
}
function store(key, value) {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    /* A preferência continua válida nesta sessão. */
  }
}

export default function App() {
  const [page, setPage] = useState(currentPage)
  const [flash, setFlash] = useState(false)
  const [add, setAdd] = useState(false)
  const [interval, setIntervalValue] = useState(() =>
    Number(stored('aquiiot.interval', '5', (v) => ['2', '5', '10'].includes(v))),
  )
  const [theme, setTheme] = useState(() =>
    stored('aquiiot.theme', 'auto', (v) => ['auto', 'light', 'dark'].includes(v)),
  )
  const data = useData(interval)

  useEffect(() => {
    const change = () => {
      setPage(currentPage())
      // Durante uma gravação a janela continua aberta sobre a nova página
      if (!isFlashing()) {
        setFlash(false)
        setAdd(false)
      }
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', change)
    return () => window.removeEventListener('hashchange', change)
  }, [])
  useEffect(() => {
    document.title = `${PAGES.find((p) => p.id === page).name} · AquiIoT`
  }, [page])
  useEffect(() => {
    if (theme === 'auto') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = theme
  }, [theme])

  // Fechar no meio da gravação perde o progresso e pode deixar a placa sem
  // firmware completo: pede confirmação
  const closeFlashing = (close) => () => {
    if (
      !isFlashing() ||
      confirm(
        'A gravação ainda está em andamento. Fechar agora pode deixar a placa sem firmware completo. Fechar mesmo assim?',
      )
    )
      close(false)
  }
  const props = {
    ...data,
    onFlash: () => setFlash(true),
    onAdd: () => setAdd(true),
  }
  let content
  if (page === 'configuracoes')
    content = (
      <Settings
        interval={interval}
        onIntervalChange={(value) => {
          setIntervalValue(value)
          store('aquiiot.interval', value)
        }}
        theme={theme}
        onThemeChange={(value) => {
          setTheme(value)
          store('aquiiot.theme', value)
        }}
      />
    )
  else if (data.loading)
    content = (
      <p className="loading" role="status">
        Buscando chaveiros e áreas…
      </p>
    )
  else if (!data.updated)
    content = (
      <div className="offline-notice" role="alert">
        <h1>Sem conexão com o servidor</h1>
        <p>{data.error}</p>
        <p>
          Confira se a API está rodando e se o endereço em Ajustes está certo.
        </p>
        <button className="button button-primary" onClick={data.refresh}>
          Tentar de novo
        </button>
      </div>
    )
  else {
    const Page = {
      'visao-geral': Overview,
      dispositivos: Devices,
      setores: Sectors,
      historico: History,
    }[page]
    content = <Page {...props} />
  }

  return (
    <>
      <Shell page={page} data={data}>
        {data.error && data.updated && page !== 'configuracoes' && (
          <p className="stale" role="alert">
            Não foi possível atualizar. Mostrando os dados de{' '}
            {data.updated.toLocaleTimeString('pt-BR')}.{' '}
            <button className="link" onClick={data.refresh}>
              Tentar de novo
            </button>
          </p>
        )}
        {content}
      </Shell>
      {flash && (
        <Modal
          title="Gravar chaveiro"
          subtitle="Grava o firmware e cadastra quem vai usar o chaveiro."
          onClose={closeFlashing(setFlash)}
        >
          <KeychainSetup dispositivos={data.dispositivos} onSaved={data.refresh} />
        </Modal>
      )}
      {add && (
        <Modal
          title="Adicionar área"
          subtitle="Grava o ESP32 que vai detectar os chaveiros nesta área."
          onClose={closeFlashing(setAdd)}
        >
          <SectorSetup setores={data.setores} onSaved={data.refresh} />
        </Modal>
      )}
    </>
  )
}
