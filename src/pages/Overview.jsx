import { useMemo, useState } from 'react'
import { PageHeader } from '../components/Shell'
import { Search, SignalBars, Empty } from '../components/DataUI'
import { VisitList } from '../components/Visits'
import DeviceSheet from '../components/DeviceSheet'
import { ago, plural } from '../utils/format'
import { groupByPath, place, personName, areaName } from '../utils/places'
import { latestReadings, visits } from '../utils/events'
import { useNow } from '../hooks/useNow'

const normalize = (text) =>
  String(text || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

// Etiqueta de uma pessoa no quadro
function Tag({ device, match, onSelect }) {
  return (
    <li>
      <button
        className={`tag ${match === false ? 'is-dimmed' : ''} ${match ? 'is-match' : ''}`}
        onClick={() => onSelect(device.id)}
      >
        <span className="tag-name">{personName(device)}</span>
        <span className="tag-meta">
          <SignalBars rssi={device.rssi} />
          <span className="tag-id">{device.id}</span>
        </span>
      </button>
    </li>
  )
}

function AreaPanel({ nome, setor, devices, matches, onSelect, now }) {
  const { area } = place(nome)
  const reading = setor?.leitura
  return (
    <section className={`area ${devices.length ? '' : 'is-empty'}`} aria-label={area}>
      <header className="area-heading">
        <h3>{area}</h3>
        <span className="area-count" aria-label={plural(devices.length, 'pessoa', 'pessoas')}>
          {devices.length}
        </span>
      </header>
      {devices.length ? (
        <ul className="tags">
          {devices.map((d) => (
            <Tag key={d.id} device={d} match={matches?.(d)} onSelect={onSelect} />
          ))}
        </ul>
      ) : (
        <p className="area-empty">Ninguém aqui agora</p>
      )}
      {reading && (
        <p className="area-reading" title={`Leitura ${ago(reading.data, now)}`}>
          {reading.temperatura != null && `${reading.temperatura.toLocaleString('pt-BR')} °C`}
          {reading.umidade != null && <span>{reading.umidade}% de umidade</span>}
        </p>
      )}
    </section>
  )
}

export default function Overview({ dispositivos, setores, eventos, leituras }) {
  const now = useNow()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const present = dispositivos.filter((d) => d.status === 'online' && d.setor)
  const away = dispositivos
    .filter((d) => !present.includes(d))
    .toSorted((a, b) => (Date.parse(b.data) || 0) - (Date.parse(a.data) || 0))
  // Recalculados só quando chegam dados novos, não a cada segundo do relógio
  const readings = useMemo(() => latestReadings(leituras), [leituras])

  // Áreas cadastradas e também as que só aparecem nas detecções
  const known = new Set(setores.map((s) => s.nome))
  const areas = [
    ...setores.map((s) => ({ ...s, leitura: readings.get(s.nome) })),
    ...[...new Set(present.map((d) => d.setor))]
      .filter((nome) => !known.has(nome))
      .map((nome) => ({ id: nome, nome })),
  ]
  const occupied = new Set(present.map((d) => d.setor)).size

  const term = normalize(query.trim())
  const matches = term
    ? (d) => normalize(`${d.nome} ${d.id}`).includes(term)
    : null
  const found = term ? dispositivos.filter(matches) : []

  const recent = useMemo(() => visits(eventos).slice(0, 8), [eventos])
  const device = selected && dispositivos.find((d) => d.id === selected)

  return (
    <>
      <PageHeader title="Agora">
        {present.length
          ? `${plural(present.length, 'pessoa', 'pessoas')} em ${plural(occupied, 'área', 'áreas')}.`
          : 'Ninguém detectado no momento.'}{' '}
        {away.length > 0 && `${plural(away.length, 'chaveiro', 'chaveiros')} fora de alcance.`}
      </PageHeader>

      <div className="finder">
        <Search
          value={query}
          onChange={setQuery}
          label="Onde está…"
          placeholder="Onde está… nome ou número"
        />
        {term && (
          <p className="finder-answer" role="status">
            {found.length === 0
              ? 'Nenhum chaveiro com esse nome ou número.'
              : found.slice(0, 3).map((d, i) => (
                  <span key={d.id}>
                    {i > 0 && ' '}
                    <button className="link" onClick={() => setSelected(d.id)}>
                      {personName(d)}
                    </button>{' '}
                    {d.status === 'online' && d.setor
                      ? `está em ${areaName(d.setor)}.`
                      : d.setor
                        ? `está fora de alcance; visto em ${areaName(d.setor)} ${ago(d.data, now)}.`
                        : 'ainda não foi detectado.'}
                  </span>
                ))}
            {found.length > 3 && ` E mais ${found.length - 3}.`}
          </p>
        )}
      </div>

      <div className="overview">
        <div className="board" aria-label="Quadro de presença">
          {areas.length === 0 ? (
            <Empty title="Nenhuma área cadastrada">
              Grave um ESP32 em Áreas para começar a localizar os chaveiros.
            </Empty>
          ) : (
            groupByPath(areas).map(({ path, areas: group }) => (
              <div className="board-group" key={path || 'sem-caminho'}>
                {path && <h2 className="board-path">{path}</h2>}
                <div className="board-areas">
                  {group.map((s) => (
                    <AreaPanel
                      key={s.id}
                      nome={s.nome}
                      setor={s}
                      devices={present.filter((d) => d.setor === s.nome)}
                      matches={matches}
                      onSelect={setSelected}
                      now={now}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <aside className="overview-side">
          <section aria-labelledby="fora">
            <h2 id="fora" className="side-title">
              Fora de alcance
            </h2>
            {away.length ? (
              <ul className="away">
                {away.map((d) => (
                  <li
                    key={d.id}
                    className={matches && !matches(d) ? 'is-dimmed' : ''}
                  >
                    <button className="link" onClick={() => setSelected(d.id)}>
                      {personName(d)}
                    </button>
                    <span>
                      {d.setor
                        ? `Visto em ${areaName(d.setor)} ${ago(d.data, now)}`
                        : 'Nunca detectado'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">Todos os chaveiros estão em alguma área.</p>
            )}
          </section>
          <section aria-labelledby="mov">
            <h2 id="mov" className="side-title">
              Movimentações
            </h2>
            {recent.length ? (
              <>
                <VisitList visits={recent} devices={dispositivos} onSelect={setSelected} withDate />
                <a className="more" href="#historico">
                  Ver histórico completo
                </a>
              </>
            ) : (
              <p className="hint">Nenhuma movimentação registrada ainda.</p>
            )}
          </section>
        </aside>
      </div>

      {device && (
        <DeviceSheet device={device} eventos={eventos} onClose={() => setSelected(null)} />
      )}
    </>
  )
}
