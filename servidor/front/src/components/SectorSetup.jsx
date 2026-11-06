import { useEffect, useState } from 'react'
import {
  buildSectorConfig,
  bytes,
  loadSectorDefaults,
  loadSectorFirmware,
  SECTOR_CONFIG_ADDRESS,
  SECTOR_DEFAULTS,
} from '../services/serial'
import { getIdentification, registerSector } from '../services/api'
import { Check, FlashFooter, FlashTabs } from './FlashUI'
import { useFlasher } from '../hooks/useFlasher'

// O ESP32 precisa enviar ao banco do servidor (Raspberry Pi). O endereço de
// exemplo e localhost (que para o ESP32 é ele mesmo) nunca chegam lá.
function serverUrlProblem(url) {
  if (url.includes('SEU_TAILNET'))
    return 'O endereço do servidor ainda é o de exemplo (SEU_TAILNET).'
  if (/^https?:\/\/(localhost|127\.|0\.0\.0\.0)/i.test(url))
    return 'O endereço do servidor não pode ser localhost: use o endereço da Raspberry Pi.'
  return null
}

// ESP32 de setor (esp32/setor_configuravel/): ID PPSSAA + 02 + NN
const TIPO_ESP32 = '02'
const codes = (n) =>
  Array.from({ length: n }, (_, i) => String(i + 1).padStart(2, '0'))

// ESP32 já cadastrados na área (uma área pode ter vários), por número
function usedNumbers(setores, local) {
  return new Map(
    setores
      .flatMap((s) => (s.receptores || []).map((id) => [id, s.nome]))
      .filter(([id]) => id.startsWith(local + TIPO_ESP32))
      .map(([id, nome]) => [id.slice(8), nome]),
  )
}

function validateAdvanced(v) {
  if (!/^\d{6}$/.test(v.local)) return 'A área deve ter 6 dígitos (PPSSAA).'
  if (!/^\d{2}$/.test(v.numero) || v.numero === '00')
    return 'O número do ESP32 deve ter 2 dígitos, de 01 a 99.'
  if (bytes(v.rede) > 32) return 'A rede deve ter até 32 caracteres.'
  if (v.rede && !v.senha)
    return 'Com uma rede personalizada, informe também a senha dela.'
  for (const [field, label] of [
    ['senha', 'A senha da rede'],
    ['senhaChaveiros', 'A senha da rede dos chaveiros'],
  ])
    if (v[field] && (bytes(v[field]) < 8 || bytes(v[field]) > 63))
      return `${label} deve ter de 8 a 63 caracteres.`
  if (v.url && (!/^https?:\/\/.+/.test(v.url) || bytes(v.url) > 128))
    return 'A URL do servidor deve começar com http:// ou https:// e ter até 128 caracteres.'
  if (v.url && serverUrlProblem(v.url)) return serverUrlProblem(v.url)
  if (bytes(v.redeChaveiros) > 32)
    return 'A rede dos chaveiros deve ter até 32 caracteres.'
  if (bytes(v.chave) > 64 || bytes(v.chaveServidor) > 64)
    return 'As chaves devem ter até 64 caracteres.'
  return null
}

// Grava firmware (opcional) + configuração e cadastra a área no banco
function flashSector(
  flasher,
  onSaved,
  { withFirmware, config, eraseAll, done },
) {
  const esp32 = config.local + TIPO_ESP32 + config.numero
  flasher.flash({
    chip: 'ESP32',
    baudrate: 460800,
    eraseAll: withFirmware && eraseAll,
    prepare: async () => [
      ...(withFirmware ? await loadSectorFirmware() : []),
      { data: buildSectorConfig(config), address: SECTOR_CONFIG_ADDRESS },
    ],
    after: async () => {
      let saved = ''
      try {
        // O nome da área vem do backend (cadastro central em identificacao.js)
        const setor = await registerSector(config.local, esp32)
        saved = setor.nome
          ? ` Cadastrada no banco como ${setor.nome}.`
          : ' Área cadastrada no banco.'
        onSaved?.()
      } catch (error) {
        // Conflito não se resolve sozinho; falha de rede, sim, na 1ª conexão
        saved =
          error.status === 409
            ? ` Atenção: o banco recusou o cadastro (${error.message}) Confira a área e o número do ESP32.`
            : ` Não foi possível cadastrar no banco (${error.message}); o ESP32 cadastra a área quando conectar.`
      }
      return `${done} ID ${esp32}.${saved} O ESP32 reinicia sozinho; se não aparecer na rede, aperte o botão EN.`
    },
  })
}

