// ESP32 de teste local do AquiIoT
// Usa o Wi-Fi em dois modos ao mesmo tempo:
// - cria a rede invisivel dos chaveiros (AquiIoT_Setor_01, IP 192.168.4.1) e
//   recebe POST /presenca, como o esp32_setor.ino. Os valores sao os padroes
//   do firmware do chaveiro, entao a aba Basica de "Gravar chaveiro" ja serve;
// - conecta na rede do computador (a22) e envia ao backend do ambiente de
//   desenvolvimento (podman compose up, porta 3000) no padrao PPSSAATTNN.
// O radio e um so: a rede dos chaveiros passa a usar o canal da a22.
//
// O loop repete, sem bloquear:
//   1. atende os chaveiros e o servidor (HTTP);
//   2. confere quem continua conectado: um chaveiro sai quando o Wi-Fi avisa
//      que ele desconectou ou quando fica PRESENCA_EXPIRA_MS sem mandar nada;
//   3. le os sensores;
//   4. envia ao banco uma coisa por vez: saidas, presencas, sensores.
// Avisos do servidor chegam em POST /aviso (interrupcao por software): o
// handler so guarda o aviso e o loop chama tratarAviso() na volta seguinte.
// Sem HTTPS: so para testes.
#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <DHT.h>
#include <esp_wifi.h>
#include <esp_wifi_ap_get_sta_list.h>

#if __has_include("segredos.h")
#include "segredos.h"
#else
#error "Copie segredos.exemplo.h para segredos.h e preencha a rede e o IP do computador."
#endif

// Area deste ESP32: PPSSAA (01 hospital, 03 enfermaria, 02 ala B)
const char* CODIGO_LOCAL = "010302";
const char* ESP_ID = "0103020201"; // PPSSAA + TT 02 (ESP32) + NN 01
// Rede dos chaveiros: iguais aos PADRAO_* de chaveiro_configuravel.ino
const char* NOME_REDE_CHAVEIROS = "AquiIoT_Setor_01";
const char* SENHA_REDE_CHAVEIROS = "12345678";
const bool REDE_INVISIVEL = true; // nao aparece na lista de redes
const int MAX_CLIENTES_WIFI = 4;
const char* CHAVE_DISPOSITIVO = "MUDE_ESTA_CHAVE_DOS_CHAVEIROS";
// Exigida em POST /aviso, para so o servidor mandar avisos
const char* CHAVE_SERVIDOR = "MUDE_ESTA_CHAVE_DO_SERVIDOR";

// Sensores (mesmos pinos do esp32_setor.ino); false = nao le nem envia
const bool HABILITAR_SENSORES = true;
const int PINO_LDR = 34;       // ADC1 / divisor de tensao
const int PINO_MICROFONE = 35; // ADC1 / AO do modulo de microfone
const int PINO_DHT = 32;       // dados do DHT11
const unsigned long INTERVALO_SENSORES_MS = 5000;
const unsigned long INTERVALO_ENVIO_SENSORES_MS = 30000;
const unsigned long JANELA_MIC_MS = 25;

// Chaveiro simulado (TTNN); deixe SIMULAR_CHAVEIRO false para so usar reais
const bool SIMULAR_CHAVEIRO = false;
const char* CHAVEIRO_SIMULADO = "0399";
const char* NOME_SIMULADO = "Usuario de teste";

// O chaveiro manda presenca a cada 5 s; 3 envios perdidos = saiu
const unsigned long PRESENCA_EXPIRA_MS = 15000;
const unsigned long INTERVALO_ENVIO_MS = 10000; // por chaveiro; backend marca offline apos 120 s
const unsigned long ESPERA_APOS_FALHA_MS = 5000;
const int MAX_CHAVEIROS = 8;

struct Chaveiro {
  String id;
  String nome; // nome do usuario gravado no chaveiro (opcional)
  int rssi = 0;
  uint8_t mac[6] = {0};
  bool temMac = false;
  bool presente = false;
  bool saidaPendente = false; // saiu e o banco ainda nao sabe
  unsigned long vistoMs = 0;
  unsigned long enviadoMs = 0;
  bool enviado = false;
};
Chaveiro chaveiros[MAX_CHAVEIROS];

