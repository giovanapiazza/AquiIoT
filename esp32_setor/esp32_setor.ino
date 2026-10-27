#include <WiFi.h>
#include <WebServer.h>
#include <DHT.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <esp_arduino_version.h>

// Wi-Fi com internet e endereco publico do backend (Tailscale Funnel).
// Copie segredos.exemplo.h para segredos.h e preencha; sem esse arquivo o
// setor funciona so localmente.
#if __has_include("segredos.h")
#include "segredos.h"
#else
const char* WIFI_STA_SSID = "";
const char* WIFI_STA_SENHA = "";
const char* URL_BACKEND = "";
#endif

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
const int MAX_CHAVEIROS = 8; // capacidade de registros, nao de clientes simultaneos
const int MAX_CLIENTES_WIFI = 4;
const uint8_t LIMITE_FALHAS_SEGUIDAS = 3;
const unsigned long INTERVALO_MINIMO_BIP_MS = 1000;

// Envio ao backend (API + banco na Raspberry Pi).
const unsigned long INTERVALO_ENVIO_SENSORES_MS = 30000;
const unsigned long INTERVALO_REENVIO_PRESENCA_MS = 60000; // backend marca offline apos 120 s
const unsigned long ESPERA_APOS_FALHA_MS = 10000;
const unsigned long INTERVALO_RECONECTAR_STA_MS = 30000;
const uint16_t TIMEOUT_BACKEND_MS = 5000; // HTTPS: o handshake TLS leva 1-2 s

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

// Falhas consecutivas: um unico valor extremo pode ser uma condicao real do ambiente.
uint8_t falhasSeguidasDht = 0;
uint8_t amostrasSuspeitasMicrofone = 0;
uint8_t amostrasLdrLimite = 0;
bool alertaDht = false;
bool alertaMicrofone = false;
bool avisoLdrLimite = false; // aviso eletrico/diagnostico, nao falha comprovada
int microfoneMinimo = 4095;
int microfoneMaximo = 0;
unsigned long ultimaLeituraDhtValidaMs = 0;

// Eventos Wi-Fi chegam em outra tarefa: a callback so atualiza flags/contadores.
volatile bool eventoApParou = false;
volatile uint32_t eventosClienteConectado = 0;
volatile uint32_t eventosClienteDesconectado = 0;
bool houveTentativaApAnterior = false;

// Historico circular, somente em RAM. Reiniciar o ESP32 zera estes registros.
const uint8_t MAX_EVENTOS = 12;
struct EventoSetor {
  unsigned long ms = 0;
  const char* tipo = nullptr;
  const char* origem = nullptr;
  const char* descricao = nullptr;
};
EventoSetor eventosSetor[MAX_EVENTOS];
uint8_t proximoEvento = 0;
uint8_t totalEventos = 0;

bool buzzerPronto = false;
bool bipAtivo = false;
unsigned long inicioBipMs = 0;
unsigned long ultimoBipMs = 0;
bool algumBipExecutado = false;

struct Chaveiro {
  String id;
  int rssi = 0;                // informado pelo chaveiro
  unsigned long vistoMs = 0;
  bool utilizado = false;
  bool pendenteBackend = false;  // entrada ainda nao enviada ao backend
  unsigned long enviadoMs = 0;   // ultimo envio aceito pelo backend
};
Chaveiro chaveiros[MAX_CHAVEIROS];

// Estado do envio ao backend.
volatile bool eventoStaConectou = false;
volatile bool eventoStaCaiu = false;
unsigned long ultimaTentativaStaMs = 0;
bool setorRegistrado = false;
unsigned long ultimoEnvioSensoresMs = 0;
unsigned long ultimaFalhaBackendMs = 0;
bool houveFalhaBackend = false;
bool backendRespondendo = false;
uint32_t eventosRegistrados = 0; // contador continuo, para saber o que ja foi enviado
uint32_t eventosEnviados = 0;

bool chaveiroPresente(const Chaveiro& c);
int contarChaveiros();
void enviarDadosSerial();
bool backendConfigurado();


// ==========================================
// EVENTOS E ESTADO DOS SENSORES
// ==========================================
void registrarEvento(const char* tipo, const char* origem, const char* descricao) {
  eventosSetor[proximoEvento] = {millis(), tipo, origem, descricao};
  proximoEvento = (proximoEvento + 1) % MAX_EVENTOS;
  if (totalEventos < MAX_EVENTOS) totalEventos++;
  eventosRegistrados++;
  Serial.printf("[%s] %s: %s\n", tipo, origem, descricao);
}

