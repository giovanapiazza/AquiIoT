#include <WiFi.h>
#include <WebServer.h>
#include <esp_arduino_version.h>
#include "segredos.h"


// REDE DO SETOR (troque a senha antes de usar em publico)
const char* NOME_REDE = "AquiIoT_Setor_01";
// SENHA_REDE definida em segredos.h

// CONTROLE DO BUZZER
// CHAVE_BUZZER definida em segredos.h

const int PINO_LDR       = 35;  // meio do divisor LDR/resistor (0 a 3,3 V)
const int PINO_MICROFONE = 34;  // pino AO do modulo (0 a 3,3 V)
const int PINO_TEMP      = 32;  // saida Vout do TMP36 (0 a 3,3 V)
const int PINO_BUZZER    = 25;  // acao de baixa corrente com 960 ohms em serie

const bool TEM_TMP36 = false;

const bool BUZZER_PASSIVO = true;
const unsigned long DURACAO_BIP_MS = 250;

WebServer servidor(80);
bool buzzerConfigurado = false;
bool bipEmAndamento = false;
unsigned long inicioBip = 0;
unsigned long ultimoLog = 0;

const char PAGINA_HTML[] = R"HTML(
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>AquiIoT - Setor 01</title>
  <style>
    body { font-family: Arial,sans-serif; background:#f1f5f7; color:#213544;
           max-width:620px; margin:24px auto; padding:0 15px; }
    .card { background:white; padding:16px; margin:12px 0; border-radius:12px;
            box-shadow:0 1px 5px #d9e2e6; }
    .valor { font-size:25px; font-weight:bold; margin:10px 0; }
    button { background:#176a75; color:white; border:0; border-radius:8px;
             padding:12px 18px; cursor:pointer; }
    input { width:100%; box-sizing:border-box; padding:10px; margin:8px 0;
            border:1px solid #a7bbc5; border-radius:7px; }
    small { color:#5d727e; }
  </style>
</head>
<body>
  <h1>AquiIoT - Setor 01</h1>
  <small>Leituras atualizadas a cada 2 segundos (nao sao medicoes calibradas).</small>
  <div class="card">
    <b>Luminosidade (LDR)</b><div class="valor" id="luz">--</div>
    <small>ADC bruto de 0 a 4095; nao representa lux.</small>
  </div>
  <div class="card">
    <b>Microfone (AO)</b><div class="valor" id="som">--</div>
    <small>ADC bruto de 0 a 4095; nao representa dB.</small>
    <p>Variacao em 25 ms: <b id="amplitude">--</b></p>
  </div>
  <div class="card">
    <b>Temperatura (TMP36)</b><div class="valor" id="temperatura">--</div>
    <small id="info-temp">O sensor precisa estar fisicamente conectado.</small>
  </div>
  <div class="card">
    <b>Dispositivos conectados</b><div class="valor" id="clientes">--</div>
  </div>
  <div class="card">
    <b>Alerta sonoro - comando protegido</b>
    <p><small>Insira a chave de controle configurada no firmware. Ela nao fica salva neste site.</small></p>
    <input id="chave" type="password" autocomplete="off" placeholder="Chave de controle do buzzer">
    <button type="button" onclick="apitar()">Emitir bip (250 ms)</button>
    <p id="estado" role="status">Aguardando comando.</p>
  </div>
  <p><a href="/dados">Ver dados em JSON</a></p>
  <script>
    async function atualizar() {
      try {
        const r = await fetch('/dados', {cache:'no-store'});
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        document.getElementById('luz').textContent = d.luminosidade_adc;
        document.getElementById('som').textContent = d.som_adc;
        document.getElementById('amplitude').textContent = d.som_variacao;
        document.getElementById('clientes').textContent = d.clientes;
        document.getElementById('temperatura').textContent =
          d.temperatura_disponivel ? d.temperatura_c.toFixed(1) + ' °C' : 'Nao disponivel';
        document.getElementById('info-temp').textContent =
          d.temperatura_disponivel ? 'Leitura aproximada do TMP36.' :
          'Conecte o TMP36 e ative TEM_TMP36 no codigo.';
      } catch(e) {
        document.getElementById('estado').textContent = 'Sem resposta do ESP32: ' + e.message;
      }
    }
    async function apitar() {
      const chave = document.getElementById('chave').value;
      const status = document.getElementById('estado');
      if (!chave) { status.textContent = 'Informe a chave antes de enviar o comando.'; return; }
      try {
        const r = await fetch('/apitar', {
          method: 'POST',
          headers: {'X-API-Key': chave},
          cache: 'no-store'
        });
        const mensagem = await r.text();
        status.textContent = r.ok ? mensagem : ('Erro ' + r.status + ': ' + mensagem);
      } catch(e) {
        status.textContent = 'Erro de conexao: ' + e.message;
      }
    }
    atualizar();
    setInterval(atualizar, 2000);
  </script>
</body>
</html>
)HTML";

void buzzerSaida(bool ligar) {
  if (BUZZER_PASSIVO) {
    if (!buzzerConfigurado) return;
#if ESP_ARDUINO_VERSION_MAJOR >= 3
    ledcWriteTone(PINO_BUZZER, ligar ? 2000 : 0);
#else
    ledcWriteTone(0, ligar ? 2000 : 0);
#endif
  } else {
    digitalWrite(PINO_BUZZER, ligar ? HIGH : LOW);
  }
}

// Variação pico-a-pico, nao e decibeis.
int medirVariacaoSom() {
  int minimo = 4095;
  int maximo = 0;
  unsigned long inicio = millis();
  while (millis() - inicio < 25) {
    int leitura = analogRead(PINO_MICROFONE);
    if (leitura < minimo) minimo = leitura;
    if (leitura > maximo) maximo = leitura;
    delayMicroseconds(120);
  }
  return maximo - minimo;
}

// TMP36: Vout = 500 mV + (10 mV por grau Celsius).
// Entrega false e temperatura indisponivel quando o sensor esta desativado.
bool lerTemperaturaTMP36(float& temperaturaC, uint32_t& tensaoMv) {
  if (!TEM_TMP36) return false;

  const int AMOSTRAS = 12;
  uint32_t soma = 0;
  for (int i = 0; i < AMOSTRAS; i++) {
    soma += analogReadMilliVolts(PINO_TEMP);
    delay(2);
  }
  tensaoMv = soma / AMOSTRAS;
  temperaturaC = ((float)tensaoMv - 500.0f) / 10.0f;

  // So valida faixa fisica do sensor; a leitura pode exigir calibracao.
  return (temperaturaC >= -40.0f && temperaturaC <= 125.0f);
}

void enviarDados() {
  int luz = analogRead(PINO_LDR);
  int som = analogRead(PINO_MICROFONE);
  int variacaoSom = medirVariacaoSom();

  float temperaturaC = 0.0f;
  uint32_t tensaoMv = 0;
  bool tempDisponivel = lerTemperaturaTMP36(temperaturaC, tensaoMv);

  String json;
  json.reserve(300);
  json += "{\"setor\":\"SETOR_01\",";
  json += "\"luminosidade_adc\":" + String(luz) + ",";
  json += "\"som_adc\":" + String(som) + ",";
  json += "\"som_variacao\":" + String(variacaoSom) + ",";
  json += "\"temperatura_disponivel\":";
  json += (tempDisponivel ? "true" : "false");
  json += ",\"temperatura_c\":";
  json += (tempDisponivel ? String(temperaturaC, 1) : "null");
  json += ",\"temperatura_mv\":";
  json += (tempDisponivel ? String(tensaoMv) : "null");
  json += ",\"clientes\":" + String(WiFi.softAPgetStationNum()) + ",";
  json += "\"buzzer_ativo\":";
  json += (bipEmAndamento ? "true" : "false");
  json += "}";

  servidor.sendHeader("Cache-Control", "no-store");
  servidor.send(200, "application/json; charset=utf-8", json);
}

// Apenas uma requisicao POST com chave valida pode disparar o buzzer.
void receberComandoBuzzer() {
  const String chaveRecebida = servidor.header("X-API-Key");
  if (chaveRecebida.length() == 0 || chaveRecebida != CHAVE_BUZZER) {
    servidor.sendHeader("Cache-Control", "no-store");
    servidor.send(401, "text/plain; charset=utf-8", "Chave ausente ou incorreta.");
    return;
  }
  if (!buzzerConfigurado) {
    servidor.send(503, "text/plain; charset=utf-8", "Buzzer nao configurado.");
    return;
  }
  buzzerSaida(true);
  bipEmAndamento = true;
  inicioBip = millis();
  servidor.send(200, "text/plain; charset=utf-8", "Comando autorizado: bip de 250 ms.");
}

void setup() {
  Serial.begin(115200);
  delay(300);

  analogReadResolution(12);
  pinMode(PINO_LDR, INPUT);
  pinMode(PINO_MICROFONE, INPUT);
  if (TEM_TMP36) {
    pinMode(PINO_TEMP, INPUT);
    analogSetPinAttenuation(PINO_TEMP, ADC_11db);
  }

  pinMode(PINO_BUZZER, OUTPUT);
  digitalWrite(PINO_BUZZER, LOW);

  if (BUZZER_PASSIVO) {
#if ESP_ARDUINO_VERSION_MAJOR >= 3
    buzzerConfigurado = ledcAttach(PINO_BUZZER, 2000, 8);
#else
    buzzerConfigurado = ledcSetup(0, 2000, 8) > 0;
    if (buzzerConfigurado) ledcAttachPin(PINO_BUZZER, 0);
#endif
    if (buzzerConfigurado) buzzerSaida(false);
  } else {
    buzzerConfigurado = true;
  }

  WiFi.mode(WIFI_AP);
  if (!WiFi.softAP(NOME_REDE, SENHA_REDE)) {
    Serial.println("ERRO: nao foi possivel criar o Wi-Fi!");
    while (true) delay(1000);
  }

  // Sem esse registro, headers personalizados podem nao ser coletados.
  const char* cabecalhos[] = {"X-API-Key"};
  servidor.collectHeaders(cabecalhos, 1);

  servidor.on("/", HTTP_GET, []() {
    servidor.send(200, "text/html; charset=utf-8", PAGINA_HTML);
  });
  servidor.on("/dados", HTTP_GET, enviarDados);
  servidor.on("/apitar", HTTP_POST, receberComandoBuzzer);
  servidor.onNotFound([]() {
    servidor.send(404, "text/plain; charset=utf-8", "Rota nao encontrada.");
  });
  servidor.begin();

  Serial.println("\n=== AquiIoT: Setor 01 / v2 ===");
  Serial.print("Wi-Fi: "); Serial.println(NOME_REDE);
  Serial.print("Pagina: http://"); Serial.println(WiFi.softAPIP());
  Serial.println("Buzzer: POST /apitar com X-API-Key");
  Serial.println(TEM_TMP36 ? "TMP36 ativado no GPIO32" : "TMP36 ainda nao conectado");
}

void loop() {
  servidor.handleClient();

  if (bipEmAndamento && millis() - inicioBip >= DURACAO_BIP_MS) {
    buzzerSaida(false);
    bipEmAndamento = false;
  }

  if (millis() - ultimoLog >= 2000) {
    ultimoLog = millis();
    Serial.print("LDR: "); Serial.print(analogRead(PINO_LDR));
    Serial.print(" | Microfone: "); Serial.print(analogRead(PINO_MICROFONE));
    float t;
    uint32_t mV;
    if (lerTemperaturaTMP36(t, mV)) {
      Serial.print(" | Temperatura: "); Serial.print(t, 1); Serial.print(" C");
    } else {
      Serial.print(" | Temperatura: indisponivel");
    }
    Serial.print(" | Clientes: "); Serial.println(WiFi.softAPgetStationNum());
  }
}