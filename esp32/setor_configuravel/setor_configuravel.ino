// ESP32 de setor do AquiIoT, configuravel pela interface web
// Mesmo fluxo do esp32_teste_local.ino, mas a identificacao e as redes ficam
// salvas na flash e sao gravadas pelo botao "Adicionar setor" da interface,
// junto com o firmware. Campo vazio usa o padrao deste .bin (PADRAO_*):
//   - aba Basica: so a area (PPSSAA), o numero do ESP32 (NN) e os sensores;
//   - aba Avancada: tudo o que for preenchido.
//
// Usa o Wi-Fi em dois modos ao mesmo tempo:
// - cria a rede invisivel dos chaveiros (padrao AquiIoT_Setor_01, IP
//   192.168.4.1) e recebe POST /presenca;
// - conecta na rede com acesso ao backend e envia no padrao PPSSAATTNN.
// O radio e um so: a rede dos chaveiros passa a usar o canal da outra rede.
//
// O loop repete, sem bloquear:
//   1. atende os chaveiros e o servidor (HTTP);
//   2. confere quem continua conectado: um chaveiro sai quando o Wi-Fi avisa
//      que ele desconectou ou quando fica PRESENCA_EXPIRA_MS sem mandar nada;
//   3. le os sensores;
//   4. envia ao banco uma coisa por vez: saidas, presencas, sensores.
// Avisos do servidor chegam em POST /aviso (interrupcao por software): o
// handler so guarda o aviso e o loop chama tratarAviso() na volta seguinte.
#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <DHT.h>
#include <esp_partition.h>
#include <esp_wifi.h>
#include <esp_wifi_ap_get_sta_list.h>

// Rede com internet e backend padrao vem de segredos.h (fora do Git)
#if __has_include("segredos.h")
#include "segredos.h"
#else
const char* WIFI_SSID = "";
const char* WIFI_SENHA = "";
const char* URL_BACKEND = "";
#endif

// Configuracao pre-determinada (aba Basica)
const char* PADRAO_LOCAL = "010302"; // PPSSAA: 01 hospital, 03 enfermaria, 02 ala B
const char* PADRAO_NUMERO = "01";    // NN do ESP32 na area
const char* PADRAO_REDE_CHAVEIROS = "AquiIoT_Setor_01"; // = PADRAO_REDE do chaveiro
const char* PADRAO_SENHA_CHAVEIROS = "12345678";
const char* PADRAO_CHAVE_DISPOSITIVO = "MUDE_ESTA_CHAVE_DOS_CHAVEIROS";
const char* PADRAO_CHAVE_SERVIDOR = "MUDE_ESTA_CHAVE_DO_SERVIDOR";
const bool PADRAO_SENSORES = true;

const bool REDE_INVISIVEL = true; // a rede dos chaveiros nao aparece na lista
const int MAX_CLIENTES_WIFI = 4;

// Configuracao salva no inicio da particao "spiffs" (0x290000 no esquema
// padrao de 4 MB), que este firmware nao usa como sistema de arquivos.
const uint32_t MAGICO_CONFIG = 0x31534941; // "AIS1"
struct ConfigSetor {
  uint32_t magico;
  char local[7];          // PPSSAA
  char numero[3];         // NN do ESP32; o ID fica PPSSAA + 02 + NN
  char rede[33];          // rede com acesso ao backend
  char senha[65];
  char url[129];          // backend, sem barra no final
  char redeChaveiros[33];
  char senhaChaveiros[65];
  char chave[65];         // X-Device-Key dos chaveiros
  char chaveServidor[65]; // X-API-Key de POST /aviso
  uint8_t sensores;       // 0 = padrao, 1 = ligados, 2 = desligados
  uint32_t soma;
};
// A interface web monta este bloco byte a byte (servidor/front/src/services/serial.js)
static_assert(offsetof(ConfigSetor, soma) == 472 && sizeof(ConfigSetor) == 476,
              "layout da ConfigSetor mudou");
ConfigSetor config;
bool configSalva = false;

// Valores efetivos (salvos ou padrao)
String codigoLocal, espId, redeSta, senhaSta, urlBackend, redeChaveiros, senhaChaveiros,
    chaveDispositivo, chaveServidor;
bool sensoresLigados = PADRAO_SENSORES;

const int PINO_LDR = 34;       // ADC1 / divisor de tensao
const int PINO_MICROFONE = 35; // ADC1 / AO do modulo de microfone
const int PINO_DHT = 32;       // dados do DHT11
const unsigned long INTERVALO_SENSORES_MS = 5000;
const unsigned long INTERVALO_ENVIO_SENSORES_MS = 30000;
const unsigned long JANELA_MIC_MS = 25;

// O chaveiro manda presenca a cada 5 s; 3 envios perdidos = saiu
const unsigned long PRESENCA_EXPIRA_MS = 15000;
const unsigned long INTERVALO_ENVIO_MS = 10000; // por chaveiro; backend marca offline apos 120 s
const unsigned long ESPERA_APOS_FALHA_MS = 5000;
const uint16_t TIMEOUT_BACKEND_MS = 5000; // HTTPS: o handshake TLS leva 1-2 s
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

