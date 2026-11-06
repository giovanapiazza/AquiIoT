import { useState } from 'react'
import { Usb } from 'lucide-react'
import { PageHeader } from '../components/Shell'
import { Empty, Presence, Search, Segmented, SignalBars } from '../components/DataUI'
import DeviceSheet from '../components/DeviceSheet'
import { ago, plural } from '../utils/format'
import { place, personName } from '../utils/places'
import { useNow } from '../hooks/useNow'

export default function Devices({ dispositivos, eventos, onFlash, refresh }) {
  const now = useNow()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('todos')
  const [selected, setSelected] = useState(null)
  const here = dispositivos.filter((d) => d.status === 'online').length
  const term = search.trim().toLowerCase()
  const devices = dispositivos
    .filter(
      (d) =>
        `${d.nome || ''} ${d.id}`.toLowerCase().includes(term) &&
        (status === 'todos' || d.status === status),
    )
    .toSorted(
      (a, b) =>
        (a.status === 'online' ? 0 : 1) - (b.status === 'online' ? 0 : 1) ||
        personName(a).localeCompare(personName(b), 'pt-BR'),
    )
  const device = selected && dispositivos.find((d) => d.id === selected)

  return (
    <>
      <PageHeader
        title="Chaveiros"
        actions={
          <button className="button button-primary" onClick={onFlash}>
            <Usb size={18} aria-hidden="true" />
            Gravar chaveiro
          </button>
        }
      >
        {plural(dispositivos.length, 'chaveiro cadastrado', 'chaveiros cadastrados')},{' '}
        {here} {here === 1 ? 'presente' : 'presentes'} agora.
      </PageHeader>

      <div className="toolbar">
        <Search value={search} onChange={setSearch} label="Buscar por nome ou número" />
        <Segmented
          label="Mostrar"
          value={status}
          onChange={setStatus}
          options={[
            ['todos', 'Todos'],
            ['online', 'Presentes'],
            ['offline', 'Fora de alcance'],
          ]}
        />
      </div>

      {dispositivos.length === 0 ? (
        <Empty title="Nenhum chaveiro cadastrado">
          Conecte um ESP-01S ao computador e use Gravar chaveiro para cadastrar o
          primeiro.
        </Empty>
      ) : devices.length === 0 ? (
        <Empty title="Nenhum chaveiro encontrado">
          Confira a grafia ou mude o filtro para Todos.
        </Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Pessoa</th>
                <th scope="col">Situação</th>
                <th scope="col">Onde</th>
                <th scope="col">Sinal</th>
                <th scope="col">Última detecção</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => {
                const where = d.setor && place(d.setor)
                return (
                  <tr key={d.id}>
                    <th scope="row">
                      <button className="link row-link" onClick={() => setSelected(d.id)}>
                        {personName(d)}
                      </button>
                      <span className="sub">Chaveiro {d.id}</span>
                    </th>
                    <td>
                      <Presence online={d.status === 'online'} />
                    </td>
                    <td>
                      {where ? (
                        <>
                          {where.area}
                          {where.path && <span className="sub">{where.path}</span>}
                        </>
                      ) : (
                        <span className="hint">Nunca detectado</span>
                      )}
                    </td>
                    <td>
                      {d.rssi != null ? (
                        <span className="with-signal">
                          <SignalBars rssi={d.rssi} />
                          <span className="num">{d.rssi} dBm</span>
                        </span>
                      ) : (
                        <span className="hint">—</span>
                      )}
                    </td>
                    <td className="num">{d.data ? ago(d.data, now) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {device && (
        <DeviceSheet
          device={device}
          eventos={eventos}
          onClose={() => setSelected(null)}
          onDeleted={() => {
            setSelected(null)
            refresh()
          }}
        />
      )}
    </>
  )
}