WebServer servidor(80);
DHT dht(PINO_DHT, DHT11);
bool areaRegistrada = false;
bool ipInformado = false;
unsigned long ultimaFalhaMs = 0;
bool houveFalha = false;
bool estavaConectado = false;

// Desconexoes avisadas pelo Wi-Fi (callback de outra tarefa: so enfileira)
const int MAX_DESCONEXOES = 8;
uint8_t macsDesconectados[MAX_DESCONEXOES][6];
volatile uint8_t desconexoesEscritas = 0;
uint8_t desconexoesLidas = 0;
portMUX_TYPE travaDesconexoes = portMUX_INITIALIZER_UNLOCKED;

// Aviso do servidor: o handler HTTP preenche e o loop trata
volatile bool avisoPendente = false;
String textoAviso;

struct Leitura {
  bool valida = false;
  float temperatura = NAN;
  float umidade = NAN;
  int luminosidade = 0;
  int som = 0;
} leitura;
unsigned long ultimaLeituraMs = 0;
unsigned long ultimoEnvioSensoresMs = 0;

bool idValido(const String& id) {
  if (id.length() != 4) return false;
  for (char c : id) if (c < '0' || c > '9') return false;
  return true;
}

// ==========================================
// CONEXAO DOS CHAVEIROS
// ==========================================
void eventoWifi(WiFiEvent_t evento, WiFiEventInfo_t info) {
  if (evento != ARDUINO_EVENT_WIFI_AP_STADISCONNECTED) return;
  portENTER_CRITICAL(&travaDesconexoes);
  memcpy(macsDesconectados[desconexoesEscritas % MAX_DESCONEXOES], info.wifi_ap_stadisconnected.mac, 6);
  desconexoesEscritas = desconexoesEscritas + 1;
  portEXIT_CRITICAL(&travaDesconexoes);
}

// MAC do cliente da rede dos chaveiros que tem este IP
bool macDoIp(IPAddress ip, uint8_t mac[6]) {
  wifi_sta_list_t estacoes;
  wifi_sta_mac_ip_list_t lista;
  if (esp_wifi_ap_get_sta_list(&estacoes) != ESP_OK) return false;
  if (esp_wifi_ap_get_sta_list_with_ip(&estacoes, &lista) != ESP_OK) return false;
  for (int i = 0; i < lista.num; i++) {
    if (lista.sta[i].ip.addr == static_cast<uint32_t>(ip)) {
      memcpy(mac, lista.sta[i].mac, 6);
      return true;
    }
  }
  return false;
}

void marcarSaida(Chaveiro& c, const char* motivo) {
  if (!c.presente) return;
  c.presente = false;
  c.temMac = false;
  // So avisa o banco se ele chegou a saber que o chaveiro estava aqui
  c.saidaPendente = c.enviado;
  Serial.printf("[SAIDA] Chaveiro %s%s (%s) %s.\n", CODIGO_LOCAL, c.id.c_str(), c.nome.c_str(), motivo);
}

void atualizarChaveiro(const String& id, int rssi, const String& nome, IPAddress ip) {
  Chaveiro* destino = nullptr;
  for (Chaveiro& c : chaveiros) {
    if (c.id == id) { destino = &c; break; }
  }
  if (destino == nullptr) {
    // Vaga livre: nunca usada, ou de um chaveiro que saiu e o banco ja sabe
    for (Chaveiro& c : chaveiros) {
      if (c.id.length() == 0 || (!c.presente && !c.saidaPendente)) { destino = &c; break; }
    }
    if (destino == nullptr) return;
    destino->id = id;
    destino->presente = false;
  }
  if (!destino->presente) {
    Serial.printf("[ENTRADA] Chaveiro %s%s (%s), RSSI %d dBm\n", CODIGO_LOCAL, id.c_str(), nome.c_str(), rssi);
    destino->enviado = false; // avisa o banco logo
    destino->saidaPendente = false;
  }
  if (destino->nome != nome) destino->enviado = false; // envia o nome novo logo
  destino->presente = true;
  destino->nome = nome;
  destino->rssi = rssi;
  destino->vistoMs = millis();
  if (ip != IPAddress()) destino->temMac = macDoIp(ip, destino->mac);
}

