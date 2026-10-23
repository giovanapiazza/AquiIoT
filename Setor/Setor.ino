#include <WiFi.h>
#include <WebServer.h>
#include <DHT.h>
#include <esp_arduino_version.h>

const char* ID_SETOR = "SETOR_01";
const char* NOME_SETOR = "Setor 01";
const char* ESP_ID = "ESP32-01";
const char* NOME_REDE = "AquiIoT_Setor_01";
const char* SENHA_REDE = "12345678"; // minimo 8 caracteres
const char* CHAVE_BUZZER = "MUDE_ESTA_CHAVE_PRIVADA_DO_BUZZER";
const char* CHAVE_DISPOSITIVO = "MUDE_ESTA_CHAVE_DOS_CHAVEIROS";
const uint8_t CANAL_WIFI = 6;

const int PINO_LDR = 34;        // ADC1 / divisor de tensao
const int PINO_MICROFONE = 35;  // ADC1 / AO do modulo de microfone
const int PINO_DHT = 32;        // Dados digitais DHT11
const int PINO_BUZZER = 25;
const bool HABILITAR_BUZZER = false;
const bool BUZZER_PASSIVO = true;
const unsigned long TEMPO_BIP_MS = 250;

const unsigned long INTERVALO_SENSORES_MS = 5000;
const unsigned long JANELA_MIC_MS = 25;
const unsigned long INTERVALO_VERIFICAR_AP_MS = 10000;
const unsigned long PRESENCA_EXPIRA_MS = 15000;
const int MAX_CHAVEIROS = 8;

WebServer servidor(80);
DHT dht(PINO_DHT, DHT11);

int ldrAdc = 0;
int microfoneAdc = 0;
int variacaoMicrofone = 0;
bool microfoneSaturado = false;  
float temperatura = NAN;
float umidade = NAN;
bool dhtValido = false;
unsigned long falhasDht = 0;
unsigned long ultimaLeituraMs = 0;
unsigned long ultimaTentativaAPMs = 0;
bool leiturasDisponiveis = false;
bool apIniciado = false;

bool buzzerPronto = false;
bool bipAtivo = false;
unsigned long inicioBipMs = 0;

struct Chaveiro {
  String id;
  int rssi = 0;                // informado pelo chaveiro
  unsigned long vistoMs = 0;
  bool utilizado = false;
};
Chaveiro chaveiros[MAX_CHAVEIROS];

bool chaveiroPresente(const Chaveiro& c);
int contarChaveiros();
void enviarDadosSerial();

int medirVariacaoSom() {
  int minimo = 4095;
  int maximo = 0;
  const unsigned long inicio = millis();
  while (millis() - inicio < JANELA_MIC_MS) {
    int v = analogRead(PINO_MICROFONE);
    if (v < minimo) minimo = v;
    if (v > maximo) maximo = v;
    delayMicroseconds(120);
  }
  return maximo - minimo;
}

void lerSensores() {
  ldrAdc = analogRead(PINO_LDR);
  microfoneAdc = analogRead(PINO_MICROFONE);
  variacaoMicrofone = medirVariacaoSom();
  microfoneSaturado = microfoneAdc == 0 || microfoneAdc == 4095;

  const float t = dht.readTemperature();
  const float u = dht.readHumidity();
  dhtValido = !isnan(t) && !isnan(u);
  if (dhtValido) {
    temperatura = t;
    umidade = u;
  } else {
    temperatura = NAN;
    umidade = NAN;
    falhasDht++;
  }

  ultimaLeituraMs = millis();
  leiturasDisponiveis = true;

  Serial.printf("[SENSORES] LDR: %d | MIC: %d | Variacao: %d",
                ldrAdc, microfoneAdc, variacaoMicrofone);
  if (microfoneSaturado) Serial.print(" [VERIFICAR MICROFONE]");
  if (dhtValido) {
    Serial.printf(" | DHT11: %.1f C / %.1f %%", temperatura, umidade);
  } else {
    Serial.print(" | DHT11: sem leitura");
  }
  Serial.printf(" | Clientes Wi-Fi: %u", WiFi.softAPgetStationNum());
  Serial.printf(" | Chaveiros presentes: %d", contarChaveiros());
  Serial.println(" (zero e normal)");
}


bool idValido(const String& id) {
  if (id.length() != 8) return false;
  for (unsigned int i = 0; i < id.length(); i++) {
    if (id[i] < '0' || id[i] > '9') return false;
  }
  return true;
}

bool chaveiroPresente(const Chaveiro& c) {
  return c.utilizado && (millis() - c.vistoMs < PRESENCA_EXPIRA_MS);
}

int contarChaveiros() {
  int quantidade = 0;
  for (const Chaveiro& c : chaveiros) if (chaveiroPresente(c)) quantidade++;
  return quantidade;
}

