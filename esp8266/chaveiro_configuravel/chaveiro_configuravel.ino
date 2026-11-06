// Chaveiro AquiIoT configuravel (ESP8266 / ESP-01S, 1 MB de flash)
// Mesmo comportamento do esp8266_chaveiro.ino (POST /presenca com ID e RSSI a
// cada 5 s), mais o nome do usuario. ID, nome, rede, senha, chave e URL ficam
// salvos na flash (EEPROM); um campo vazio usa o valor padrao deste firmware
// (PADRAO_*). A interface web do AquiIoT (botao "Gravar chaveiro") grava o
// firmware e a configuracao de uma vez:
//   - aba Basica: so ID e nome; rede, senha, chave e URL vem do padrao abaixo
//   - aba Avancada: tudo o que for preenchido
//
// Protocolo serial (115200 baud, uma linha por comando, terminada em \n):
//   AQUIIOT?          -> AQUIIOT {"versao":2,"configurado":true,...}
//   SET campo=valor   -> AQUIIOT OK | AQUIIOT ERRO <motivo>
//                        campos: id, nome, rede, senha, chave, url (vazio = padrao)
//   SALVAR            -> valida, grava na flash, responde AQUIIOT SALVO e reinicia
//   APAGAR            -> apaga a configuracao, responde AQUIIOT APAGADO e reinicia
// Gravar um firmware novo nao apaga a configuracao (fica no setor da EEPROM em
// 0xFB000, no fim da flash).
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <EEPROM.h>

// Configuracao pre-determinada (iguais as do esp32_setor.ino)
const char* PADRAO_REDE = "AquiIoT_Setor_01";
const char* PADRAO_SENHA = "12345678";
const char* PADRAO_CHAVE = "MUDE_ESTA_CHAVE_DOS_CHAVEIROS";
const char* PADRAO_URL = "http://192.168.4.1/presenca";

const uint8_t VERSAO_PROTOCOLO = 2;
const uint32_t MAGICO_CONFIG = 0x41514932; // "AQI2"

// O setor esquece o chaveiro apos 15 s sem mensagem
const unsigned long INTERVALO_ENVIO_MS = 5000;
const unsigned long INTERVALO_AVISO_MS = 5000;

struct Configuracao {
  uint32_t magico;
  char rede[33];   // SSID: ate 32 caracteres
  char senha[65];  // WPA2: de 8 a 63 caracteres
  char chave[65];  // igual a CHAVE_DISPOSITIVO do esp32_setor.ino
  char url[97];    // ex.: http://192.168.4.1/presenca
  char id[9];      // TTNN: tipo 03 (ESP8266) + numero do no; o setor acrescenta PPSSAA
  char nome[33];   // nome do usuario do chaveiro, enviado ao banco
  uint32_t soma;
};
// A interface web monta este bloco byte a byte (servidor/front/src/services/serial.js) para
// gravar a configuracao junto com o firmware; o layout nao pode mudar sem ela.
static_assert(offsetof(Configuracao, soma) == 308 && sizeof(Configuracao) == 312,
              "layout da Configuracao mudou");

Configuracao config;   // a que esta salva
Configuracao rascunho; // a que chega pela serial antes do SALVAR
bool configurado = false;

unsigned long ultimoEnvio = 0;
unsigned long ultimoAviso = 0;
bool estavaConectado = false;
String linhaSerial;

const char* ouPadrao(const char* valor, const char* padrao) { return valor[0] ? valor : padrao; }
const char* rede(const Configuracao& c) { return ouPadrao(c.rede, PADRAO_REDE); }
const char* senha(const Configuracao& c) { return ouPadrao(c.senha, PADRAO_SENHA); }
const char* chave(const Configuracao& c) { return ouPadrao(c.chave, PADRAO_CHAVE); }
const char* url(const Configuracao& c) { return ouPadrao(c.url, PADRAO_URL); }

uint32_t calcularSoma(const Configuracao& c) {
  // FNV-1a sobre tudo menos o proprio campo soma
  const uint8_t* bytes = reinterpret_cast<const uint8_t*>(&c);
  uint32_t soma = 2166136261u;
  for (size_t i = 0; i < offsetof(Configuracao, soma); i++) {
    soma = (soma ^ bytes[i]) * 16777619u;
  }
  return soma;
}

