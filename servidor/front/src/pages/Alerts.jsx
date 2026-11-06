import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { PageHeader } from '../components/Shell'
import { Empty, Modal } from '../components/DataUI'
import { Check } from '../components/FlashUI'
import {
  acknowledgeAlert,
  createAlertRule,
  deleteAlertRule,
  getCollection,
  updateAlertRule,
} from '../services/api'
import {
  LEVELS,
  SENSORS,
  alertSource,
  condition,
  formatValue,
  sensorName,
} from '../utils/alerts'
import { areaName } from '../utils/places'
import { ago, eventDateTime, plural } from '../utils/format'
import { useNow } from '../hooks/useNow'

const EMPTY_RULE = {
  sensor: 'temperatura',
  operador: 'maior',
  limite: '',
  setorId: '',
  nivel: 'aviso',
  descricao: '',
  ativa: true,
}

// Criar ou editar uma regra: "Temperatura acima de 30 °C na Ala B"
function RuleForm({ rule, setores, onSaved, onClose }) {
  const [form, setForm] = useState(() =>
    rule
      ? { ...rule, limite: String(rule.limite), setorId: rule.setorId ?? '', descricao: rule.descricao ?? '' }
      : EMPTY_RULE,
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  async function submit(event) {
    event.preventDefault()
    const limite = Number(form.limite.replace(',', '.'))
    if (form.limite.trim() === '' || !Number.isFinite(limite))
      return setError('Informe o limite como número, por exemplo 30 ou 22,5.')
    const body = {
      sensor: form.sensor,
      operador: form.operador,
      limite,
      setorId: form.setorId === '' ? null : Number(form.setorId),
      nivel: form.nivel,
      ativa: form.ativa,
      descricao: form.descricao.trim() || null,
    }
    setBusy(true)
    setError('')
    try {
      if (rule) await updateAlertRule(rule.id, body)
      else await createAlertRule(body)
      onSaved()
      onClose()
    } catch (err) {
      setError(`Não foi possível salvar: ${err.message}`)
      setBusy(false)
    }
  }

  return (
    <Modal
      title={rule ? 'Editar regra' : 'Nova regra de alerta'}
      subtitle="O alerta abre quando uma leitura passa do limite e fecha sozinho quando volta ao normal."
      onClose={onClose}
    >
      <form className="flash-step" onSubmit={submit}>
        <fieldset className="flash-form" disabled={busy}>
          <label className="field">
            <span>Sensor</span>
            <select value={form.sensor} onChange={set('sensor')}>
              {Object.entries(SENSORS).map(([id, s]) => (
                <option key={id} value={id}>
                  {s.name}
                </option>
              ))}
            </select>
            <small>Vem de {SENSORS[form.sensor].from}.</small>
          </label>
          <label className="field">
            <span>Quando o valor ficar</span>
            <select value={form.operador} onChange={set('operador')}>
              <option value="maior">Acima do limite (maior que)</option>
              <option value="menor">Abaixo do limite (menor que)</option>
            </select>
          </label>
          <label className="field">
            <span>Limite{SENSORS[form.sensor].unit && ` (${SENSORS[form.sensor].unit.trim()})`}</span>
            <input
              inputMode="decimal"
              value={form.limite}
              onChange={set('limite')}
              placeholder="Ex.: 30"
              required
            />
          </label>
          <label className="field">
            <span>Onde</span>
            <select value={form.setorId} onChange={set('setorId')}>
              <option value="">Todas as áreas</option>
              {setores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Nível</span>
            <select value={form.nivel} onChange={set('nivel')}>
              {Object.entries(LEVELS).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Observação (opcional)</span>
            <input value={form.descricao} onChange={set('descricao')} maxLength={200} />
          </label>
          <Check checked={form.ativa} onChange={(ativa) => setForm((f) => ({ ...f, ativa }))}>
            Regra ativa
          </Check>
        </fieldset>
        {error && (
          <p className="flash-error" role="alert">
            {error}
          </p>
        )}
        <div className="flash-actions">
          <button type="button" className="button button-quiet" onClick={onClose}>
            Cancelar
          </button>
          <button className="button button-primary" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar regra'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function AlertRow({ alert, dispositivos, now, onAcknowledge }) {
  return (
    <li className={`alert-item is-${alert.nivel} ${alert.reconhecido ? 'is-seen' : ''}`}>
      <div>
        <strong>
          {sensorName(alert.sensor)} {condition(alert)}
        </strong>
        <span className="sub">
          {alertSource(alert, dispositivos)}
          {alert.dispositivo && alert.setor && ` em ${areaName(alert.setor)}`} · agora{' '}
          {formatValue(alert.sensor, alert.valorAtual)} · desde {ago(alert.inicio, now)}
        </span>
      </div>
      {alert.reconhecido ? (
        <span className="hint">Visto {ago(alert.reconhecido, now)}</span>
      ) : (
        <button className="button" onClick={() => onAcknowledge(alert.id)}>
          Marcar como visto
        </button>
      )}
    </li>
  )
}

export default function Alerts({ alertas, setores, dispositivos, updated, refresh }) {
  const now = useNow()
  const [rules, setRules] = useState(null)
  const [closed, setClosed] = useState([])
  const [editing, setEditing] = useState(null) // null, 'nova' ou a regra
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)

  // Regras e encerrados mudam pouco: busca ao abrir, a cada atualização dos
  // dados e depois de cada alteração feita aqui
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      getCollection('alertas/regras', controller.signal),
      getCollection('alertas?estado=todos&limite=50', controller.signal),
    ])
      .then(([r, all]) => {
        setRules(r)
        setClosed(all.filter((a) => !a.aberto))
        setError('')
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message)
      })
    return () => controller.abort()
  }, [updated, version])

  const reload = () => {
    setVersion((v) => v + 1)
    refresh()
  }
  async function run(action) {
    try {
      await action()
      reload()
    } catch (err) {
      setError(err.message)
    }
  }
  const remove = (rule) => {
    if (confirm(`Excluir a regra "${sensorName(rule.sensor)} ${condition(rule)}"? Os alertas dela também serão apagados.`))
      run(() => deleteAlertRule(rule.id))
  }

  return (
    <>
      <PageHeader
        title="Alertas"
        actions={
          <button className="button button-primary" onClick={() => setEditing('nova')}>
            <Plus size={18} aria-hidden="true" />
            Nova regra
          </button>
        }
      >
        {alertas.length
          ? `${plural(alertas.length, 'alerta aberto', 'alertas abertos')}.`
          : 'Nenhum alerta aberto.'}{' '}
        Defina limites para os sensores; leituras fora deles abrem um alerta.
      </PageHeader>

      {error && (
        <p className="stale" role="alert">
          {error}
        </p>
      )}

      <section className="alerts-section" aria-labelledby="abertos">
        <h2 id="abertos" className="side-title">
          Abertos
        </h2>
        {alertas.length ? (
          <ul className="alert-list">
            {alertas.map((a) => (
              <AlertRow
                key={a.id}
                alert={a}
                dispositivos={dispositivos}
                now={now}
                onAcknowledge={(id) => run(() => acknowledgeAlert(id))}
              />
            ))}
          </ul>
        ) : (
          <p className="hint">Todas as leituras estão dentro dos limites.</p>
        )}
      </section>

      <section className="alerts-section" aria-labelledby="regras">
        <h2 id="regras" className="side-title">
          Regras
        </h2>
        {rules === null ? (
          <p className="loading">Buscando regras…</p>
        ) : rules.length === 0 ? (
          <Empty title="Nenhuma regra definida">
            Use Nova regra para, por exemplo, avisar quando a temperatura de uma
            área passar de 30 °C.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Condição</th>
                  <th scope="col">Onde</th>
                  <th scope="col">Nível</th>
                  <th scope="col">Ativa</th>
                  <th scope="col">
                    <span className="visually-hidden">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <th scope="row">
                      {sensorName(r.sensor)} {condition(r)}
                      {r.descricao && <span className="sub">{r.descricao}</span>}
                    </th>
                    <td>{r.setor ? areaName(r.setor) : 'Todas as áreas'}</td>
                    <td>{LEVELS[r.nivel]}</td>
                    <td>
                      <Check
                        checked={r.ativa}
                        onChange={(ativa) => run(() => updateAlertRule(r.id, { ativa }))}
                      >
                        <span className="visually-hidden">Regra ativa</span>
                      </Check>
                    </td>
                    <td className="row-actions">
                      <button className="icon-button" onClick={() => setEditing(r)} aria-label="Editar regra">
                        <Pencil size={18} />
                      </button>
                      <button className="icon-button" onClick={() => remove(r)} aria-label="Excluir regra">
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {closed.length > 0 && (
        <section className="alerts-section" aria-labelledby="encerrados">
          <h2 id="encerrados" className="side-title">
            Encerrados recentemente
          </h2>
          <ul className="plain-list">
            {closed.slice(0, 20).map((a) => (
              <li key={a.id}>
                <span>
                  {sensorName(a.sensor)} {condition(a)} · {alertSource(a, dispositivos)}
                  <span className="sub">
                    Começou com {formatValue(a.sensor, a.valor)}, de {eventDateTime(a.inicio)} a{' '}
                    {eventDateTime(a.resolvido)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {editing && (
        <RuleForm
          rule={editing === 'nova' ? null : editing}
          setores={setores}
          onSaved={reload}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}
