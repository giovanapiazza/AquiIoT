import { useState } from 'react'
import {
  buildConfigSector,
  bytes,
  CONFIG_ADDRESS,
  FIRMWARE_DEFAULTS,
  loadFirmware,
} from '../services/serial'
import { saveDevice } from '../services/api'
import { Check, FlashFooter, FlashTabs } from './FlashUI'
import { useFlasher } from '../hooks/useFlasher'

// Padrão PPSSAATTNN: o chaveiro guarda só o TTNN (03 = ESP8266 + número do
// nó); o ESP32 do setor acrescenta o PPSSAA da área.
const TIPO_ESP8266 = '03'
const NUMBERS = Array.from({ length: 99 }, (_, i) =>
  String(i + 1).padStart(2, '0'),
)


// Chaveiros já cadastrados no banco, por número do nó
function usedNumbers(dispositivos) {
  return new Map(
    dispositivos
      .filter((d) => new RegExp(`^${TIPO_ESP8266}\\d{2}$`).test(d.id))
      .map((d) => [String(d.id).slice(2), d.nome || 'sem nome']),
  )
}

function nextNumber(dispositivos) {
  const used = usedNumbers(dispositivos)
  return NUMBERS.find((n) => !used.has(n)) || '99'
}

function validateName(nome, required) {
  if (required && !nome.trim()) return 'Informe o nome do usuário.'
  if (bytes(nome.trim()) > 32) return 'O nome deve ter até 32 caracteres.'
  return null
}

function validateAdvanced(v) {
  if (!/^\d{4}$/.test(v.id)) return 'O ID deve ter 4 dígitos (TTNN).'
  if (bytes(v.rede) > 32) return 'A rede deve ter até 32 caracteres.'
  if (v.rede && !v.senha)
    return 'Com uma rede personalizada, informe também a senha dela.'
  if (v.senha && (bytes(v.senha) < 8 || bytes(v.senha) > 63))
    return 'A senha deve ter de 8 a 63 caracteres.'
  if (bytes(v.chave) > 64) return 'A chave deve ter até 64 caracteres.'
  if (v.url && (!/^http:\/\/.+/.test(v.url) || bytes(v.url) > 96))
    return 'A URL deve começar com http:// e ter até 96 caracteres.'
  return validateName(v.nome, false)
}

// Grava firmware (opcional) + configuração e cadastra o chaveiro no banco
function flashKeychain(
  flasher,
  onSaved,
  { withFirmware, file, config, eraseAll, done },
) {
  flasher.flash({
    chip: 'ESP8266',
    eraseAll: withFirmware && eraseAll,
    prepare: async () => [
      ...(withFirmware ? [{ data: await loadFirmware(file), address: 0 }] : []),
      { data: buildConfigSector(config), address: CONFIG_ADDRESS },
    ],
    after: async () => {
      // O banco já fica sabendo do chaveiro, sem esperar a primeira detecção
      let saved = ''
      if (config.nome) {
        try {
          await saveDevice(config.id, config.nome)
          saved = ` Cadastrado no banco como ${config.nome}.`
          onSaved?.()
        } catch (error) {
          saved = ` Não foi possível cadastrar no banco (${error.message}); o nome chega na primeira detecção.`
        }
      }
      return `${done}${saved} Volte o adaptador para o modo normal (UART) e reconecte o USB.`
    },
  })
}

function Instructions() {
  return (
    <ol className="flash-steps">
      <li>
        Coloque o ESP-01S no adaptador USB em <strong>modo de gravação</strong>{' '}
        (chave em PROG, ou GPIO0 ligado ao GND) e conecte ao computador.
      </li>
      <li>
        Clique em <strong>Gravar</strong> e escolha a porta do adaptador
        (geralmente CH340 ou CP210x).
      </li>
      <li>
        Ao terminar, volte o adaptador para o modo normal (UART) e reconecte o
        USB: o chaveiro liga já configurado.
      </li>
    </ol>
  )
}