bool sensoresDegradados() {
  return alertaDht || alertaMicrofone;
}

// Eventos do ponto de acesso Wi-Fi, nao sao eventos de chaveiros.
// Nao chamar WiFi.softAP() nem alterar Serial daqui: callback de outra tarefa.
void eventoWifi(arduino_event_id_t evento) {
  switch (evento) {
    case ARDUINO_EVENT_WIFI_AP_STOP:
      eventoApParou = true;
      break;
    case ARDUINO_EVENT_WIFI_AP_STACONNECTED:
      eventosClienteConectado++;
      break;
    case ARDUINO_EVENT_WIFI_AP_STADISCONNECTED:
      eventosClienteDesconectado++;
      break;
    case ARDUINO_EVENT_WIFI_STA_GOT_IP:
      eventoStaConectou = true;
      break;
    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
      eventoStaCaiu = true;
      break;
    default:
      break;
  }
}

bool rssiValido(const String& entrada, int& resultado) {
  // Evita que String.toInt() aceite lixo como "-60abc".
  if (entrada.length() < 2 || entrada.length() > 4 || entrada[0] != '-') return false;
  for (unsigned int i = 1; i < entrada.length(); i++) {
    if (entrada[i] < '0' || entrada[i] > '9') return false;
  }
  resultado = entrada.toInt();
  return resultado >= -120 && resultado <= -1;
}

// ==========================================
// TESTES DE LEITURA E DIAGNOSTICOS
// ==========================================
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
  microfoneMinimo = minimo;
  microfoneMaximo = maximo;
  return maximo - minimo;
}

void lerSensores() {
  // 1) LDR: limites do ADC sao um aviso, nao prova de circuito quebrado.
  ldrAdc = analogRead(PINO_LDR);
  const bool ldrExtremo = (ldrAdc <= 2 || ldrAdc >= 4093);
  if (ldrExtremo) {
    if (amostrasLdrLimite < LIMITE_FALHAS_SEGUIDAS) amostrasLdrLimite++;
  } else {
    amostrasLdrLimite = 0;
  }
  const bool novoAvisoLdr = amostrasLdrLimite >= LIMITE_FALHAS_SEGUIDAS;
  if (novoAvisoLdr && !avisoLdrLimite) {
    registrarEvento("AVISO", "LDR", "Leituras no limite do ADC; conferir iluminacao e divisor.");
  } else if (!novoAvisoLdr && avisoLdrLimite) {
    registrarEvento("RECUPERADO", "LDR", "Leitura deixou o limite do ADC.");
  }
  avisoLdrLimite = novoAvisoLdr;

  // 2) Microfone: observar toda a janela para evitar falso positivo.
  microfoneAdc = analogRead(PINO_MICROFONE);
  variacaoMicrofone = medirVariacaoSom();
  const bool microfoneSuspeito =
    (microfoneMinimo >= 4090 || microfoneMaximo <= 5) && variacaoMicrofone <= 2;
  if (microfoneSuspeito) {
    if (amostrasSuspeitasMicrofone < LIMITE_FALHAS_SEGUIDAS) {
      amostrasSuspeitasMicrofone++;
    }
  } else {
    amostrasSuspeitasMicrofone = 0;
  }
  const bool novoAlertaMic = amostrasSuspeitasMicrofone >= LIMITE_FALHAS_SEGUIDAS;
  if (novoAlertaMic && !alertaMicrofone) {
    registrarEvento("AVISO", "MICROFONE", "Saida analogica persistente em nivel extremo.");
  } else if (!novoAlertaMic && alertaMicrofone) {
    registrarEvento("RECUPERADO", "MICROFONE", "Leitura analogica deixou a condicao extrema.");
  }
  alertaMicrofone = novoAlertaMic;
  microfoneSaturado = novoAlertaMic;

  // 3) DHT11: a leitura atual e invalida mesmo antes dos 3 erros seguidos.
  const float t = dht.readTemperature();
  const float u = dht.readHumidity();
  dhtValido = !isnan(t) && !isnan(u) && u >= 0.0f && u <= 100.0f;
  if (dhtValido) {
    temperatura = t;
    umidade = u;
    ultimaLeituraDhtValidaMs = millis();
    if (alertaDht) {
      registrarEvento("RECUPERADO", "DHT11", "Temperatura e umidade voltaram a ser lidas.");
    }
    falhasSeguidasDht = 0;
    alertaDht = false;
  } else {
    temperatura = NAN; // Nunca enviar um numero antigo como medicao atual.
    umidade = NAN;
    falhasDht++;
    if (falhasSeguidasDht < LIMITE_FALHAS_SEGUIDAS) falhasSeguidasDht++;
    if (falhasSeguidasDht >= LIMITE_FALHAS_SEGUIDAS && !alertaDht) {
      alertaDht = true;
      registrarEvento("ERRO", "DHT11", "Tres leituras consecutivas falharam.");
    }
  }

  ultimaLeituraMs = millis();
  leiturasDisponiveis = true;
  Serial.printf("[SENSORES] LDR: %d | MIC: %d | Variacao: %d",
                ldrAdc, microfoneAdc, variacaoMicrofone);
  if (avisoLdrLimite) Serial.print(" [LDR NO LIMITE]");
  if (alertaMicrofone) Serial.print(" [VERIFICAR MICROFONE]");
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
    registrarEvento("AVISO", "PRESENCA", "Autenticacao de dispositivo recusada.");
    servidor.send(401, "text/plain", "Chave do dispositivo incorreta.");
    return;
  }
  const String id = servidor.arg("id");
  const String rssiStr = servidor.arg("rssi");
  int rssi = 0;
  if (!idValido(id) || !rssiValido(rssiStr, rssi)) {
    registrarEvento("AVISO", "PRESENCA", "Mensagem rejeitada: ID ou RSSI invalido.");
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
    registrarEvento("AVISO", "PRESENCA", "Limite de registros de chaveiros atingido.");
    servidor.send(503, "text/plain", "Limite temporario de chaveiros atingido.");
    return;
  }
  const bool novo = !destino->utilizado || destino->id != id || !chaveiroPresente(*destino);
  destino->utilizado = true;
  destino->id = id;
  destino->rssi = rssi;
  destino->vistoMs = millis();
  if (novo) {
    destino->pendenteBackend = true;
    destino->enviadoMs = 0;
  }
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

