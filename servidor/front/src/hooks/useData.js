import { useEffect, useState } from 'react'
import { getCollection } from '../services/api'

export function useData(interval) {
  const [state, setState] = useState({
    dispositivos: [],
    setores: [],
    eventos: [],
    leituras: [],
    alertas: [],
    loading: true,
    error: '',
    updated: null,
  })
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    let timer
    const controller = new AbortController()
    async function refresh() {
      try {
        // Leituras dos sensores das áreas (temperatura e umidade do DHT11)
        // e os alertas abertos, sinalizados em todas as páginas
        const [dispositivos, setores, eventos, leituras, alertas] = await Promise.all(
          [
            'dispositivos',
            'setores',
            'eventos',
            'eventos/sistema?tipo=leitura_setor&limite=100',
            'alertas',
          ].map((resource) =>
            getCollection(
              resource,
              AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
            ),
          ),
        )
        if (active)
          setState({
            dispositivos,
            setores,
            eventos,
            leituras,
            alertas,
            loading: false,
            error: '',
            updated: new Date(),
          })
      } catch (error) {
        if (active)
          setState((previous) => ({
            ...previous,
            loading: false,
            error: `Não foi possível atualizar os dados. ${error.message}`,
          }))
      } finally {
        if (active) timer = setTimeout(refresh, interval * 1000)
      }
    }
    refresh()
    return () => {
      active = false
      controller.abort()
      clearTimeout(timer)
    }
  }, [interval, retry])
  return { ...state, refresh: () => setRetry((value) => value + 1) }
}
