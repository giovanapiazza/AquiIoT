#!/bin/sh
# Compila os firmwares configuráveis e publica em public/firmware/, que a
# interface grava pela Web Serial ("Gravar chaveiro" e "Adicionar setor").
# O firmware do setor leva a rede e o backend de setor_configuravel/segredos.h,
# por isso public/firmware/setor/ fica fora do Git.
set -eu
cd "$(dirname "$0")/.."

FLATPAK_CLI=/var/lib/flatpak/app/cc.arduino.IDE2/x86_64/stable/active/files/arduino-ide/resources/app/lib/backend/resources/arduino-cli
if command -v arduino-cli >/dev/null 2>&1; then
  CLI=arduino-cli
elif [ -x "$FLATPAK_CLI" ]; then
  CLI="$FLATPAK_CLI --config-file $HOME/.arduinoIDE/arduino-cli.yaml"
else
  echo "arduino-cli não encontrado" >&2
  exit 1
fi

BUILD=$(mktemp -d)
trap 'rm -rf "$BUILD"' EXIT

$CLI compile --fqbn esp8266:esp8266:generic:eesz=1M64,FlashMode=dout \
  --output-dir "$BUILD/chaveiro" chaveiro_configuravel
cp "$BUILD/chaveiro/chaveiro_configuravel.ino.bin" public/firmware/chaveiro_configuravel.bin

# Esquema padrão de partições (4 MB): a configuração vai na partição spiffs
$CLI compile --fqbn esp32:esp32:esp32 --output-dir "$BUILD/setor" setor_configuravel
mkdir -p public/firmware/setor
cp "$BUILD/setor/setor_configuravel.ino.bootloader.bin" public/firmware/setor/bootloader.bin
cp "$BUILD/setor/setor_configuravel.ino.partitions.bin" public/firmware/setor/partitions.bin
cp "$BUILD/setor/setor_configuravel.ino.bin" public/firmware/setor/app.bin
cp "$(find "$HOME/.arduino15/packages/esp32/hardware/esp32" -name boot_app0.bin | sort | tail -n 1)" \
  public/firmware/setor/boot_app0.bin
# Tabela de partições: entradas de 32 bytes (0xAA50, tipo, subtipo, offset, ...)
node -e '
const b = require("fs").readFileSync(process.argv[1])
for (let i = 0; i + 32 <= b.length && b.readUInt16LE(i) === 0x50aa; i += 32)
  if (b[i + 2] === 1 && b[i + 3] === 0x82 && b.readUInt32LE(i + 4) === 0x290000) process.exit(0)
console.error("partição spiffs fora de 0x290000; ajuste SECTOR_CONFIG_ADDRESS em src/services/serial.js")
process.exit(1)
' public/firmware/setor/partitions.bin

# Padrões sem senha, para a aba Básica mostrar onde o setor vai se conectar
node -e '
const src = require("fs").readFileSync(process.argv[1], "utf8")
const get = name => (src.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`)) || [])[1] || ""
require("fs").writeFileSync("public/firmware/setor/padroes.json", JSON.stringify({ rede: get("WIFI_SSID"), url: get("URL_BACKEND") }) + "\n")
' setor_configuravel/segredos.h 2>/dev/null || echo '{"rede":"","url":""}' > public/firmware/setor/padroes.json

ls -l public/firmware public/firmware/setor