function Instructions() {
  return (
    <ol className="flash-steps">
      <li>Conecte o ESP32 ao computador pelo USB.</li>
      <li>
        Clique em <strong>Gravar</strong> e escolha a porta do ESP32 (geralmente
        CH9102, CP210x ou CH340). Se não conectar, segure o botão{' '}
        <strong>BOOT</strong> ao clicar.
      </li>
      <li>
        Ao terminar, o ESP32 reinicia, cria a rede invisível dos chaveiros e
        conecta na rede com acesso ao servidor.
      </li>
    </ol>
  )
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([code, name]) => (
          <option key={code} value={code}>
            {name} ({code})
          </option>
        ))}
      </select>
    </label>
  )
}

function BasicTab({ setores, catalog, defaults, onSaved }) {
  const flasher = useFlasher()
  const [local, setLocal] = useState(SECTOR_DEFAULTS.local)
  const [numero, setNumero] = useState('01')
  const [sensores, setSensores] = useState(true)
  const [withFirmware, setWithFirmware] = useState(true)
  const [eraseAll, setEraseAll] = useState(false)
  const [pp, ss, aa] = local.match(/\d{2}/g)
  const plantas = catalog?.plantas || {}
  const setoresPlanta = plantas[pp]?.setores || {}
  const areas = setoresPlanta[ss]?.areas || {}
  const used = usedNumbers(setores, local)

  // Listas do cadastro central; códigos sem nome aparecem numerados
  const options = (named, prefix, count) =>
    [...new Set([...Object.keys(named), ...codes(count)])]
      .sort()
      .map((code) => [
        code,
        typeof named[code] === 'string'
          ? named[code]
          : (named[code]?.nome ?? `${prefix} ${code}`),
      ])

  function submit(event) {
    event.preventDefault()
    if (!defaults.rede || !defaults.url)
      return flasher.fail(
        'O firmware não tem rede ou servidor padrão. Use a aba Avançada ou preencha esp32/setor_configuravel/segredos.h e rode scripts/gerar_firmwares.sh.',
      )
    if (serverUrlProblem(defaults.url))
      return flasher.fail(
        `${serverUrlProblem(defaults.url)} Corrija esp32/setor_configuravel/segredos.h e rode scripts/gerar_firmwares.sh, ou use a aba Avançada.`,
      )
    // Só área, número e sensores: redes, chaves e servidor ficam com o padrão
    flashSector(flasher, onSaved, {
      withFirmware,
      eraseAll,
      config: { local, numero, sensores: sensores ? 1 : 2 },
      done: 'Área gravada.',
    })
  }

  return (
    <form className="flash-step" onSubmit={submit}>
      <Instructions />
      <fieldset className="flash-form" disabled={flasher.busy}>
        <Select
          label="Planta (PP)"
          value={pp}
          onChange={(v) => setLocal(v + '0101')}
          options={options(plantas, 'Planta', 9)}
        />
        <Select
          label="Setor (SS)"
          value={ss}
          onChange={(v) => setLocal(pp + v + '01')}
          options={options(setoresPlanta, 'Setor', 20)}
        />
        <Select
          label="Área (AA)"
          value={aa}
          onChange={(v) => setLocal(pp + ss + v)}
          options={options(areas, 'Área', 20)}
        />
        <label className="field">
          <span>Número do ESP32 na área (NN)</span>
          <select value={numero} onChange={(e) => setNumero(e.target.value)}>
            {codes(20).map((n) => (
              <option key={n} value={n}>
                {local}
                {TIPO_ESP32}
                {n}
                {used.has(n) ? ' (já cadastrado)' : ''}
              </option>
            ))}
          </select>
        </label>
        <Check checked={sensores} onChange={setSensores}>
          Ler os sensores (LDR, microfone e DHT11) e enviar ao banco
        </Check>
        <Check checked={withFirmware} onChange={setWithFirmware}>
          Gravar o firmware (desmarque para trocar só a área e o número)
        </Check>
        {/* Sem firmware, apagar tudo deixaria a placa só com a configuração */}
        {withFirmware && (
          <Check checked={eraseAll} onChange={setEraseAll}>
            Apagar a memória inteira antes
          </Check>
        )}
      </fieldset>
      <p className="flash-preset">
        Configuração pré-determinada do firmware: conecta na rede{' '}
        <strong>{defaults.rede || 'não definida'}</strong> e envia para{' '}
        <strong>{defaults.url || 'servidor não definido'}</strong>; cria a rede
        invisível <strong>{SECTOR_DEFAULTS.redeChaveiros}</strong>, que é a
        padrão dos chaveiros.
      </p>
      <FlashFooter flasher={flasher} />
    </form>
  )
}