bool iniciarBip() {
  if (!buzzerPronto) return false;
  const unsigned long agora = millis();
  if (algumBipExecutado && agora - ultimoBipMs < INTERVALO_MINIMO_BIP_MS) return false;
  buzzerSaida(true);
  bipAtivo = true;
  inicioBipMs = agora;
  ultimoBipMs = agora;
  algumBipExecutado = true;
  return true;
}

void acionarBuzzerHttp() {
  if (servidor.header("X-API-Key") != CHAVE_BUZZER) {
    registrarEvento("AVISO", "BUZZER", "Comando rejeitado por chave incorreta.");
    servidor.send(401, "text/plain", "Chave do buzzer incorreta.");
    return;
  }
  if (!buzzerPronto) {
    servidor.send(503, "text/plain", "Buzzer desabilitado ate confirmar circuito.");
    return;
  }
  if (!iniciarBip()) {
    servidor.send(429, "text/plain", "Aguarde 1 segundo antes de outro bip.");
    return;
  }
  registrarEvento("INFO", "BUZZER", "Comando de bip autorizado e executado.");
  servidor.send(200, "text/plain", "Bip autorizado (250 ms).");
}


// ==========================================
// APIS PARA A FUTURA INTERFACE WEB
// ==========================================
// /saude responde mesmo se um sensor falhar; o backend determina se
// houve perda de comunicacao apos 15 s sem respostas validas.
// /dados conserva os nomes atuais para compatibilidade com o backend.
void enviarSaude() {
  const bool modoApAtivo = ((WiFi.getMode() & WIFI_AP) != 0);
  String j;
  j.reserve(460);
  j += "{\"setor\":\"" + String(ID_SETOR) + "\",\"status\":\"RESPONDENDO\",";
  j += "\"esp32\":\"" + String(ESP_ID) + "\",";
  j += "\"uptime_ms\":" + String(millis()) + ",";
  j += "\"ultima_leitura_ms\":" + String(ultimaLeituraMs) + ",";
  j += "\"idade_leitura_ms\":" + String(millis() - ultimaLeituraMs) + ",";
  j += "\"clientes_wifi\":" + String(WiFi.softAPgetStationNum()) + ",";
  j += "\"limite_clientes_wifi\":" + String(MAX_CLIENTES_WIFI) + ",";
  j += "\"wifi_backend_conectado\":";
  j += (WiFi.status() == WL_CONNECTED ? "true" : "false");
  j += ",\"backend_respondendo\":";
  j += (backendRespondendo ? "true" : "false");
  j += ",\"ap_ativo_localmente\":";
  j += (apIniciado && modoApAtivo ? "true" : "false");
  j += ",\"sensores_degradados\":";
  j += (sensoresDegradados() ? "true" : "false");
  j += ",\"estado_sensores\":\"";
  j += (sensoresDegradados() ? "DEGRADADO" : "OK");
  j += "\",\"dht_valido\":";
  j += (dhtValido ? "true" : "false");
  j += ",\"alerta_dht\":";
  j += (alertaDht ? "true" : "false");
  j += ",\"alerta_microfone\":";
  j += (alertaMicrofone ? "true" : "false");
  j += ",\"aviso_ldr_limite\":";
  j += (avisoLdrLimite ? "true" : "false");
  j += "}";
  servidor.sendHeader("Cache-Control", "no-store");
  servidor.send(200, "application/json; charset=utf-8", j);
}

