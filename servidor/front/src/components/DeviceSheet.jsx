import { useMemo } from 'react'
import { DangerZone, Fields, Modal, Presence, SignalBars, Empty } from './DataUI'
import { deleteDevice } from '../services/api'
import { VisitList } from './Visits'
import { ago, eventDateTime, signal } from '../utils/format'
import { place, personName } from '../utils/places'
import { visits } from '../utils/events'
import { useNow } from '../hooks/useNow'

// Painel lateral com tudo sobre um chaveiro: onde está e por onde passou
// `onDeleted` é chamado depois de excluir; sem ele, o botão não aparece
export default function DeviceSheet({ device, eventos, onClose, onDeleted }) {
  const now = useNow()
  const online = device.status === 'online'
  const where = device.setor ? place(device.setor) : null
  const recent = useMemo(
    () => visits(eventos.filter((e) => e.dispositivo === device.id)).slice(0, 12),
    [eventos, device.id],
  )
  return (
    <Modal
      side
      title={personName(device)}
      subtitle={`Chaveiro ${device.id}`}
      onClose={onClose}
    >
      <div className="sheet-status">
        <Presence online={online} />
        {where ? (
          <p className="sheet-where">
            {online ? 'Está em' : 'Visto por último em'}{' '}
            <strong>{where.area}</strong>
            {where.path && <span>{where.path}</span>}
          </p>
        ) : (
          <p className="sheet-where">Ainda não foi detectado por nenhuma área.</p>
        )}
      </div>
      <Fields
        items={[
          ['Última detecção', device.data && `${ago(device.data, now)} (${eventDateTime(device.data)})`],
          [
            'Sinal',
            device.rssi != null && (
              <span className="with-signal" key="sinal">
                <SignalBars rssi={device.rssi} /> {signal(device.rssi)}
              </span>
            ),
          ],
          ['Tipo', device.tipo && `${device.tipo}, nº ${device.numero}`],
          ['Código completo', device.codigo],
        ]}
      />
      <h3 className="sheet-section">Por onde passou</h3>
      {recent.length ? (
        <VisitList visits={recent} devices={[device]} showPerson={false} withDate />
      ) : (
        <Empty title="Sem movimentações registradas">
          Elas aparecem aqui quando uma área detectar este chaveiro.
        </Empty>
      )}
      {onDeleted && (
        <DangerZone
          label="Excluir chaveiro"
          warning="Apaga o chaveiro e todo o histórico dele (detecções, leituras e alertas). Se ele continuar ligado perto de uma área, volta a aparecer na próxima detecção, sem nome."
          confirmText={`Excluir ${personName(device)} (chaveiro ${device.id}) e todo o histórico dele? Não dá para desfazer.`}
          onConfirm={async () => {
            await deleteDevice(device.id)
            onDeleted()
          }}
        />
      )}
    </Modal>
  )
}