void verificarConexoes() {
  // Desconexoes avisadas pelo Wi-Fi: saida imediata
  while (desconexoesLidas != desconexoesEscritas) {
    uint8_t mac[6];
    portENTER_CRITICAL(&travaDesconexoes);
    memcpy(mac, macsDesconectados[desconexoesLidas % MAX_DESCONEXOES], 6);
    portEXIT_CRITICAL(&travaDesconexoes);
    desconexoesLidas++;
    for (Chaveiro& c : chaveiros) {
      if (c.presente && c.temMac && memcmp(c.mac, mac, 6) == 0) marcarSaida(c, "desconectou do Wi-Fi");
    }
  }
  // Sem desconexao avisada (ex.: bateria acabou longe): saida por tempo
  for (Chaveiro& c : chaveiros) {
    if (c.presente && millis() - c.vistoMs >= PRESENCA_EXPIRA_MS) marcarSaida(c, "parou de responder");
  }
}

// ==========================================
// SENSORES
// ==========================================
void lerSensores() {
  if (!HABILITAR_SENSORES || millis() - ultimaLeituraMs < INTERVALO_SENSORES_MS) return;
  ultimaLeituraMs = millis();
  leitura.luminosidade = analogRead(PINO_LDR);
  // Som: variacao pico a pico numa janela curta
  int minimo = 4095, maximo = 0;
  const unsigned long inicio = millis();
  while (millis() - inicio < JANELA_MIC_MS) {
    const int v = analogRead(PINO_MICROFONE);
    minimo = min(minimo, v);
    maximo = max(maximo, v);
  }
  leitura.som = maximo - minimo;
  leitura.temperatura = dht.readTemperature();
  leitura.umidade = dht.readHumidity();
  leitura.valida = true;
  Serial.printf("[SENSORES] LDR %d | som %d | DHT11 ", leitura.luminosidade, leitura.som);
  if (isnan(leitura.temperatura)) Serial.println("sem leitura");
  else Serial.printf("%.1f C / %.1f %%\n", leitura.temperatura, leitura.umidade);
}

// ==========================================
// AVISOS DO SERVIDOR
// ==========================================
void receberAviso() {
  if (servidor.header("X-API-Key") != CHAVE_SERVIDOR) {
    servidor.send(401, "text/plain", "Chave do servidor incorreta.");
    return;
  }
  // Aceita form (mensagem=...) ou o corpo inteiro como texto
  const String texto = servidor.hasArg("mensagem") ? servidor.arg("mensagem") : servidor.arg("plain");
  if (texto.length() == 0 || texto.length() > 200) {
    servidor.send(400, "text/plain", "Envie a mensagem do aviso (ate 200 caracteres).");
    return;
  }
  if (avisoPendente) {
    servidor.send(503, "text/plain", "Aviso anterior ainda em tratamento.");
    return;
  }
  textoAviso = texto;
  avisoPendente = true;
  servidor.send(202, "text/plain", "Aviso recebido.");
}

// Ponto para implementar os avisos (buzzer, LED, display...)
void tratarAviso(const String& texto) {
  Serial.printf("[AVISO] Servidor: %s\n", texto.c_str());
}

// ==========================================
// ENVIO AO BACKEND
// ==========================================
int postarJson(const char* caminho, const String& corpo) {
  WiFiClient cliente;
  HTTPClient http;
  if (!http.begin(cliente, String(URL_BACKEND) + caminho)) return -1;
  http.setConnectTimeout(3000);
  http.setTimeout(3000);
  http.addHeader("Content-Type", "application/json");
  const int codigo = http.POST(corpo);
  // 409 no cadastro da area e esperado (ja cadastrada)
  if (codigo >= 400 && codigo != 409) {
    Serial.printf("[BACKEND] %s -> HTTP %d: %s\n", caminho, codigo, http.getString().c_str());
  } else if (codigo < 0) {
    Serial.printf("[BACKEND] %s -> %s (confira URL_BACKEND e o firewall da porta 3000)\n", caminho,
                  HTTPClient::errorToString(codigo).c_str());
  }
  http.end();
  if (codigo < 0 || codigo >= 500) {
    houveFalha = true;
    ultimaFalhaMs = millis();
  }
  return codigo;
}