void enviarDados() {
  String j;
  j.reserve(1050);
  j += "{\"setor\":\"" + String(ID_SETOR) + "\",";
  j += "\"luminosidade_adc\":" + String(ldrAdc) + ",";
  j += "\"aviso_ldr_limite\":";
  j += (avisoLdrLimite ? "true" : "false");
  j += ",\"som_adc\":" + String(microfoneAdc);
  j += ",\"som_variacao\":" + String(variacaoMicrofone);
  j += ",\"som_min_adc\":" + String(microfoneMinimo);
  j += ",\"som_max_adc\":" + String(microfoneMaximo);
  j += ",\"som_saturado\":";
  j += (alertaMicrofone ? "true" : "false");
  j += ",\"dht_valido\":";
  j += (dhtValido ? "true" : "false");
  j += ",\"alerta_dht\":";
  j += (alertaDht ? "true" : "false");
  j += ",\"falhas_dht_consecutivas\":" + String(falhasSeguidasDht);
  j += ",\"temperatura_c\":";
  j += (dhtValido ? String(temperatura, 1) : "null");
  j += ",\"umidade_percentual\":";
  j += (dhtValido ? String(umidade, 1) : "null");
  j += ",\"falhas_dht\":" + String(falhasDht);
  j += ",\"ultima_leitura_dht_valida_ms\":";
  j += (ultimaLeituraDhtValidaMs ? String(ultimaLeituraDhtValidaMs) : "null");
  j += ",\"ultima_leitura_ms\":" + String(ultimaLeituraMs);
  j += ",\"idade_leitura_ms\":" + String(millis() - ultimaLeituraMs);
  j += ",\"uptime_ms\":" + String(millis());
  j += ",\"clientes_wifi\":" + String(WiFi.softAPgetStationNum());
  j += ",\"limite_clientes_wifi\":" + String(MAX_CLIENTES_WIFI);
  j += ",\"sensores_degradados\":";
  j += (sensoresDegradados() ? "true" : "false");
  j += ",\"estado_sensores\":\"";
  j += (sensoresDegradados() ? "DEGRADADO" : "OK");
  j += "\",\"buzzer_ativo\":";
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

void enviarEventos() {
  String j;
  j.reserve(1100);
  j += "{\"setor\":\"";
  j += ID_SETOR;
  j += "\",\"eventos\":[";
  const uint8_t primeiro = (proximoEvento + MAX_EVENTOS - totalEventos) % MAX_EVENTOS;
  for (uint8_t i = 0; i < totalEventos; i++) {
    const EventoSetor& e = eventosSetor[(primeiro + i) % MAX_EVENTOS];
    if (i) j += ',';
    j += "{\"uptime_ms\":" + String(e.ms);
    j += ",\"tipo\":\"" + String(e.tipo);
    j += "\",\"origem\":\"" + String(e.origem);
    j += "\",\"mensagem\":\"" + String(e.descricao) + "\"}";
  }
  j += "]}";
  servidor.sendHeader("Cache-Control", "no-store");
  servidor.send(200, "application/json; charset=utf-8", j);
}

// ==========================================
// RECUPERACAO LOCAL DO PONTO DE ACESSO
// ==========================================
// NOTA: o AP pode estar ativo e ainda assim inacessivel por interferencia.
// A confirmacao de comunicacao depende de um monitor externo consultando /saude.
void iniciarAP() {
  ultimaTentativaAPMs = millis();
  // AP + STA: o AP atende os chaveiros e o STA acessa o Wi-Fi com internet.
  // Com o STA conectado, o AP passa a usar o canal do roteador.
  WiFi.mode(backendConfigurado() ? WIFI_AP_STA : WIFI_AP);
  apIniciado = WiFi.softAP(NOME_REDE, SENHA_REDE, CANAL_WIFI, 0, MAX_CLIENTES_WIFI);
  if (apIniciado) {
    Serial.print("[WIFI] Ponto de acesso em ");
    Serial.println(WiFi.softAPIP());
    registrarEvento(houveTentativaApAnterior ? "RECUPERADO" : "INFO",
                    "WIFI", "Ponto de acesso iniciado.");
  } else {
    registrarEvento("ERRO", "WIFI", "Falha ao iniciar AP. Nova tentativa em 10 s.");
  }
  houveTentativaApAnterior = true;
}

void verificarAP() {
  // A ausencia de clientes Wi-Fi nao e uma falha do ponto de acesso.
  static uint32_t anteriorConectados = 0;
  static uint32_t anteriorDesconectados = 0;
  const uint32_t conectados = eventosClienteConectado;
  const uint32_t desconectados = eventosClienteDesconectado;
  if (conectados != anteriorConectados) {
    registrarEvento("INFO", "WIFI", "Um cliente Wi-Fi se conectou.");
    anteriorConectados = conectados;
  }
  if (desconectados != anteriorDesconectados) {
    registrarEvento("INFO", "WIFI", "Um cliente Wi-Fi se desconectou.");
    anteriorDesconectados = desconectados;
  }
  if (millis() - ultimaTentativaAPMs < INTERVALO_VERIFICAR_AP_MS) return;
  const bool modoApAtivo = ((WiFi.getMode() & WIFI_AP) != 0);
  const bool houveEventoParada = eventoApParou;
  eventoApParou = false;
  if (!apIniciado || !modoApAtivo || houveEventoParada) {
    apIniciado = false;
    registrarEvento("AVISO", "WIFI", "AP local inativo; tentando reiniciar.");
    iniciarAP();
  }
  ultimaTentativaAPMs = millis();
}

// ==========================================
// ENVIO AO BACKEND (RASPBERRY PI)
// ==========================================
// Cada chamada faz no maximo uma requisicao, para nao travar o servidor local
// que recebe os chaveiros. Falhas so esperam e tentam de novo.
bool backendConfigurado() {
  return strlen(WIFI_STA_SSID) > 0 && strlen(URL_BACKEND) > 0;
}

void iniciarSTA() {
  if (!backendConfigurado()) return;
  ultimaTentativaStaMs = millis();
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_STA_SSID, WIFI_STA_SENHA);
  Serial.printf("[BACKEND] Conectando a rede %s...\n", WIFI_STA_SSID);
}

