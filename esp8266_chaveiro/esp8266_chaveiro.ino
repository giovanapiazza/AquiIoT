// Chaveiro AquiIoT (ESP8266 / ESP-01S)
// Conecta na rede do setor (esp32_setor/esp32_setor.ino do repositorio) e envia
// POST /presenca com o ID e o RSSI a cada 5 s.
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>

// Precisam ser iguais aos do esp32_setor.ino
const char* NOME_REDE = "AquiIoT_Setor_01";
const char* SENHA_REDE = "12345678";
const char* CHAVE_DISPOSITIVO = "MUDE_ESTA_CHAVE_DOS_CHAVEIROS";
const char* URL_PRESENCA = "http://192.168.4.1/presenca";

// O setor exige exatamente 8 digitos
const char* ID_CHAVEIRO = "00000001";

// O setor esquece o chaveiro apos 15 s sem mensagem
const unsigned long INTERVALO_ENVIO_MS = 5000;

unsigned long ultimoEnvio = 0;
bool estavaConectado = false;

void enviarPresenca() {
  int rssi = WiFi.RSSI();
  // O setor aceita de -120 a -1; RSSI 0 ou positivo indica leitura invalida
  if (rssi >= 0) rssi = -1;
  if (rssi < -120) rssi = -120;

  WiFiClient cliente;
  HTTPClient http;
  http.begin(cliente, URL_PRESENCA);
  http.setTimeout(2000);
  http.addHeader("Content-Type", "application/x-www-form-urlencoded");
  http.addHeader("X-Device-Key", CHAVE_DISPOSITIVO);

  String corpo = "id=" + String(ID_CHAVEIRO) + "&rssi=" + String(rssi);
  int codigo = http.POST(corpo);
  String resposta = codigo > 0 ? http.getString() : http.errorToString(codigo);
  http.end();

  Serial.printf("[PRESENCA] RSSI %d dBm -> HTTP %d: %s\n", rssi, codigo, resposta.c_str());
  if (codigo == 401) Serial.println("  Confira CHAVE_DISPOSITIVO (igual ao esp32_setor.ino).");
  if (codigo == 400) Serial.println("  Confira ID_CHAVEIRO (8 digitos).");
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== Chaveiro AquiIoT ===");
  Serial.printf("ID: %s | Rede: %s\n", ID_CHAVEIRO, NOME_REDE);

  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(NOME_REDE, SENHA_REDE);
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    if (estavaConectado) {
      Serial.println("[WIFI] Sinal do setor perdido, tentando reconectar...");
      estavaConectado = false;
    }
    delay(500);
    return;
  }

  if (!estavaConectado) {
    estavaConectado = true;
    Serial.print("[WIFI] Conectado ao setor. IPTESTE: ");
    Serial.println(WiFi.localIP());
    ultimoEnvio = millis() - INTERVALO_ENVIO_MS; // envia logo em seguida
  }

  if (millis() - ultimoEnvio >= INTERVALO_ENVIO_MS) {
    ultimoEnvio = millis();
    enviarPresenca();
  }
}
