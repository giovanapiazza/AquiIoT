#pragma once

// Copie este arquivo para segredos.h, na mesma pasta do setor_configuravel.ino.
// Nao envie segredos.h ao Git.

// Rede com acesso ao backend
const char* WIFI_SSID = "a22";
const char* WIFI_SENHA = "SENHA_DA_REDE";
// Padroes gravados no .bin (aba Basica de "Adicionar setor"). API sem barra no
// final; http:// para o ambiente local, https:// para a Raspberry (Funnel).
// Use o IP do computador na rede (ip -4 addr), nao "localhost".
const char* URL_BACKEND = "http://192.168.0.106:3000";