void registrarPresenca() {
  if (servidor.header("X-Device-Key") != CHAVE_DISPOSITIVO) {
    servidor.send(401, "text/plain", "Chave do dispositivo incorreta.");
    return;
  }
  const String id = servidor.arg("id");
  const String rssiStr = servidor.arg("rssi");
  const int rssi = rssiStr.toInt();
  if (!idValido(id) || rssiStr.length() == 0 ||
      rssi < -120 || rssi > -1) {
    servidor.send(400, "text/plain", "Informe id com 8 digitos e RSSI valido (-120 a -1).");
    return;
  }

  Chaveiro* destino = nullptr;
  for (Chaveiro& c : chaveiros) {
    if (c.utilizado && c.id == id) { destino = &c; break; }
  }
  if (destino == nullptr) {
    for (Chaveiro& c : chaveiros) {
      if (!chaveiroPresente(c)) { destino = &c; break; }
    }
  }
  if (destino == nullptr) {
    servidor.send(503, "text/plain", "Limite temporario de chaveiros atingido.");
    return;
  }
  const bool novo = !destino->utilizado || destino->id != id || !chaveiroPresente(*destino);
  destino->utilizado = true;
  destino->id = id;
  destino->rssi = rssi;
  destino->vistoMs = millis();
  if (novo) Serial.printf("[PRESENCA] Chaveiro %s, RSSI informado %d dBm\n", id.c_str(), rssi);
  servidor.send(200, "text/plain", "Presenca atualizada.");
}

void buzzerSaida(bool ligar) {
  if (!buzzerPronto) return;
  if (BUZZER_PASSIVO) {
#if ESP_ARDUINO_VERSION_MAJOR >= 3
    ledcWriteTone(PINO_BUZZER, ligar ? 2000 : 0);
#else
    ledcWriteTone(0, ligar ? 2000 : 0);
#endif
  } else {
    digitalWrite(PINO_BUZZER, ligar ? HIGH : LOW);
  }
}

void iniciarBip() {
  buzzerSaida(true);
  bipAtivo = true;
  inicioBipMs = millis();
}

void acionarBuzzerHttp() {
  if (servidor.header("X-API-Key") != CHAVE_BUZZER) {
    servidor.send(401, "text/plain", "Chave do buzzer incorreta.");
    return;
  }
  if (!buzzerPronto) {
    servidor.send(503, "text/plain", "Buzzer desabilitado ate confirmar circuito.");
    return;
  }
  iniciarBip();
  servidor.send(200, "text/plain", "Bip autorizado (250 ms).");
}


void enviarSaude() {
  String j;
  j.reserve(230);
  j += "{\"setor\":\"" + String(ID_SETOR) + "\",\"status\":\"RESPONDENDO\",";
  j += "\"esp32\":\"" + String(ESP_ID) + "\",";
  j += "\"uptime_ms\":" + String(millis()) + ",";
  j += "\"ultima_leitura_ms\":" + String(ultimaLeituraMs) + ",";
  j += "\"clientes_wifi\":" + String(WiFi.softAPgetStationNum()) + "}";
  servidor.sendHeader("Cache-Control", "no-store");
  servidor.send(200, "application/json; charset=utf-8", j);
}

void enviarDados() {
  String j;
  j.reserve(950);
  j += "{\"setor\":\"" + String(ID_SETOR) + "\",";
  j += "\"luminosidade_adc\":" + String(ldrAdc) + ",";
  j += "\"som_adc\":" + String(microfoneAdc) + ",";
  j += "\"som_variacao\":" + String(variacaoMicrofone) + ",";
  j += "\"som_saturado\":";
  j += (microfoneSaturado ? "true" : "false");
  j += ",\"dht_valido\":";
  j += (dhtValido ? "true" : "false");
  j += ",\"temperatura_c\":";
  j += (dhtValido ? String(temperatura, 1) : "null");
  j += ",\"umidade_percentual\":";
  j += (dhtValido ? String(umidade, 1) : "null");
  j += ",\"falhas_dht\":" + String(falhasDht) + ",";
  j += "\"ultima_leitura_ms\":" + String(ultimaLeituraMs) + ",";
  j += "\"uptime_ms\":" + String(millis()) + ",";
  j += "\"clientes_wifi\":" + String(WiFi.softAPgetStationNum()) + ",";
  j += "\"buzzer_ativo\":";
  j += (bipAtivo ? "true" : "false");
  j += ",\"chaveiros\":[";
  bool primeiro = true;
  for (const Chaveiro& c : chaveiros) {
    if (!chaveiroPresente(c)) continue;
    if (!primeiro) j += ',';
    primeiro = false;
    j += "{\"id\":\"" + c.id + "\",\"rssi_dbm\":" + String(c.rssi) + "}";
  }
  j += "]}";
  servidor.sendHeader("Cache-Control", "no-store");
  servidor.send(200, "application/json; charset=utf-8", j);
}

void iniciarAP() {
  ultimaTentativaAPMs = millis();
  WiFi.mode(WIFI_AP);
  apIniciado = WiFi.softAP(NOME_REDE, SENHA_REDE, CANAL_WIFI);
  if (apIniciado) {
    Serial.print("[WIFI] Ponto de acesso inicializado em ");
    Serial.println(WiFi.softAPIP());
  } else {
    Serial.println("[WIFI] Falha ao iniciar AP; nova tentativa em 10 segundos.");
  }
}

