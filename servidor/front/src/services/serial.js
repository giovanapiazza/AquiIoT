// Gravação pela Web Serial, firmware e configuração numa única gravação:
// chaveiro (ESP8266, chaveiro_configuravel/) e setor (ESP32, setor_configuravel/).
// Os .bin são gerados por scripts/gerar_firmwares.sh.
import { ESPLoader, Transport } from 'esptool-js'

const FIRMWARE_BASE = `${import.meta.env.BASE_URL}firmware/`
export const FIRMWARE_URL = `${FIRMWARE_BASE}chaveiro_configuravel.bin`
const SECTOR_SIZE = 4096

// Tamanho em bytes (UTF-8), que é o limite dos campos da configuração gravada
export const bytes = (text) => new TextEncoder().encode(text).length

export const serialSupported = () =>
  typeof navigator !== 'undefined' && 'serial' in navigator

export function requestPort() {
  return navigator.serial.requestPort()
}

async function fetchBinary(url) {
  const response = await fetch(url)
  if (!response.ok)
    throw new Error(
      `Firmware não encontrado (HTTP ${response.status}). Rode scripts/gerar_firmwares.sh.`,
    )
  return new Uint8Array(await response.arrayBuffer())
}

export async function loadFirmware(file) {
  let data
  if (file) {
    data = new Uint8Array(await file.arrayBuffer())
  } else {
    data = await fetchBinary(FIRMWARE_URL)
  }
  // Imagens do ESP8266 começam com o byte mágico 0xE9
  if (data[0] !== 0xe9)
    throw new Error('O arquivo não parece um firmware .bin do ESP8266.')
  return data
}

// Setor da EEPROM no layout 1 MB (FS 64 KB) usado para compilar o firmware
export const CONFIG_ADDRESS = 0xfb000
// struct Configuracao do .ino: {magico, rede[33], senha[65], chave[65],
// url[97], id[9], nome[33], soma} = 312 bytes, com a soma (FNV-1a) no byte 308.
// Campo vazio: o firmware usa o padrão compilado no .bin.
const CONFIG_FIELDS = [
  ['rede', 4, 33],
  ['senha', 37, 65],
  ['chave', 102, 65],
  ['url', 167, 97],
  ['id', 264, 9],
  ['nome', 273, 33],
]
const CONFIG_SIZE = 312
const SUM_OFFSET = 308

// PADRAO_* do .ino, mostrados na aba básica
export const FIRMWARE_DEFAULTS = {
  rede: 'AquiIoT_Setor_01',
  senha: '12345678',
  chave: 'MUDE_ESTA_CHAVE_DOS_CHAVEIROS',
  url: 'http://192.168.4.1/presenca',
}

// Monta um setor de flash com a struct do firmware: mágico, textos terminados
// em zero, bytes avulsos e a soma FNV-1a de tudo antes dela
function buildSector({ magic, size, sumOffset, fields, bytes = [] }, values) {
  const sector = new Uint8Array(SECTOR_SIZE).fill(0xff)
  const config = new Uint8Array(size)
  const view = new DataView(config.buffer)
  view.setUint32(0, magic, true)
  for (const [name, offset, length] of fields) {
    const text = new TextEncoder().encode(values[name] || '')
    if (text.length >= length) throw new Error(`${name} longo demais.`)
    config.set(text, offset)
  }
  for (const [name, offset] of bytes) config[offset] = values[name] || 0
  let sum = 2166136261
  for (let i = 0; i < sumOffset; i++)
    sum = Math.imul(sum ^ config[i], 16777619) >>> 0
  view.setUint32(sumOffset, sum, true)
  sector.set(config)
  return sector
}

export const buildConfigSector = (values) =>
  buildSector(
    {
      magic: 0x41514932,
      size: CONFIG_SIZE,
      sumOffset: SUM_OFFSET,
      fields: CONFIG_FIELDS,
    },
    values,
  )

// Setor (ESP32): esquema de partições padrão de 4 MB; a configuração fica no
// início da partição spiffs, que o firmware não usa como sistema de arquivos
export const SECTOR_CONFIG_ADDRESS = 0x290000
// struct ConfigSetor do .ino = 476 bytes, soma no byte 472.
// sensores: 0 = padrão do .bin, 1 = ligados, 2 = desligados
export const buildSectorConfig = (values) =>
  buildSector(
    {
      magic: 0x31534941,
      size: 476,
      sumOffset: 472,
      fields: [
        ['local', 4, 7],
        ['numero', 11, 3],
        ['rede', 14, 33],
        ['senha', 47, 65],
        ['url', 112, 129],
        ['redeChaveiros', 241, 33],
        ['senhaChaveiros', 274, 65],
        ['chave', 339, 65],
        ['chaveServidor', 404, 65],
      ],
      bytes: [['sensores', 469]],
    },
    values,
  )

// PADRAO_* de setor_configuravel.ino; rede e servidor vêm de padroes.json,
// gerado de segredos.h (a senha não sai do .bin)
export const SECTOR_DEFAULTS = {
  local: '010302',
  redeChaveiros: 'AquiIoT_Setor_01',
  chave: 'MUDE_ESTA_CHAVE_DOS_CHAVEIROS',
  chaveServidor: 'MUDE_ESTA_CHAVE_DO_SERVIDOR',
}

export async function loadSectorDefaults() {
  const response = await fetch(`${FIRMWARE_BASE}setor/padroes.json`)
  return response.ok ? response.json() : { rede: '', url: '' }
}

export async function loadSectorFirmware() {
  const base = `${FIRMWARE_BASE}setor/`
  const files = await Promise.all(
    [
      ['bootloader.bin', 0x1000],
      ['partitions.bin', 0x8000],
      ['boot_app0.bin', 0xe000],
      ['app.bin', 0x10000],
    ].map(async ([name, address]) => ({
      data: await fetchBinary(base + name),
      address,
    })),
  )
  if (files[3].data[0] !== 0xe9)
    throw new Error('O firmware do setor não parece um .bin do ESP32.')
  return files
}

// Grava firmware e/ou configuração; cada item é {data, address}
export async function flashFirmware({
  port,
  files,
  eraseAll,
  onLog,
  onProgress,
  chip: expected = 'ESP8266',
  baudrate = 115200,
}) {
  const transport = new Transport(port, false)
  const terminal = {
    clean() {},
    writeLine: (text) => onLog(text),
    write: (text) => onLog(text),
  }
  try {
    const loader = new ESPLoader({ transport, baudrate, terminal })
    const chip = await loader.main('default_reset')
    // CHIP_NAME é a família exata: "ESP32" não aceita ESP32-S3, C3 etc.
    if (loader.chip.CHIP_NAME !== expected)
      throw new Error(
        `Chip ${chip} detectado; este firmware é para ${expected}.`,
      )
    // Progresso pelo total de bytes, não pela quantidade de arquivos
    const sizes = files.map((f) => f.data.length)
    const total = sizes.reduce((a, b) => a + b, 0)
    const before = sizes.map((_, i) =>
      sizes.slice(0, i).reduce((a, b) => a + b, 0),
    )
    await loader.writeFlash({
      fileArray: files,
      flashMode: 'keep',
      flashFreq: 'keep',
      flashSize: 'keep',
      eraseAll,
      compress: true,
      reportProgress: (index, written, size) =>
        onProgress((before[index] + (written / size) * sizes[index]) / total),
    })
    await loader.after('hard_reset')
    return chip
  } finally {
    await transport.disconnect().catch(() => {})
  }
}
