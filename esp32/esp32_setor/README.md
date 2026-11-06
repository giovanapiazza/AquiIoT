# ESP32 do setor

Firmware do ponto fixo do setor 01 do AquiIoT: cria a rede `AquiIoT_Setor_01`,
registra os chaveiros, lê os sensores (LDR, microfone, DHT11) e envia os dados
ao backend na Raspberry Pi.

- Documentação completa: [docs/esp32_setor.pdf](docs/esp32_setor.pdf)
- Configuração: copie `segredos.exemplo.h` para `segredos.h` e preencha.
- Biblioteca: `DHT sensor library` (Adafruit).

```
arduino-cli compile --fqbn esp32:esp32:esp32 -u -p /dev/ttyACM0 esp32_setor
```