void verificarAP() {
  if (millis() - ultimaTentativaAPMs < INTERVALO_VERIFICAR_AP_MS) return;
  const bool modoApAtivo = ((WiFi.getMode() & WIFI_AP) != 0);
  if (!apIniciado || !modoApAtivo) {
    Serial.println("[WIFI] AP inativo localmente; tentando reiniciar...");
    iniciarAP();
  }
  ultimaTentativaAPMs = millis();
}

void statusSerial() {
  Serial.printf("[SETOR] %s | AP: %s | Clientes: %u | Chaveiros presentes: %d | Uptime: %lu s\n",
                ID_SETOR, apIniciado ? "iniciado" : "nao iniciado",
                WiFi.softAPgetStationNum(), contarChaveiros(),
                millis() / 1000UL);
  Serial.printf("[SENSORES] LDR=%d | MIC=%d (variacao=%d) | DHT11=",
                ldrAdc, microfoneAdc, variacaoMicrofone);
  if (dhtValido) Serial.printf("%.1f C / %.1f %%\n", temperatura, umidade);
  else Serial.println("indisponivel");
  Serial.println("[INFO] ESP32 em execucao != garantia de que outro dispositivo recebe seu Wi-Fi.");
}

void comandosSerial() {
  static String linha;
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\r') continue;
    if (c != '\n') {
      if (linha.length() < 45) linha += c;
      continue;
    }
    linha.trim();
    linha.toUpperCase();
    if (linha == "STATUS") statusSerial();
    else if (linha == "JSON") enviarDadosSerial();
    else if (linha == "BIP") {
      if (buzzerPronto) iniciarBip();
      else Serial.println("[BUZZER] Desabilitado. Verifique o circuito antes de ativar.");
    } else if (linha == "AJUDA") {
      Serial.println("Comandos: STATUS, JSON, BIP, AJUDA");
    } else if (linha.length() > 0) {
      Serial.println("Comando desconhecido. Digite AJUDA.");
    }
    linha = "";
  }
}

void enviarDadosSerial() {
  Serial.printf("{\"setor\":\"%s\",\"luminosidade_adc\":%d,\"som_adc\":%d,",
                ID_SETOR, ldrAdc, microfoneAdc);
  Serial.print("\"temperatura_c\":");
  if (dhtValido) Serial.print(temperatura, 1); else Serial.print("null");
  Serial.print(",\"umidade_percentual\":");
  if (dhtValido) Serial.print(umidade, 1); else Serial.print("null");
  Serial.printf(",\"chaveiros_presentes\":%d}\n", contarChaveiros());
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== AQUIIOT | SETOR 01 | TESTE LOCAL ===");

  analogReadResolution(12);
  pinMode(PINO_LDR, INPUT);
  pinMode(PINO_MICROFONE, INPUT);
  dht.begin(); // A biblioteca DHT usa INPUT_PULLUP internamente.

  pinMode(PINO_BUZZER, OUTPUT);
  digitalWrite(PINO_BUZZER, LOW);
  if (HABILITAR_BUZZER) {
    if (BUZZER_PASSIVO) {
#if ESP_ARDUINO_VERSION_MAJOR >= 3
      buzzerPronto = ledcAttach(PINO_BUZZER, 2000, 8);
#else
      buzzerPronto = (ledcSetup(0, 2000, 8) > 0);
      if (buzzerPronto) ledcAttachPin(PINO_BUZZER, 0);
#endif
    } else {
      buzzerPronto = true;
    }
  }

  iniciarAP();
  const char* cabecalhos[] = {"X-API-Key", "X-Device-Key"};
  servidor.collectHeaders(cabecalhos, 2);
  servidor.on("/saude", HTTP_GET, enviarSaude);
  servidor.on("/dados", HTTP_GET, enviarDados);
  servidor.on("/presenca", HTTP_POST, registrarPresenca);
  servidor.on("/apitar", HTTP_POST, acionarBuzzerHttp);
  servidor.on("/", HTTP_GET, []() {
    servidor.send(200, "text/plain; charset=utf-8",
      "AquiIoT - Setor 01. APIs: GET /saude, GET /dados. Testes via Monitor Serial.");
  });
  servidor.onNotFound([]() {
    servidor.send(404, "text/plain", "Rota inexistente.");
  });
  servidor.begin();

  lerSensores();
  Serial.println("[TESTE] Monitor Serial em 115200, final de linha = Nova linha.");
  Serial.println("[TESTE] Comandos: STATUS, JSON, BIP, AJUDA.");
  Serial.println("[INFO] Nao ha necessidade de interface ou script Python para ler sensores.");
}

void loop() {
  servidor.handleClient();
  comandosSerial();
  verificarAP();

  if (millis() - ultimaLeituraMs >= INTERVALO_SENSORES_MS) {
    lerSensores();
  }
  if (bipAtivo && millis() - inicioBipMs >= TEMPO_BIP_MS) {
    buzzerSaida(false);
    bipAtivo = false;
  }
}