// Valida os valores efetivos (com os padroes); nullptr se estiver tudo certo
const char* validar(const Configuracao& c) {
  size_t tamSenha = strlen(senha(c));
  if (tamSenha < 8 || tamSenha > 63) return "senha deve ter de 8 a 63 caracteres";
  if (strncmp(url(c), "http://", 7) != 0) return "url deve comecar com http://";
  if (strlen(c.id) != 4) return "id deve ter 4 digitos (TTNN)";
  for (int i = 0; i < 4; i++) {
    if (!isdigit(static_cast<unsigned char>(c.id[i]))) return "id deve ter 4 digitos (TTNN)";
  }
  return nullptr;
}

void carregarConfiguracao() {
  EEPROM.get(0, config);
  configurado = config.magico == MAGICO_CONFIG && config.soma == calcularSoma(config) &&
                validar(config) == nullptr;
  if (!configurado) memset(&config, 0, sizeof(config));
  rascunho = config;
}

void gravarConfiguracao(const Configuracao& c) {
  EEPROM.put(0, c);
  EEPROM.commit();
}

void responder(const char* texto) {
  Serial.print("AQUIIOT ");
  Serial.println(texto);
}

// Escreve um texto como string JSON (aspas, barra e controles escapados)
void imprimirJson(const char* texto) {
  Serial.print('"');
  for (const char* p = texto; *p; p++) {
    if (*p == '"' || *p == '\\') {
      Serial.print('\\');
      Serial.print(*p);
    } else if (static_cast<unsigned char>(*p) < 0x20) {
      Serial.printf("\\u%04x", *p);
    } else {
      Serial.print(*p);
    }
  }
  Serial.print('"');
}

// A senha e a chave nunca saem pela serial; so se estao personalizadas
void informarConfiguracao() {
  Serial.printf("AQUIIOT {\"versao\":%u,\"configurado\":%s,\"id\":", VERSAO_PROTOCOLO,
                configurado ? "true" : "false");
  imprimirJson(config.id);
  Serial.print(",\"nome\":");
  imprimirJson(config.nome);
  Serial.print(",\"rede\":");
  imprimirJson(rede(config));
  Serial.printf(",\"senha\":%s,\"chave\":%s,\"url\":", config.senha[0] ? "true" : "false",
                config.chave[0] ? "true" : "false");
  imprimirJson(url(config));
  Serial.printf(",\"chip\":\"%06x\",\"conectado\":%s}\n", ESP.getChipId(),
                WiFi.status() == WL_CONNECTED ? "true" : "false");
}

bool copiarCampo(char* destino, size_t capacidade, const String& valor) {
  if (valor.length() >= capacidade) return false;
  strncpy(destino, valor.c_str(), capacidade);
  destino[capacidade - 1] = '\0';
  return true;
}

void definirCampo(const String& argumento) {
  int igual = argumento.indexOf('=');
  if (igual <= 0) {
    responder("ERRO use SET campo=valor");
    return;
  }
  String campo = argumento.substring(0, igual);
  String valor = argumento.substring(igual + 1);
  bool cabe;
  if (campo == "rede") cabe = copiarCampo(rascunho.rede, sizeof(rascunho.rede), valor);
  else if (campo == "senha") cabe = copiarCampo(rascunho.senha, sizeof(rascunho.senha), valor);
  else if (campo == "chave") cabe = copiarCampo(rascunho.chave, sizeof(rascunho.chave), valor);
  else if (campo == "url") cabe = copiarCampo(rascunho.url, sizeof(rascunho.url), valor);
  else if (campo == "id") cabe = copiarCampo(rascunho.id, sizeof(rascunho.id), valor);
  else if (campo == "nome") cabe = copiarCampo(rascunho.nome, sizeof(rascunho.nome), valor);
  else {
    responder("ERRO campo desconhecido");
    return;
  }
  responder(cabe ? "OK" : "ERRO valor longo demais");
}

