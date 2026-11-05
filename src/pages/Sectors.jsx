import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { PageHeader } from '../components/Shell'
import { Empty, Fields, Modal, Presence } from '../components/DataUI'
import { VisitList } from '../components/Visits'
import DeviceSheet from '../components/DeviceSheet'
import { ago, eventDateTime, plural } from '../utils/format'
import { groupByPath, place, personName } from '../utils/places'
import { latestReadings, visits } from '../utils/events'
import { useNow } from '../hooks/useNow'

// Detalhes de uma área: quem está nela, sensores e movimentações
function AreaSheet({ setor, reading, dispositivos, eventos, onSelect, onClose }) {
  const { area, path } = place(setor.nome)
  const present = dispositivos.filter((d) => d.setor === setor.nome && d.status === 'online')
  const recent = useMemo(
    () =>
      visits(
        eventos.filter((e) => [e.setor, e.origem, e.destino].includes(setor.nome)),
      ).slice(0, 12),
    [eventos, setor.nome],
  )
  return (
    <Modal side title={area} subtitle={path} onClose={onClose}>
      <Fields
        items={[
          ['Código da área', setor.codigo],
          [
            setor.receptores?.length > 1 ? 'ESP32 da área' : 'ESP32',
            setor.receptores?.join(', '),
          ],
          ['Temperatura', reading?.temperatura != null && `${reading.temperatura.toLocaleString('pt-BR')} °C`],
          ['Umidade', reading?.umidade != null && `${reading.umidade}%`],
          ['Leitura dos sensores', reading && eventDateTime(reading.data)],
        ]}
      />
      <h3 className="sheet-section">Aqui agora</h3>
      {present.length ? (
        <ul className="plain-list">
          {present.map((d) => (
            <li key={d.id}>
              <button className="link" onClick={() => onSelect(d.id)}>
                {personName(d)}
              </button>
              <Presence online />
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">Ninguém nesta área agora.</p>
      )}
      <h3 className="sheet-section">Movimentações</h3>
      {recent.length ? (
        <VisitList visits={recent} devices={dispositivos} onSelect={onSelect} withDate />
      ) : (
        <p className="hint">Nenhuma movimentação registrada nesta área.</p>
      )}
    </Modal>
  )
}

export default function Sectors({ setores, dispositivos, eventos, leituras, onAdd }) {
  const now = useNow()
  const [selected, setSelected] = useState(null)
  const [device, setDevice] = useState(null)
  const readings = useMemo(() => latestReadings(leituras), [leituras])
  const setor = selected && setores.find((s) => s.id === selected)
  const deviceData = device && dispositivos.find((d) => d.id === device)

  return (
    <>
      <PageHeader
        title="Áreas"
        actions={
          <button className="button button-primary" onClick={onAdd}>
            <Plus size={18} aria-hidden="true" />
            Adicionar área
          </button>
        }
      >
        Cada área tem um ESP32 que detecta os chaveiros por perto.{' '}
        {plural(setores.length, 'área cadastrada', 'áreas cadastradas')}.
      </PageHeader>

      {setores.length === 0 ? (
        <Empty title="Nenhuma área cadastrada">
          Conecte um ESP32 ao computador e use Adicionar área para gravar o
          primeiro.
        </Empty>
      ) : (
        groupByPath(setores).map(({ path, areas }) => (
          <section className="board-group" key={path || 'sem-caminho'}>
            {path && <h2 className="board-path">{path}</h2>}
            <ul className="area-list">
              {areas.map((s) => {
                const count = dispositivos.filter(
                  (d) => d.setor === s.nome && d.status === 'online',
                ).length
                const reading = readings.get(s.nome)
                return (
                  <li key={s.id}>
                    <button className="area-row" onClick={() => setSelected(s.id)}>
                      <span className="area-row-name">
                        {place(s.nome).area}
                        <span className="sub">
                          {s.receptores?.length > 1
                            ? `${s.receptores.length} ESP32: ${s.receptores.join(', ')}`
                            : `ESP32 ${s.receptores?.[0] || 'não associado'}`}
                        </span>
                      </span>
                      <span className="area-row-stat">
                        <strong>{count}</strong> {count === 1 ? 'pessoa' : 'pessoas'}
                      </span>
                      <span className="area-row-stat">
                        {reading?.temperatura != null ? (
                          <>
                            <strong>{reading.temperatura.toLocaleString('pt-BR')} °C</strong>
                            {reading.umidade != null && `, ${reading.umidade}%`}
                            <span className="sub">{ago(reading.data, now)}</span>
                          </>
                        ) : (
                          <span className="hint">Sem leitura de sensores</span>
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}

      {setor && (
        <AreaSheet
          setor={setor}
          reading={readings.get(setor.nome)}
          dispositivos={dispositivos}
          eventos={eventos}
          onSelect={setDevice}
          onClose={() => setSelected(null)}
        />
      )}
      {deviceData && (
        <DeviceSheet device={deviceData} eventos={eventos} onClose={() => setDevice(null)} />
      )}
    </>
  )
}
