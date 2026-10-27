#pragma once

// Copie este arquivo para segredos.h, na mesma pasta do esp32_setor.ino.
// Preencha com os dados reais e nao envie segredos.h ao Git.

// Wi-Fi com internet usado para falar com o backend.
const char* WIFI_STA_SSID = "NOME_DA_REDE_COM_INTERNET";
const char* WIFI_STA_SENHA = "SENHA_DA_REDE";
// API publica da Raspberry Pi (Tailscale Funnel), sem barra no final.
const char* URL_BACKEND = "https://raspberrypi.SEU_TAILNET.ts.net";