// Texto como string JSON (o nome do usuario pode ter aspas ou acentos)
String textoJson(const String& texto) {
  String r = "\"";
  for (unsigned int i = 0; i < texto.length(); i++) {
    const char c = texto[i];
    if (c == '"' || c == '\\') { r += '\\'; r += c; }
    else if (static_cast<unsigned char>(c) >= 0x20) r += c;
  }
  return r + "\"";
}

String numeroJson(float valor) { return isnan(valor) ? "null" : String(valor, 1); }

// 2xx = aceito; 4xx = recusado, reenviar nao adianta
bool concluido(int codigo) { return codigo >= 200 && codigo < 500; }

bool enviarSaida() {
  for (Chaveiro& c : chaveiros) {
    if (!c.saidaPendente) continue;
    const String codigoCompleto = String(CODIGO_LOCAL) + c.id;
    const int codigo = postarJson("/api/saida", "{\"codigo\":\"" + codigoCompleto + "\",\"esp32\":\"" +
                                                     String(ESP_ID) + "\"}");
    if (concluido(codigo)) {
      c.saidaPendente = false;
      c.enviado = false;
      if (codigo < 300) Serial.printf("[BACKEND] Saida de %s enviada.\n", codigoCompleto.c_str());
    }
    return true;
  }
  return false;
}

bool enviarPresenca() {
  for (Chaveiro& c : chaveiros) {
    if (!c.presente) continue;
    if (c.enviado && millis() - c.enviadoMs < INTERVALO_ENVIO_MS) continue;
    const String codigoCompleto = String(CODIGO_LOCAL) + c.id;
    String j = "{\"codigo\":\"" + codigoCompleto + "\",\"esp32\":\"" + String(ESP_ID) +
               "\",\"rssi\":" + String(c.rssi);
    if (c.nome.length()) j += ",\"nome\":" + textoJson(c.nome);
    j += "}";
    const int codigo = postarJson("/api/localizacao", j);
    if (concluido(codigo)) {
      c.enviado = true;
      c.enviadoMs = millis();
      if (codigo < 300) Serial.printf("[BACKEND] %s enviado (RSSI %d).\n", codigoCompleto.c_str(), c.rssi);
    }
    return true;
  }
  return false;
}

bool enviarSensores() {
  if (!leitura.valida) return false;
  if (ultimoEnvioSensoresMs != 0 && millis() - ultimoEnvioSensoresMs < INTERVALO_ENVIO_SENSORES_MS) return false;
  String j = "{\"tipo\":\"leitura_setor\",\"setor\":\"" + String(CODIGO_LOCAL) +
             "\",\"mensagem\":\"Leitura dos sensores do setor.\",\"detalhes\":{\"esp32\":\"" + String(ESP_ID) +
             "\",\"temperatura_c\":" + numeroJson(leitura.temperatura) +
             ",\"umidade_percentual\":" + numeroJson(leitura.umidade) +
             ",\"luminosidade_adc\":" + String(leitura.luminosidade) +
             ",\"som_variacao\":" + String(leitura.som) + "}}";
  if (concluido(postarJson("/api/eventos", j))) ultimoEnvioSensoresMs = millis();
  return true;
}

// Uma requisicao por volta do loop, para nao travar o servidor dos chaveiros
void enviarAoBackend() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (houveFalha && millis() - ultimaFalhaMs < ESPERA_APOS_FALHA_MS) return;
  if (!areaRegistrada) {
    String j = "{\"codigo\":\"" + String(CODIGO_LOCAL) + "\",\"esp32\":\"" + String(ESP_ID) + "\"}";
    const int codigo = postarJson("/api/setores", j);
    if (concluido(codigo)) {
      areaRegistrada = true; // 409: ja cadastrada, tambem serve
      Serial.printf("[BACKEND] Area %s pronta.\n", CODIGO_LOCAL);
    }
    return;
  }
  if (!ipInformado) {
    // O servidor descobre aqui onde mandar os avisos (POST http://<ip>/aviso)
    String j = "{\"tipo\":\"esp32_online\",\"setor\":\"" + String(CODIGO_LOCAL) +
               "\",\"mensagem\":\"ESP32 conectado.\",\"detalhes\":{\"esp32\":\"" + String(ESP_ID) +
               "\",\"ip\":\"" + WiFi.localIP().toString() + "\"}}";
    if (concluido(postarJson("/api/eventos", j))) ipInformado = true;
    return;
  }
  // Prioridade: saidas (para a interface atualizar logo), presencas, sensores
  if (enviarSaida()) return;
  if (enviarPresenca()) return;
  enviarSensores();
}