function BasicTab({ dispositivos, onSaved }) {
  const flasher = useFlasher()
  const [nome, setNome] = useState('')
  const [numero, setNumero] = useState(() => nextNumber(dispositivos))
  const [withFirmware, setWithFirmware] = useState(true)
  const [eraseAll, setEraseAll] = useState(false)
  const used = usedNumbers(dispositivos)
  const id = TIPO_ESP8266 + numero

  function submit(event) {
    event.preventDefault()
    const problem = validateName(nome, true)
    if (problem) return flasher.fail(problem)
    // Só ID e nome: rede, senha, chave e URL ficam com o padrão do .bin
    flashKeychain(flasher, onSaved, {
      withFirmware,
      config: { id, nome: nome.trim() },
      eraseAll,
      done: `Chaveiro ${id} gravado para ${nome.trim()}.`,
    })
  }

  return (
    <form className="flash-step" onSubmit={submit}>
      <Instructions />
      <fieldset className="flash-form" disabled={flasher.busy}>
        <label className="field">
          <span>Nome do usuário</span>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Quem vai usar este chaveiro"
            maxLength={32}
            required
          />
        </label>
        <label className="field">
          <span>Número do chaveiro (NN)</span>
          <select value={numero} onChange={(e) => setNumero(e.target.value)}>
            {NUMBERS.map((n) => (
              <option key={n} value={n}>
                {TIPO_ESP8266}
                {n}
                {used.has(n) ? ` (em uso: ${used.get(n)})` : ''}
              </option>
            ))}
          </select>
          {used.has(numero) && (
            <small className="flash-warning">
              Este número já está cadastrado: gravar troca o nome de{' '}
              {used.get(numero)} por este.
            </small>
          )}
        </label>
        <Check checked={withFirmware} onChange={setWithFirmware}>
          Gravar o firmware (desmarque para trocar só o nome e o número)
        </Check>
        {/* Sem firmware, apagar tudo deixaria a placa só com a configuração */}
        {withFirmware && (
          <Check checked={eraseAll} onChange={setEraseAll}>
            Apagar a memória inteira antes
          </Check>
        )}
      </fieldset>
      <p className="flash-preset">
        Configuração pré-determinada do firmware: rede{' '}
        <strong>{FIRMWARE_DEFAULTS.rede}</strong>, servidor{' '}
        <strong>{FIRMWARE_DEFAULTS.url}</strong>. O nome e o ID {id} chegam ao
        banco pelo ESP32 do setor, que acrescenta o código da área.
      </p>
      <FlashFooter flasher={flasher} />
    </form>
  )
}

function AdvancedTab({ dispositivos, onSaved }) {
  const flasher = useFlasher()
  const [values, setValues] = useState(() => ({
    nome: '',
    id: TIPO_ESP8266 + nextNumber(dispositivos),
    rede: '',
    senha: '',
    chave: '',
    url: '',
  }))
  const [file, setFile] = useState(null)
  const [withFirmware, setWithFirmware] = useState(true)
  const [eraseAll, setEraseAll] = useState(false)

  // Campos com padrão no firmware: vazio usa o valor do .bin
  const field = (name, label, props = {}) => {
    const fallback = FIRMWARE_DEFAULTS[name]
    return (
      <label className="field">
        <span>{label}</span>
        <input
          value={values[name]}
          onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
          placeholder={
            !fallback
              ? undefined
              : props.type === 'password'
                ? 'Vazio usa o padrão do firmware'
                : `Vazio usa o padrão: ${fallback}`
          }
          {...props}
        />
      </label>
    )
  }

  function submit(event) {
    event.preventDefault()
    const config = Object.fromEntries(
      Object.entries(values).map(([k, v]) => [k, k === 'senha' ? v : v.trim()]),
    )
    const problem = validateAdvanced(config)
    if (problem) return flasher.fail(problem)
    flashKeychain(flasher, onSaved, {
      withFirmware,
      file,
      config,
      eraseAll,
      done: `Chaveiro ${config.id} gravado com a configuração personalizada.`,
    })
  }

  return (
    <form className="flash-step" onSubmit={submit}>
      <Instructions />
      <fieldset className="flash-form" disabled={flasher.busy}>
        {field('nome', 'Nome do usuário', { maxLength: 32 })}
        {field('id', 'ID do chaveiro (TTNN, 4 dígitos)', {
          inputMode: 'numeric',
          maxLength: 4,
          required: true,
        })}
        {field('rede', 'Rede Wi-Fi')}
        {field('senha', 'Senha da rede', {
          type: 'password',
          autoComplete: 'new-password',
        })}
        {field('chave', 'Chave dos chaveiros (CHAVE_DISPOSITIVO do setor)', {
          type: 'password',
          autoComplete: 'off',
        })}
        {field('url', 'URL de presença (ESP32 do setor)', { type: 'url' })}
        <Check checked={withFirmware} onChange={setWithFirmware}>
          Gravar o firmware
        </Check>
        {withFirmware && (
          <label className="field">
            <span>Arquivo de firmware (opcional)</span>
            <input
              type="file"
              accept=".bin"
              onChange={(e) => setFile(e.target.files[0] || null)}
            />
            <small className="hint">
              {file
                ? `Usando ${file.name}.`
                : 'Sem arquivo, grava o firmware configurável incluído no AquiIoT.'}
            </small>
          </label>
        )}
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

export default function KeychainSetup({ dispositivos, onSaved }) {
  return (
    <FlashTabs
      basic={<BasicTab dispositivos={dispositivos} onSaved={onSaved} />}
      advanced={<AdvancedTab dispositivos={dispositivos} onSaved={onSaved} />}
    />
  )
}
