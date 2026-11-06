# Chaveiro configurável (ESP8266 / ESP-01S)

Mesmo comportamento do [`esp8266_chaveiro`](../esp8266_chaveiro/README.md)
(`POST /presenca` com o ID TTNN e o RSSI a cada 5 s), mas rede, senha, chave, URL e ID
não ficam no código: são salvos na flash (EEPROM) e definidos pela interface
web do AquiIoT, no botão **Gravar chaveiro**.

## Uso pela interface web

Coloque o ESP-01S no adaptador USB em modo de gravação (chave PROG ou GPIO0 no
GND), abra **Gravar chaveiro** e escolha uma aba:

- **Básica**: nome do usuário e número do chaveiro (lista 0301 a 0399, com os
  já cadastrados marcados). Rede, senha, chave e URL ficam com o padrão
  compilado no firmware (`PADRAO_*` no `.ino`: rede do setor e
  `http://192.168.4.1/presenca`).
- **Avançada**: tudo personalizável (nome, ID TTNN, rede, senha, chave, URL e
  arquivo `.bin`). Campo vazio usa o padrão do firmware.

O firmware vai para o endereço 0 e a configuração direto para o setor da
EEPROM (0xFB000), numa única gravação. Depois, volte o adaptador ao modo normal
e reconecte o USB. O chaveiro envia `id`, `rssi` e `nome` ao ESP32 do setor,
que repassa o nome ao banco junto com o código PPSSAATTNN.

O endereço 0xFB000 vale para o layout 1 MB (FS 64 KB) usado na compilação
abaixo; o layout da `struct Configuracao` (312 bytes) é conferido por
`static_assert` no `.ino` e montado igual em `servidor/front/src/services/serial.js`. Se mudar
os `PADRAO_*`, atualize também `FIRMWARE_DEFAULTS` nesse arquivo.

## Protocolo serial (115200 baud)

| Comando | Resposta |
|---|---|
| `AQUIIOT?` | `AQUIIOT {"versao":2,"configurado":true,"id":"…","nome":"…","rede":"…","senha":false,"chave":false,"url":"…","chip":"…","conectado":false}` |
| `SET campo=valor` (`id`, `nome`, `rede`, `senha`, `chave`, `url`; vazio = padrão) | `AQUIIOT OK` ou `AQUIIOT ERRO <motivo>` |
| `SALVAR` | valida e grava; `AQUIIOT SALVO` e reinicia, ou `AQUIIOT ERRO <motivo>` |
| `APAGAR` | apaga a configuração; `AQUIIOT APAGADO` e reinicia |

A senha e a chave nunca são enviadas de volta; `AQUIIOT?` só diz se estão
personalizadas. Também dá para configurar pelo Monitor Serial do Arduino IDE
(final de linha "Nova linha").

## Recompilar o `.bin` da interface

```
arduino-cli compile --fqbn esp8266:esp8266:generic:eesz=1M64,FlashMode=dout \
  --output-dir build chaveiro_configuravel
cp build/chaveiro_configuravel.ino.bin ../../servidor/front/public/firmware/chaveiro_configuravel.bin
```