// ==========================================
// CONFIGURACAO
// ==========================================
uint32_t calcularSoma(const ConfigSetor& c) {
  // FNV-1a sobre tudo menos o proprio campo soma
  const uint8_t* bytes = reinterpret_cast<const uint8_t*>(&c);
  uint32_t soma = 2166136261u;
  for (size_t i = 0; i < offsetof(ConfigSetor, soma); i++) soma = (soma ^ bytes[i]) * 16777619u;
  return soma;
}

bool soDigitos(const char* texto, size_t tamanho) {
  if (strlen(texto) != tamanho) return false;
  for (size_t i = 0; i < tamanho; i++) if (!isdigit(static_cast<unsigned char>(texto[i]))) return false;
  return true;
}

String ouPadrao(const char* valor, const char* padrao) { return String(valor[0] ? valor : padrao); }

void carregarConfiguracao() {
  memset(&config, 0, sizeof(config));
  const esp_partition_t* particao =
      esp_partition_find_first(ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_DATA_SPIFFS, nullptr);
  if (particao && esp_partition_read(particao, 0, &config, sizeof(config)) == ESP_OK) {
    configSalva = config.magico == MAGICO_CONFIG && config.soma == calcularSoma(config);
    Serial.printf("[CONFIG] Particao de configuracao em 0x%06x: %s\n", particao->address,
                  configSalva ? "configuracao salva" : "vazia, usando os padroes");
  } else {
    Serial.println("[CONFIG] Particao de configuracao nao encontrada, usando os padroes.");
  }
  if (!configSalva) memset(&config, 0, sizeof(config));
  // Strings sempre terminadas, mesmo com lixo na flash
  config.local[6] = config.numero[2] = config.rede[32] = config.senha[64] = config.url[128] = '\0';
  config.redeChaveiros[32] = config.senhaChaveiros[64] = config.chave[64] = config.chaveServidor[64] = '\0';

  codigoLocal = soDigitos(config.local, 6) ? config.local : PADRAO_LOCAL;
  espId = codigoLocal + "02" + (soDigitos(config.numero, 2) ? config.numero : PADRAO_NUMERO);
  redeSta = ouPadrao(config.rede, WIFI_SSID);
  senhaSta = ouPadrao(config.senha, WIFI_SENHA);
  urlBackend = ouPadrao(config.url, URL_BACKEND);
  while (urlBackend.endsWith("/")) urlBackend.remove(urlBackend.length() - 1);
  redeChaveiros = ouPadrao(config.redeChaveiros, PADRAO_REDE_CHAVEIROS);
  senhaChaveiros = ouPadrao(config.senhaChaveiros, PADRAO_SENHA_CHAVEIROS);
  chaveDispositivo = ouPadrao(config.chave, PADRAO_CHAVE_DISPOSITIVO);
  chaveServidor = ouPadrao(config.chaveServidor, PADRAO_CHAVE_SERVIDOR);
  sensoresLigados = config.sensores == 0 ? PADRAO_SENSORES : config.sensores == 1;
}

