# Chaveiro (ESP8266 / ESP-01S)

Firmware do chaveiro do AquiIoT: conecta na rede do setor e envia
`POST /presenca` com o ID e o RSSI a cada 5 s.

- Documentação completa: [docs/esp8266_chaveiro.pdf](docs/esp8266_chaveiro.pdf)
- Rede, senha e `CHAVE_DISPOSITIVO` devem ser iguais às do `esp32_setor.ino`.
- Cada chaveiro precisa de um `ID_CHAVEIRO` diferente no formato TTNN (4 dígitos: `03` = ESP8266 + número do nó). O ESP32 do setor acrescenta o PPSSAA da área e envia o código completo de 10 dígitos.

```
arduino-cli compile --fqbn esp8266:esp8266:generic -u -p /dev/ttyUSB0 esp8266_chaveiro
```
