# ESP32 de teste local

Faz o papel do ESP32 do setor numa bancada de testes: cria a rede invisível dos
chaveiros (`AquiIoT_Setor_01`, IP 192.168.4.1) e, ao mesmo tempo, conecta numa
rede com internet para enviar as detecções ao **backend do servidor** (Raspberry
Pi, Tailscale Funnel) no padrão PPSSAATTNN. Como a rede e a URL são os padrões
do firmware do chaveiro, um chaveiro gravado pela aba **Básica** de **Gravar
chaveiro** já funciona com ele.

1. Copie `segredos.exemplo.h` para `segredos.h` e preencha a rede e o
   `URL_BACKEND` do servidor (`https://raspberrypi.<tailnet>.ts.net`, sem
   `/api`). Enquanto o endereço tiver `SEU_TAILNET`, nada é enviado e o
   Monitor Serial avisa.
2. Grave com a placa "ESP32 Dev Module". No Monitor Serial (115200) aparecem a
   rede dos chaveiros, o backend e o IP do ESP32.
3. Com `SIMULAR_CHAVEIRO = true` (desligado por padrão), o chaveiro `0399` aparece na interface como
   `0103020399` sem nenhum ESP8266.

HTTP e HTTPS funcionam. Só para depurar a API no computador
(`podman compose up`), dá para apontar `URL_BACKEND` para
`http://<IP do computador>:3000` (nunca `localhost`: para o ESP32 isso é ele
mesmo); esses dados ficam no banco de desenvolvimento, não no do servidor.

## Saídas, sensores e avisos

- Um chaveiro sai quando o Wi-Fi avisa que ele desconectou (na hora) ou quando
  fica 15 s sem mandar presença. O ESP32 envia `POST /api/saida` e a interface
  mostra o chaveiro offline, com a saída no histórico.
- Com `HABILITAR_SENSORES`, lê LDR (34), microfone (35) e DHT11 (32) a cada 5 s
  e envia ao banco a cada 30 s, como evento `leitura_setor`.
- Avisos do servidor: `POST http://<IP do ESP32>/aviso` com o cabeçalho
  `X-API-Key: <CHAVE_SERVIDOR>` e `mensagem=...`. O handler só guarda o aviso;
  o loop chama `tratarAviso()`, onde entram buzzer, LED etc. Ao conectar, o
  ESP32 informa o próprio IP no evento `esp32_online` (`/api/eventos/sistema`).

Abrir e fechar o Monitor Serial reinicia o ESP32 pelo DTR/RTS e às vezes o deixa
parado; se ele sumir da rede depois disso, aperte o botão EN.