void verificarSTA() {
  if (!backendConfigurado()) return;
  if (eventoStaConectou) {
    eventoStaConectou = false;
    Serial.print("[BACKEND] Wi-Fi conectado. IP: ");
    Serial.println(WiFi.localIP());
    registrarEvento("INFO", "BACKEND", "Wi-Fi com internet conectado.");
  }
  if (eventoStaCaiu) {
    eventoStaCaiu = false;
    backendRespondendo = false;
  }
  if (WiFi.status() != WL_CONNECTED &&
      millis() - ultimaTentativaStaMs >= INTERVALO_RECONECTAR_STA_MS) {
    Serial.println("[BACKEND] Wi-Fi desconectado; nova tentativa.");
    iniciarSTA();
  }
}

int postarJson(const char* caminho, const String& corpo) {
  // Funnel usa HTTPS com certificado Let's Encrypt. setInsecure() nao confere o
  // certificado (bom para testes); para validar, troque por
  // cliente.setCACert(<raiz ISRG Root X1 em PEM>).
  WiFiClientSecure cliente;
  cliente.setInsecure();
  HTTPClient http;
  if (!http.begin(cliente, String(URL_BACKEND) + caminho)) return -1;
  http.setConnectTimeout(TIMEOUT_BACKEND_MS);
  http.setTimeout(TIMEOUT_BACKEND_MS);
  http.addHeader("Content-Type", "application/json");
  const int codigo = http.POST(corpo);
  if (codigo >= 400) {
    Serial.printf("[BACKEND] %s -> HTTP %d: %s\n", caminho, codigo, http.getString().c_str());
  } else if (codigo < 0) {
    Serial.printf("[BACKEND] %s -> %s\n", caminho, HTTPClient::errorToString(codigo).c_str());
  }
  http.end();
  backendRespondendo = codigo > 0;
  if (codigo < 0 || codigo >= 500) {
    houveFalhaBackend = true;
    ultimaFalhaBackendMs = millis();
  }
  return codigo;
}