function AdvancedTab({ defaults, onSaved }) {
  const flasher = useFlasher()
  const [values, setValues] = useState({
    local: SECTOR_DEFAULTS.local,
    numero: '01',
    rede: '',
    senha: '',
    url: '',
    redeChaveiros: '',
    senhaChaveiros: '',
    chave: '',
    chaveServidor: '',
  })
  const [sensores, setSensores] = useState(true)
  const [withFirmware, setWithFirmware] = useState(true)
  const [eraseAll, setEraseAll] = useState(false)
  const fallbacks = { ...SECTOR_DEFAULTS, ...defaults }

  const field = (name, label, props = {}) => (
    <label className="field">
      <span>{label}</span>
      <input
        value={values[name]}
        onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
        placeholder={
          props.type === 'password'
            ? 'Vazio usa o padrão do firmware'
            : fallbacks[name]
              ? `Vazio usa o padrão: ${fallbacks[name]}`
              : undefined
        }
        {...props}
      />
    </label>
  )

  function submit(event) {
    event.preventDefault()
    const config = Object.fromEntries(
      Object.entries(values).map(([k, v]) => [
        k,
        k.startsWith('senha') ? v : v.trim(),
      ]),
    )
    const problem = validateAdvanced(config)
    if (problem) return flasher.fail(problem)
    flashSector(flasher, onSaved, {
      withFirmware,
      eraseAll,
      config: { ...config, sensores: sensores ? 1 : 2 },
      done: 'Área gravada com a configuração personalizada.',
    })
  }

  return (
    <form className="flash-step" onSubmit={submit}>
      <Instructions />
      <fieldset className="flash-form" disabled={flasher.busy}>
        {field('local', 'Área (PPSSAA, 6 dígitos)', {
          inputMode: 'numeric',
          maxLength: 6,
          required: true,
        })}
        {field('numero', 'Número do ESP32 na área (NN)', {
          inputMode: 'numeric',
          maxLength: 2,
          required: true,
        })}
        {field('rede', 'Rede Wi-Fi com acesso ao servidor')}
        {field('senha', 'Senha dessa rede', {
          type: 'password',
          autoComplete: 'new-password',
        })}
        {field('url', 'URL do servidor (sem /api)', { type: 'url' })}
        {field('redeChaveiros', 'Rede invisível dos chaveiros')}
        {field('senhaChaveiros', 'Senha da rede dos chaveiros', {
          type: 'password',
          autoComplete: 'new-password',
        })}
        {field('chave', 'Chave dos chaveiros (X-Device-Key)', {
          type: 'password',
          autoComplete: 'off',
        })}
        {field('chaveServidor', 'Chave dos avisos do servidor (X-API-Key)', {
          type: 'password',
          autoComplete: 'off',
        })}
        <Check checked={sensores} onChange={setSensores}>
          Ler os sensores e enviar ao banco
        </Check>
        <Check checked={withFirmware} onChange={setWithFirmware}>
          Gravar o firmware
        </Check>
        {/* Sem firmware, apagar tudo deixaria a placa só com a configuração */}
        {withFirmware && (
          <Check checked={eraseAll} onChange={setEraseAll}>
            Apagar a memória inteira antes
          </Check>
        )}
      </fieldset>
      <FlashFooter flasher={flasher} />
    </form>
  )
}

export default function SectorSetup({ setores, onSaved }) {
  const [catalog, setCatalog] = useState(null)
  const [defaults, setDefaults] = useState({ rede: '', url: '' })
  useEffect(() => {
    getIdentification()
      .then(setCatalog)
      .catch(() => setCatalog({ plantas: {} }))
    loadSectorDefaults()
      .then(setDefaults)
      .catch(() => {})
  }, [])
  return (
    <FlashTabs
      basic={
        <BasicTab
          setores={setores}
          catalog={catalog}
          defaults={defaults}
          onSaved={onSaved}
        />
      }
      advanced={<AdvancedTab defaults={defaults} onSaved={onSaved} />}
    />
  )
}