// O endereco de exemplo (SEU_TAILNET) nao e um servidor de verdade
bool backendConfigurado() {
  return redeSta.length() > 0 && urlBackend.length() > 0 && urlBackend.indexOf("SEU_TAILNET") < 0;
}

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
  Serial.printf("[SAIDA] Chaveiro %s%s (%s) %s.\n", codigoLocal.c_str(), c.id.c_str(), c.nome.c_str(), motivo);
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
    Serial.printf("[ENTRADA] Chaveiro %s%s (%s), RSSI %d dBm\n", codigoLocal.c_str(), id.c_str(), nome.c_str(), rssi);
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
  if (!sensoresLigados || millis() - ultimaLeituraMs < INTERVALO_SENSORES_MS) return;
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
  if (servidor.header("X-API-Key") != chaveServidor) {
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
  const String url = urlBackend + caminho;
  WiFiClient clienteHttp;
  WiFiClientSecure clienteHttps;
  // setInsecure() nao confere o certificado (bom para testes); para validar,
  // troque por clienteHttps.setCACert(<raiz ISRG Root X1 em PEM>).
  clienteHttps.setInsecure();
  HTTPClient http;
  const bool https = url.startsWith("https://");
  if (!(https ? http.begin(clienteHttps, url) : http.begin(clienteHttp, url))) return -1;
  http.setConnectTimeout(TIMEOUT_BACKEND_MS);
  http.setTimeout(TIMEOUT_BACKEND_MS);
  http.addHeader("Content-Type", "application/json");
  const int codigo = http.POST(corpo);
  // 409 no cadastro da area e esperado (ja cadastrada)
  if (codigo >= 400 && codigo != 409) {
    Serial.printf("[BACKEND] %s -> HTTP %d: %s\n", caminho, codigo, http.getString().c_str());
  } else if (codigo < 0) {
    Serial.printf("[BACKEND] %s -> %s (confira a URL do backend e o firewall)\n", caminho,
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
    const String codigoCompleto = codigoLocal + c.id;
    const int codigo =
        postarJson("/api/saida", "{\"codigo\":\"" + codigoCompleto + "\",\"esp32\":\"" + espId + "\"}");
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
    const String codigoCompleto = codigoLocal + c.id;
    String j = "{\"codigo\":\"" + codigoCompleto + "\",\"esp32\":\"" + espId + "\",\"rssi\":" + String(c.rssi);
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
  String j = "{\"tipo\":\"leitura_setor\",\"setor\":\"" + codigoLocal +
             "\",\"mensagem\":\"Leitura dos sensores do setor.\",\"detalhes\":{\"esp32\":\"" + espId +
             "\",\"temperatura_c\":" + numeroJson(leitura.temperatura) +
             ",\"umidade_percentual\":" + numeroJson(leitura.umidade) +
             ",\"luminosidade_adc\":" + String(leitura.luminosidade) +
             ",\"som_variacao\":" + String(leitura.som) + "}}";
  if (concluido(postarJson("/api/eventos", j))) ultimoEnvioSensoresMs = millis();
  return true;
}

// Uma requisicao por volta do loop, para nao travar o servidor dos chaveiros
void enviarAoBackend() {
  if (!backendConfigurado() || WiFi.status() != WL_CONNECTED) return;
  if (houveFalha && millis() - ultimaFalhaMs < ESPERA_APOS_FALHA_MS) return;
  if (!areaRegistrada) {
    const int codigo = postarJson("/api/setores", "{\"codigo\":\"" + codigoLocal + "\",\"esp32\":\"" + espId + "\"}");
    if (concluido(codigo)) {
      areaRegistrada = true; // 409: ja cadastrada, tambem serve
      Serial.printf("[BACKEND] Area %s pronta.\n", codigoLocal.c_str());
    }
    return;
  }
  if (!ipInformado) {
    // O servidor descobre aqui onde mandar os avisos (POST http://<ip>/aviso)
    String j = "{\"tipo\":\"esp32_online\",\"setor\":\"" + codigoLocal +
               "\",\"mensagem\":\"ESP32 conectado.\",\"detalhes\":{\"esp32\":\"" + espId + "\",\"ip\":\"" +
               WiFi.localIP().toString() + "\"}}";
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
  if (servidor.header("X-Device-Key") != chaveDispositivo) {
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
  String t = "ESP32 de setor AquiIoT " + espId + "\nBackend: " + urlBackend +
             "\nClientes na rede dos chaveiros: " + String(WiFi.softAPgetStationNum()) + "\n";
  for (const Chaveiro& c : chaveiros) {
    if (c.presente) t += codigoLocal + c.id + " RSSI " + String(c.rssi) + " " + c.nome + "\n";
  }
  if (sensoresLigados && leitura.valida) {
    t += "Sensores: LDR " + String(leitura.luminosidade) + ", som " + String(leitura.som) + ", " +
         numeroJson(leitura.temperatura) + " C, " + numeroJson(leitura.umidade) + " %\n";
  }
  servidor.send(200, "text/plain", t);
}

void setup() {
  Serial.begin(115200);
  delay(500);
  carregarConfiguracao();
  Serial.printf("\n=== ESP32 de setor AquiIoT %s ===\n", espId.c_str());
  Serial.printf("Rede: %s | Backend: %s | Sensores: %s\n", redeSta.c_str(), urlBackend.c_str(),
                sensoresLigados ? "ligados" : "desligados");
  if (!backendConfigurado()) Serial.println("[CONFIG] Sem rede ou endereco do servidor (segredos.h ou aba Avancada): nada sera enviado ao banco.");

  if (sensoresLigados) {
    analogReadResolution(12);
    dht.begin();
  }

  WiFi.onEvent(eventoWifi);
  WiFi.mode(backendConfigurado() ? WIFI_AP_STA : WIFI_AP);
  if (WiFi.softAP(redeChaveiros.c_str(), senhaChaveiros.c_str(), 1, REDE_INVISIVEL, MAX_CLIENTES_WIFI)) {
    Serial.printf("[AP] Rede %s dos chaveiros (%s) em %s\n", redeChaveiros.c_str(),
                  REDE_INVISIVEL ? "invisivel" : "visivel", WiFi.softAPIP().toString().c_str());
  } else {
    Serial.println("[AP] Falha ao criar a rede dos chaveiros (senha precisa de 8 a 63 caracteres).");
  }
  if (backendConfigurado()) {
    WiFi.setAutoReconnect(true);
    WiFi.begin(redeSta.c_str(), senhaSta.c_str());
  }

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
    Serial.printf("[WIFI] Conectado a %s. IP: %s\n", redeSta.c_str(), WiFi.localIP().toString().c_str());
    Serial.printf("[WIFI] Rede dos chaveiros no canal %d. Avisos: POST http://%s/aviso\n", WiFi.channel(),
                  WiFi.localIP().toString().c_str());
  } else if (WiFi.status() != WL_CONNECTED && estavaConectado) {
    estavaConectado = false;
    Serial.printf("[WIFI] Conexao com %s perdida, tentando reconectar...\n", redeSta.c_str());
  }

  verificarConexoes();
  lerSensores();
  enviarAoBackend();
  delay(2);
}