// 2xx = aceito; 4xx = dado recusado, reenviar nao adianta; demais = tentar de novo.
bool envioConcluido(int codigo) {
  return codigo >= 200 && codigo < 500;
}

void registrarSetorNoBackend() {
  String j = "{\"nome\":\"" + String(NOME_SETOR) + "\",\"esp32\":\"" + String(ESP_ID) + "\"}";
  const int codigo = postarJson("/api/setores", j);
  // 409: setor ja cadastrado, o que tambem serve.
  if (envioConcluido(codigo)) {
    setorRegistrado = true;
    Serial.printf("[BACKEND] Setor %s pronto no backend (HTTP %d).\n", NOME_SETOR, codigo);
  }
}

bool enviarPresencaBackend() {
  Chaveiro* escolhido = nullptr;
  for (Chaveiro& c : chaveiros) {
    if (!chaveiroPresente(c)) continue;
    if (c.pendenteBackend || millis() - c.enviadoMs >= INTERVALO_REENVIO_PRESENCA_MS) {
      escolhido = &c;
      break;
    }
  }
  if (escolhido == nullptr) return false;
  String j = "{\"dispositivo\":\"" + escolhido->id + "\",\"setor\":\"" + String(NOME_SETOR) +
             "\",\"rssi\":" + String(escolhido->rssi) + "}";
  const int codigo = postarJson("/api/localizacao", j);
  if (envioConcluido(codigo)) {
    escolhido->pendenteBackend = false;
    escolhido->enviadoMs = millis();
    if (codigo < 300) Serial.printf("[BACKEND] Presenca de %s enviada.\n", escolhido->id.c_str());
  }
  return true;
}

bool enviarSensoresBackend() {
  if (!leiturasDisponiveis) return false;
  if (ultimoEnvioSensoresMs != 0 && millis() - ultimoEnvioSensoresMs < INTERVALO_ENVIO_SENSORES_MS) return false;
  // O backend ainda nao tem tabela de sensores do setor: a leitura vai como
  // evento, com os valores em "detalhes" (aparece em /api/eventos/sistema).
  String j;
  j.reserve(360);
  j += "{\"tipo\":\"leitura_setor\",\"nivel\":\"";
  j += (sensoresDegradados() ? "aviso" : "info");
  j += "\",\"setor\":\"" + String(NOME_SETOR) + "\"";
  j += ",\"mensagem\":\"Leitura dos sensores do setor.\"";
  j += ",\"detalhes\":{\"esp32\":\"" + String(ESP_ID) + "\"";
  j += ",\"temperatura_c\":";
  j += (dhtValido ? String(temperatura, 1) : "null");
  j += ",\"umidade_percentual\":";
  j += (dhtValido ? String(umidade, 1) : "null");
  j += ",\"luminosidade_adc\":" + String(ldrAdc);
  j += ",\"som_variacao\":" + String(variacaoMicrofone);
  j += ",\"sensores_degradados\":";
  j += (sensoresDegradados() ? "true" : "false");
  j += "}}";
  const int codigo = postarJson("/api/eventos", j);
  if (envioConcluido(codigo)) ultimoEnvioSensoresMs = millis();
  return true;
}