// ==========================================
// HTTP LOCAL
// ==========================================
void receberPresenca() {
  if (servidor.header("X-Device-Key") != CHAVE_DISPOSITIVO) {
    servidor.send(401, "text/plain", "Chave do dispositivo incorreta.");
    return;
  }
  const String id = servidor.arg("id");
  const int rssi = servidor.arg("rssi").toInt();
  const String nome = servidor.arg("nome");
  if (!idValido(id) || rssi < -120 || rssi > -1 || nome.length() > 32) {
    servidor.send(400, "text/plain", "Informe id com 4 digitos (TTNN) e RSSI valido (-120 a -1).");
    return;
  }
  atualizarChaveiro(id, rssi, nome, servidor.client().remoteIP());
  servidor.send(200, "text/plain", "Presenca atualizada.");
}

void mostrarEstado() {
  String t = "ESP32 de teste AquiIoT " + String(ESP_ID) + "\nBackend: " + URL_BACKEND +
             "\nClientes na rede dos chaveiros: " + String(WiFi.softAPgetStationNum()) + "\n";
  for (const Chaveiro& c : chaveiros) {
    if (c.presente) t += String(CODIGO_LOCAL) + c.id + " RSSI " + String(c.rssi) + " " + c.nome + "\n";
  }
  if (HABILITAR_SENSORES && leitura.valida) {
    t += "Sensores: LDR " + String(leitura.luminosidade) + ", som " + String(leitura.som) + ", " +
         numeroJson(leitura.temperatura) + " C, " + numeroJson(leitura.umidade) + " %\n";
  }
  servidor.send(200, "text/plain", t);
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.printf("\n=== ESP32 de teste AquiIoT %s ===\n", ESP_ID);
  Serial.printf("Backend: %s\n", URL_BACKEND);

  if (HABILITAR_SENSORES) {
    analogReadResolution(12);
    dht.begin();
  }

  WiFi.onEvent(eventoWifi);
  WiFi.mode(WIFI_AP_STA);
  if (WiFi.softAP(NOME_REDE_CHAVEIROS, SENHA_REDE_CHAVEIROS, 1, REDE_INVISIVEL, MAX_CLIENTES_WIFI)) {
    Serial.printf("[AP] Rede %s dos chaveiros (%s) em %s\n", NOME_REDE_CHAVEIROS,
                  REDE_INVISIVEL ? "invisivel" : "visivel", WiFi.softAPIP().toString().c_str());
  } else {
    Serial.println("[AP] Falha ao criar a rede dos chaveiros.");
  }
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_SENHA);

  const char* cabecalhos[] = {"X-Device-Key", "X-API-Key"};
  servidor.collectHeaders(cabecalhos, 2);
  servidor.on("/presenca", HTTP_POST, receberPresenca);
  servidor.on("/aviso", HTTP_POST, receberAviso);
  servidor.on("/", HTTP_GET, mostrarEstado);
  servidor.begin();
}

void loop() {
  servidor.handleClient();

  if (avisoPendente) {
    const String texto = textoAviso;
    avisoPendente = false;
    tratarAviso(texto);
  }

  if (WiFi.status() == WL_CONNECTED && !estavaConectado) {
    estavaConectado = true;
    ipInformado = false; // o IP pode ter mudado
    Serial.printf("[WIFI] Conectado a %s. IP: %s\n", WIFI_SSID, WiFi.localIP().toString().c_str());
    Serial.printf("[WIFI] Rede dos chaveiros no canal %d. Avisos: POST http://%s/aviso\n", WiFi.channel(),
                  WiFi.localIP().toString().c_str());
  } else if (WiFi.status() != WL_CONNECTED && estavaConectado) {
    estavaConectado = false;
    Serial.println("[WIFI] Conexao com a a22 perdida, tentando reconectar...");
  }

  if (SIMULAR_CHAVEIRO) {
    atualizarChaveiro(CHAVEIRO_SIMULADO, WiFi.RSSI() < 0 ? WiFi.RSSI() : -50, NOME_SIMULADO, IPAddress());
  }
  verificarConexoes();
  lerSensores();
  enviarAoBackend();
  delay(2);
}
