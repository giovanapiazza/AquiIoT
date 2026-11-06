# ESP32 de setor configurável

Firmware do ESP32 de setor gravado pela interface, no botão **Adicionar
setor**: cria a rede invisível dos chaveiros, conecta numa rede com acesso ao
backend (HTTP ou HTTPS) e envia presenças, saídas, sensores (LDR 34, microfone
35, DHT11 32) e o próprio IP no padrão PPSSAATTNN. Recebe avisos do servidor em
`POST /aviso` (`X-API-Key`), tratados em `tratarAviso()`.

- **Básica**: planta, setor, área e número do ESP32 em listas (do cadastro de
  `servidor/servidor/identificacao.js`) e os sensores. Rede, servidor, rede dos chaveiros
  e chaves ficam com o padrão do `.bin`.
- **Avançada**: tudo personalizável; campo vazio usa o padrão do `.bin`.

A configuração vai no início da partição `spiffs` (0x290000, esquema padrão de
4 MB), no mesmo envio do firmware. O layout da `struct ConfigSetor` (476 bytes)
é conferido por `static_assert` e montado igual em `servidor/front/src/services/serial.js`.
Depois de gravar, a interface já cadastra a área no banco.

## Padrões e geração do `.bin`

A rede com internet e o backend padrão vêm de `segredos.h` (copie de
`segredos.exemplo.h`; vai ao Git). O backend padrão é o **servidor**
(Raspberry Pi, `https://raspberrypi.<tailnet>.ts.net`), onde fica o banco do
AquiIoT; enquanto `URL_BACKEND` tiver `SEU_TAILNET`, o ESP32 não envia nada, a
interface recusa gravar pela aba Básica e o script de geração avisa. Depois de mudar o `.ino` ou o
`segredos.h`, rode na raiz:

```
scripts/gerar_firmwares.sh
```

O script compila este firmware e o do chaveiro e publica em `servidor/front/public/firmware/`.
Os `.bin` gerados (inclusive `servidor/front/public/firmware/setor/`, que leva
a senha da rede) vão ao Git: faça commit depois de rodar o script e use
`git pull` no servidor para recebê-los.
