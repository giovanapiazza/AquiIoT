#pragma once

// Copie este arquivo para segredos.h, na mesma pasta do setor_configuravel.ino.
// Nao envie segredos.h ao Git.

// Rede com acesso a internet (ou a rede da Raspberry Pi)
const char* WIFI_SSID = "NOME_DA_REDE";
const char* WIFI_SENHA = "SENHA_DA_REDE";
// Backend do SERVIDOR (Raspberry Pi), onde fica o banco do AquiIoT. Sem barra
// no final e sem /api. Enquanto o endereco tiver SEU_TAILNET, o ESP32 nao
// envia nada e avisa no Monitor Serial.
const char* URL_BACKEND = "https://raspberrypi.SEU_TAILNET.ts.net";
// So para depurar a API no computador (podman compose up), nunca em producao:
// const char* URL_BACKEND = "http://IP_DO_COMPUTADOR:3000";
