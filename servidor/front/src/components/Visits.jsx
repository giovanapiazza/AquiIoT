import { areaName, personName } from '../utils/places'
import { clock, eventDay } from '../utils/format'

const shortDate = (value) =>
  new Date(value).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'short' })

function duration(visit) {
  const minutes = Math.round((Date.parse(visit.fim) - Date.parse(visit.inicio)) / 60000)
  if (minutes < 1) return null
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

// Uma linha do histórico, em forma de frase
export function VisitLine({ visit, device, onSelect, showPerson = true, withDate = false }) {
  const who = personName(device, visit.dispositivo)
  const person = showPerson ? (
    onSelect ? (
      <button className="link" onClick={() => onSelect(visit.dispositivo)}>
        {who}
      </button>
    ) : (
      <strong>{who}</strong>
    )
  ) : null
  const lasted = visit.kind === 'permanencia' && duration(visit)
  // Sem o nome da pessoa, a frase começa pelo verbo
  const cap = (word) => (showPerson ? word : word[0].toUpperCase() + word.slice(1))
  let sentence
  if (visit.kind === 'saida')
    sentence = <>{cap('saiu de')} {areaName(visit.setor)}</>
  else if (visit.origem)
    sentence = (
      <>
        {cap('foi de')} {areaName(visit.origem)} para{' '}
        <strong>{areaName(visit.setor)}</strong>
      </>
    )
  else sentence = <>{cap('chegou em')} <strong>{areaName(visit.setor)}</strong></>
  return (
    <li className={`visit is-${visit.kind}`}>
      <time dateTime={visit.inicio}>
        {clock(visit.inicio)}
        {withDate && eventDay(visit.inicio) !== eventDay(Date.now()) ? (
          <span className="visit-until">{shortDate(visit.inicio)}</span>
        ) : (
          lasted && <span className="visit-until">até {clock(visit.fim)}</span>
        )}
      </time>
      <p>
        {person} {sentence}
        {lasted && <span className="visit-meta">ficou {lasted}</span>}
      </p>
    </li>
  )
}

export function VisitList({ visits, devices, onSelect, showPerson, withDate }) {
  const byId = new Map(devices.map((d) => [d.id, d]))
  return (
    <ol className="visits">
      {visits.map((visit) => (
        <VisitLine
          key={visit.key}
          visit={visit}
          device={byId.get(visit.dispositivo)}
          onSelect={onSelect}
          showPerson={showPerson}
          withDate={withDate}
        />
      ))}
    </ol>
  )
}
