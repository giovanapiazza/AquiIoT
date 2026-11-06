import { useEffect, useState } from 'react'
import { PageHeader } from '../components/Shell'
import { Segmented } from '../components/DataUI'
import { API_URL, testConnection } from '../services/api'

export default function Settings({ interval, onIntervalChange, theme, onThemeChange }) {
  const [connection, setConnection] = useState('checking')
  async function check() {
    setConnection('checking')
    try {
      await testConnection()
      setConnection('online')
    } catch {
      setConnection('offline')
    }
  }
  useEffect(() => {
    let active = true
    testConnection()
      .then(() => active && setConnection('online'))
      .catch(() => active && setConnection('offline'))
    return () => {
      active = false
    }
  }, [])

  return (
    <>
      <PageHeader title="Ajustes">
        Preferências deste navegador e conexão com o servidor.
      </PageHeader>
      <div className="settings">
        <section className="setting">
          <div>
            <h2>Atualizar a cada</h2>
            <p className="hint">
              Com que frequência a tela consulta o servidor. Intervalos curtos
              mostram as mudanças mais cedo.
            </p>
          </div>
          <Segmented
            label="Atualizar a cada"
            value={interval}
            onChange={onIntervalChange}
            options={[2, 5, 10].map((n) => [n, `${n} s`])}
          />
        </section>

        <section className="setting">
          <div>
            <h2>Aparência</h2>
            <p className="hint">Automática segue o tema do sistema.</p>
          </div>
          <Segmented
            label="Aparência"
            value={theme}
            onChange={onThemeChange}
            options={[
              ['auto', 'Automática'],
              ['light', 'Clara'],
              ['dark', 'Escura'],
            ]}
          />
        </section>

        <section className="setting">
          <div>
            <h2>Servidor</h2>
            <p className="server-address">{API_URL || window.location.origin}</p>
            <p
              role="status"
              className={`server-state is-${connection}`}
            >
              {connection === 'checking'
                ? 'Verificando…'
                : connection === 'online'
                  ? 'Conectado. Chaveiros, áreas e histórico respondem.'
                  : 'Sem resposta. Confira se a API está rodando e se o endereço acima está certo (variável VITE_API_URL).'}
            </p>
          </div>
          <button
            className="button"
            disabled={connection === 'checking'}
            onClick={check}
          >
            Testar conexão
          </button>
        </section>

        <section className="setting setting-about">
          <div>
            <h2>Sobre o AquiIoT</h2>
            <p>
              Localização indoor por áreas: cada pessoa leva um chaveiro
              (ESP-01S) e o ESP32 de cada área informa ao servidor quem está
              por perto. Projeto acadêmico, versão 1.0.
            </p>
          </div>
        </section>
      </div>
    </>
  )
}
