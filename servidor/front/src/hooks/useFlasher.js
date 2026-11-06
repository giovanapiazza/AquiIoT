import { useState, useSyncExternalStore } from 'react'
import { flashFirmware, requestPort } from '../services/serial'

// Gravações em andamento na página toda: fechar a aba, recarregar ou fechar a
// janela de gravação no meio deixa a placa sem firmware completo
let active = 0
const listeners = new Set()
function setActive(delta) {
  active += delta
  listeners.forEach((listener) => listener())
}
export const isFlashing = () => active > 0
export const useFlashing = () =>
  useSyncExternalStore((listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }, isFlashing)

window.addEventListener('beforeunload', (event) => {
  if (!isFlashing()) return
  // O navegador mostra o próprio aviso de "sair da página?"
  event.preventDefault()
  event.returnValue = ''
})

// Estado e execução de uma gravação. `prepare` devolve os arquivos
// ({data, address}); `after` roda depois de gravar e devolve a mensagem final.
export function useFlasher() {
  const [progress, setProgress] = useState(null)
  const [status, setStatus] = useState(null)
  const [log, setLog] = useState([])
  const busy = progress !== null && !status

  async function flash({ prepare, chip, baudrate, eraseAll, after }) {
    setStatus(null)
    setLog([])
    try {
      // A porta primeiro: o navegador só a oferece logo após o clique, e
      // baixar o firmware antes pode demorar mais que essa janela
      const port = await requestPort()
      setProgress(0)
      setActive(1)
      try {
        const files = await prepare()
        await flashFirmware({
          port,
          files,
          eraseAll,
          chip,
          baudrate,
          onLog: (text) => setLog((l) => [...l.slice(-300), text]),
          onProgress: setProgress,
        })
      } finally {
        setActive(-1)
      }
      setProgress(1)
      setStatus({ ok: true, text: await after() })
    } catch (error) {
      if (error.name === 'NotFoundError') setProgress(null)
      else setStatus({ ok: false, text: error.message })
    }
  }
  return {
    busy,
    progress,
    status,
    log,
    flash,
    fail: (text) => setStatus({ ok: false, text }),
  }
}
