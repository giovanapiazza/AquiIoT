#pragma once

// Copie este arquivo para segredos.h, na mesma pasta do esp32_teste_local.ino.
// Nao envie segredos.h ao Git.

// Rede em que estao o computador com o AquiIoT e os chaveiros
const char* WIFI_SSID = "a22";
const char* WIFI_SENHA = "SENHA_DA_REDE";
// API do ambiente local (podman compose up), sem barra no final.
// Use o IP do computador na rede (ip -4 addr), nao "localhost".
const char* URL_BACKEND = "http://192.168.0.106:3000";
