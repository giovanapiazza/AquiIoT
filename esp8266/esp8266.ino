#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>

// Configurações da Rede Oculta do Gateway ESP32
const char* GATEWAY_SSID = "RedeOculta_ESP32";
const char* GATEWAY_PASS = "SenhaSegura123";
const char* GATEWAY_IP   = "192.168.4.1";

// Endpoints da API no ESP32
const String URL_REGISTER = "http://192.168.4.1/register";
const String URL_PING     = "http://192.168.4.1/ping";

// Identificação Única deste Chaveiro (Nó)
const char* NODE_ID   = "Chaveiro_01";
const char* NODE_USER = "usuario_no1";
const char* NODE_PASS = "senha_no1";

// Intervalo entre cada pulso de presença (em milissegundos)
const unsigned long PING_INTERVAL = 3000; // Envia a cada 3 segundos
unsigned long lastPingTime = 0;

// Estado do registro
bool isRegistered = false;

// Função para registrar o nó no ESP32 (/register)
bool registerWithGateway() {
  if (WiFi.status() != WL_CONNECTED) return false;

  WiFiClient client;
  HTTPClient http;

  Serial.println("\n[REGISTRO] Solicitando cadastro ao Gateway ESP32...");
  
  http.begin(client, URL_REGISTER);
  http.addHeader("Content-Type", "application/x-www-form-urlencoded");
  http.setTimeout(2000); // Timeout rápido de 2s

  String postData = "node_id=" + String(NODE_ID) + 
                    "&user="   + String(NODE_USER) + 
                    "&pass="   + String(NODE_PASS);

  int httpCode = http.POST(postData);

  if (httpCode == 200) {
    Serial.println("[REGISTRO] Sucesso! Autorizado pelo Gateway.");
    http.end();
    return true;
  } else {
    Serial.print("[REGISTRO] Erro na resposta HTTP: ");
    Serial.println(httpCode);
    http.end();
    return false;
  }
}

// Função para enviar o pulso de presença (/ping)
void sendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClient client;
  HTTPClient http;

  http.begin(client, URL_PING);
  http.addHeader("Content-Type", "application/x-www-form-urlencoded");
  http.setTimeout(1500);

  String postData = "node_id=" + String(NODE_ID);
  int httpCode = http.POST(postData);

  if (httpCode == 200) {
    Serial.println("[HEARTBEAT] Ping enviado -> Resposta: PONG");
  } else {
    Serial.print("[HEARTBEAT] Falha no envio do ping. Status HTTP: ");
    Serial.println(httpCode);
    
    // Se receber 404 ou 400, força um recadastro na próxima rodada
    if (httpCode == 404 || httpCode == 400) {
      isRegistered = false;
    }
  }

  http.end();
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n--- ESP-01s: Chaveiro de Presença Iniciado ---");

  // Configura Wi-Fi em modo Estação (STA)
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  
  Serial.print("Conectando à rede oculta: ");
  Serial.println(GATEWAY_SSID);

  // Inicia conexão com a rede oculta do ESP32
  WiFi.begin(GATEWAY_SSID, GATEWAY_PASS);
}

void loop() {
  // 1. Gerenciamento de Conexão Wi-Fi (Proximidade)
  if (WiFi.status() != WL_CONNECTED) {
    if (isRegistered) {
      Serial.println("\n[SINAL PERDIDO] Chaveiro fora de alcance. Tentando reconectar...");
      isRegistered = false; // Força recadastro quando o sinal voltar
    }
    
    // Aguarda o Wi-Fi reconectar automaticamente
    delay(1000);
    return;
  }

  // 2. Tenta o registro inicial assim que conectar na rede do ESP32
  if (!isRegistered) {
    isRegistered = registerWithGateway();
    if (!isRegistered) {
      delay(2000); // Aguarda antes de tentar registrar novamente
      return;
    }
  }

  // 3. Loop periódico do Heartbeat (3 em 3 segundos)
  unsigned long currentMillis = millis();
  if (currentMillis - lastPingTime >= PING_INTERVAL) {
    lastPingTime = currentMillis;
    sendHeartbeat();
  }
}