bool enviarEventoBackend() {
  if (eventosEnviados == eventosRegistrados) return false;
  // Eventos sobrescritos no historico circular antes do envio sao perdidos.
  if (eventosRegistrados - eventosEnviados > totalEventos) {
    eventosEnviados = eventosRegistrados - totalEventos;
  }
  const EventoSetor& e = eventosSetor[eventosEnviados % MAX_EVENTOS];
  const char* nivel = strcmp(e.tipo, "ERRO") == 0 ? "erro" : strcmp(e.tipo, "AVISO") == 0 ? "aviso" : "info";
  String j;
  j.reserve(300);
  j += "{\"tipo\":\"setor\",\"nivel\":\"" + String(nivel) + "\"";
  j += ",\"setor\":\"" + String(NOME_SETOR) + "\"";
  j += ",\"mensagem\":\"" + String(e.origem) + ": " + String(e.descricao) + "\"";
  j += ",\"detalhes\":{\"esp32\":\"" + String(ESP_ID) + "\",\"tipo\":\"" + String(e.tipo);
  j += "\",\"origem\":\"" + String(e.origem) + "\",\"uptime_ms\":" + String(e.ms) + "}}";
  if (envioConcluido(postarJson("/api/eventos", j))) eventosEnviados++;
  return true;
}

void enviarAoBackend() {
  if (!backendConfigurado() || WiFi.status() != WL_CONNECTED) return;
  if (houveFalhaBackend && millis() - ultimaFalhaBackendMs < ESPERA_APOS_FALHA_MS) return;
  if (!setorRegistrado) {
    registrarSetorNoBackend();
    return;
  }
  // Prioridade: presenca dos chaveiros, depois sensores, depois eventos.
  if (enviarPresencaBackend()) return;
  if (enviarSensoresBackend()) return;
  enviarEventoBackend();
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
  Serial.printf("[DIAGNOSTICO] DHT11: %s (%u falhas seguidas, %lu totais) | Microfone: %s | LDR: %s\n",
                alertaDht ? "ALERTA" : dhtValido ? "OK" : "LEITURA INVALIDA",
                falhasSeguidasDht, falhasDht,
                alertaMicrofone ? "AVISO" : "OK",
                avisoLdrLimite ? "ADC NO LIMITE" : "NORMAL");
  Serial.printf("[DIAGNOSTICO] Estado dos sensores: %s | Eventos em memoria: %u\n",
                sensoresDegradados() ? "DEGRADADO" : "OK", totalEventos);
  Serial.println("[INFO] AP ativo localmente nao garante recepcao por outro dispositivo.");
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
      if (!buzzerPronto) Serial.println("[BUZZER] Desabilitado. Verifique o circuito antes de ativar.");
      else if (!iniciarBip()) Serial.println("[BUZZER] Aguarde 1 segundo entre comandos.");
      else Serial.println("[BUZZER] Bip local iniciado.");
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
  Serial.printf(",\"chaveiros_presentes\":%d,\"dht_valido\":%s,\"sensores_degradados\":%s}\n",
                contarChaveiros(), dhtValido ? "true" : "false",
                sensoresDegradados() ? "true" : "false");
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

  WiFi.onEvent(eventoWifi);
  iniciarAP();
  if (backendConfigurado()) iniciarSTA();
  else Serial.println("[BACKEND] segredos.h ausente ou incompleto: dados ficam so no ESP32.");
  const char* cabecalhos[] = {"X-API-Key", "X-Device-Key"};
  servidor.collectHeaders(cabecalhos, 2);
  servidor.on("/saude", HTTP_GET, enviarSaude);
  servidor.on("/dados", HTTP_GET, enviarDados);
  servidor.on("/eventos", HTTP_GET, enviarEventos);
  servidor.on("/presenca", HTTP_POST, registrarPresenca);
  servidor.on("/apitar", HTTP_POST, acionarBuzzerHttp);
  servidor.on("/", HTTP_GET, []() {
    servidor.send(200, "text/plain; charset=utf-8",
      "AquiIoT - Setor 01. APIs: GET /saude, GET /dados, GET /eventos. Testes via Monitor Serial.");
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
  verificarSTA();
  enviarAoBackend();

  if (millis() - ultimaLeituraMs >= INTERVALO_SENSORES_MS) {
    lerSensores();
  }
  if (bipAtivo && millis() - inicioBipMs >= TEMPO_BIP_MS) {
    buzzerSaida(false);
    bipAtivo = false;
  }
}