void processarComando(String linha) {
  linha.trim();
  if (linha.length() == 0) return;

  if (linha == "AQUIIOT?") {
    informarConfiguracao();
  } else if (linha.startsWith("SET ")) {
    definirCampo(linha.substring(4));
  } else if (linha == "SALVAR") {
    const char* erro = validar(rascunho);
    if (erro) {
      Serial.printf("AQUIIOT ERRO %s\n", erro);
      return;
    }
    rascunho.magico = MAGICO_CONFIG;
    rascunho.soma = calcularSoma(rascunho);
    gravarConfiguracao(rascunho);
    responder("SALVO");
    Serial.flush();
    delay(200);
    ESP.restart();
  } else if (linha == "APAGAR") {
    memset(&rascunho, 0, sizeof(rascunho));
    gravarConfiguracao(rascunho);
    responder("APAGADO");
    Serial.flush();
    delay(200);
    ESP.restart();
  } else {
    responder("ERRO comando desconhecido");
  }
}

void lerSerial() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      if (linhaSerial.length()) processarComando(linhaSerial);
      linhaSerial = "";
    } else if (linhaSerial.length() < 200) {
      linhaSerial += c;
    }
  }
}

// Codifica para application/x-www-form-urlencoded (o nome pode ter acentos)
String codificarUrl(const char* texto) {
  String r;
  for (const char* p = texto; *p; p++) {
    const unsigned char c = *p;
    if (isalnum(c) || c == '-' || c == '_' || c == '.' || c == '~') {
      r += static_cast<char>(c);
    } else {
      char hex[4];
      snprintf(hex, sizeof(hex), "%%%02X", c);
      r += hex;
    }
  }
  return r;
}

void enviarPresenca() {
  int rssi = WiFi.RSSI();
  // O setor aceita de -120 a -1; RSSI 0 ou positivo indica leitura invalida
  if (rssi >= 0) rssi = -1;
  if (rssi < -120) rssi = -120;

  WiFiClient cliente;
  HTTPClient http;
  http.begin(cliente, url(config));
  http.setTimeout(2000);
  http.addHeader("Content-Type", "application/x-www-form-urlencoded");
  http.addHeader("X-Device-Key", chave(config));

  String corpo = "id=" + String(config.id) + "&rssi=" + String(rssi);
  if (config.nome[0]) corpo += "&nome=" + codificarUrl(config.nome);
  int codigo = http.POST(corpo);
  String resposta = codigo > 0 ? http.getString() : http.errorToString(codigo);
  http.end();

  Serial.printf("[PRESENCA] RSSI %d dBm -> HTTP %d: %s\n", rssi, codigo, resposta.c_str());
  if (codigo == 401) Serial.println("  Confira a chave (igual a CHAVE_DISPOSITIVO do esp32_setor.ino).");
  if (codigo == 400) Serial.println("  Confira o ID (4 digitos, TTNN) e se o setor usa o padrao PPSSAATTNN.");
}

void setup() {
  Serial.begin(115200);
  delay(500);
  EEPROM.begin(sizeof(Configuracao));
  carregarConfiguracao();

  Serial.println("\n=== Chaveiro AquiIoT (configuravel) ===");
  informarConfiguracao();

  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  if (configurado) {
    Serial.printf("ID: %s | Nome: %s | Rede: %s | URL: %s\n", config.id, config.nome, rede(config),
                  url(config));
    WiFi.setAutoReconnect(true);
    WiFi.begin(rede(config), senha(config));
  }
}

void loop() {
  lerSerial();

  if (!configurado) {
    if (millis() - ultimoAviso >= INTERVALO_AVISO_MS) {
      ultimoAviso = millis();
      Serial.println("[CONFIG] Sem configuracao. Use a interface web do AquiIoT para configurar.");
    }
    delay(10);
    return;
  }

  if (WiFi.status() != WL_CONNECTED) {
    if (estavaConectado) {
      Serial.println("[WIFI] Sinal do setor perdido, tentando reconectar...");
      estavaConectado = false;
    }
    delay(10);
    return;
  }

  if (!estavaConectado) {
    estavaConectado = true;
    Serial.print("[WIFI] Conectado ao setor. IP: ");
    Serial.println(WiFi.localIP());
    ultimoEnvio = millis() - INTERVALO_ENVIO_MS; // envia logo em seguida
  }

  if (millis() - ultimoEnvio >= INTERVALO_ENVIO_MS) {
    ultimoEnvio = millis();
    enviarPresenca();
  }
}
