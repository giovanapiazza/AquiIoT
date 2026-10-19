import { useEffect, useState } from 'react'
import { API_URL, testConnection } from '../services/api'
export default function Settings({ interval, onIntervalChange }) {
  const [connection, setConnection] = useState('checking')
  useEffect(() => {
    let active = true
    testConnection()
      .then(() => {
        if (active) setConnection('online')
      })
      .catch(() => {
        if (active) setConnection('offline')
      })
    return () => {
      active = false
    }
  }, [])
  async function check() {
    setConnection('checking')
    try {
      await testConnection()
      setConnection('online')
    } catch {
      setConnection('offline')
    }
  }
  return (
    <div className="settings-grid">
      <section className="settings-section">
        <h2>Informações do sistema</h2>
        <dl className="details-list">
          <div>
            <dt>Nome</dt>
            <dd>AquiIoT</dd>
          </div>
          <div>
            <dt>Versão</dt>
            <dd>1.0</dd>
          </div>
          <div>
            <dt>Finalidade</dt>
            <dd>Projeto acadêmico de localização indoor</dd>
          </div>
          <div>
            <dt>Tecnologias</dt>
            <dd>React, Vite, Node.js, Express, ESP8266 e ESP32</dd>
          </div>
        </dl>
      </section>
      <section className="settings-section">
        <h2>Conexão com o servidor</h2>
        <p className="api-address">{API_URL}</p>
        <p role="status" className="muted">
          {connection === 'checking'
            ? 'Verificando conexão…'
            : connection === 'online'
              ? 'Conexão estabelecida com os três endpoints.'
              : 'Servidor indisponível ou resposta inválida.'}
        </p>
        <button
          className="primary-button"
          disabled={connection === 'checking'}
          onClick={check}
        >
          Testar conexão
        </button>
      </section>
      <section className="settings-section">
        <h2>Atualização dos dados</h2>
        <label className="filter-field">
          <span>Intervalo de atualização do dashboard</span>
          <select
            aria-label="Intervalo de atualização do dashboard"
            value={interval}
            onChange={(e) => onIntervalChange(Number(e.target.value))}
          >
            {[2, 5, 10].map((n) => (
              <option key={n} value={n}>
                {n} segundos
              </option>
            ))}
          </select>
        </label>
        <p className="muted">
          Aplicado automaticamente em todas as páginas. Preferência salva neste
          navegador quando o armazenamento está disponível.
        </p>
      </section>
      <section className="settings-section">
        <h2>Sobre o projeto</h2>
        <p>
          O AquiIoT identifica dispositivos por sinais recebidos nos setores e
          apresenta a localização atual e o histórico de detecções.
        </p>
        <p className="architecture">ESP8266 → ESP32 → backend → frontend</p>
      </section>
    </div>
  )
}
