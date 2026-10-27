"""Gera os PDFs de documentacao do AquiIoT.

Uso (na raiz do repositorio):
    pip install reportlab
    dot -Tpng -Gdpi=170 docs/fontes/diagramas/X.dot -o docs/fontes/diagramas/X.png   (para cada .dot)
    python3 docs/fontes/gerar_pdfs.py
"""
from datetime import date
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (Image, KeepTogether, PageBreak, Paragraph, Preformatted,
                                SimpleDocTemplate, Spacer, Table, TableStyle)

RAIZ = Path(__file__).resolve().parents[2]
DIAG = RAIZ / "docs" / "fontes" / "diagramas"

FONTES = Path("/usr/share/fonts/truetype/dejavu")
pdfmetrics.registerFont(TTFont("Sans", FONTES / "DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("Sans-B", FONTES / "DejaVuSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("Sans-I", FONTES / "DejaVuSans-Oblique.ttf"))
pdfmetrics.registerFont(TTFont("Mono", FONTES / "DejaVuSansMono.ttf"))
pdfmetrics.registerFontFamily("Sans", normal="Sans", bold="Sans-B", italic="Sans-I", boldItalic="Sans-B")

AZUL = colors.HexColor("#2F5D7C")
AZUL_CLARO = colors.HexColor("#E8F1F8")
CINZA = colors.HexColor("#555555")
AVISO = colors.HexColor("#FFF4D6")

st = {
    "titulo": ParagraphStyle("titulo", fontName="Sans-B", fontSize=24, leading=30, textColor=AZUL,
                             alignment=TA_CENTER, spaceAfter=10),
    "subtitulo": ParagraphStyle("subtitulo", fontName="Sans", fontSize=13, leading=18, textColor=CINZA,
                                alignment=TA_CENTER),
    "h1": ParagraphStyle("h1", fontName="Sans-B", fontSize=15, leading=20, textColor=AZUL,
                         spaceBefore=14, spaceAfter=6, keepWithNext=1),
    "h2": ParagraphStyle("h2", fontName="Sans-B", fontSize=12, leading=16, textColor=AZUL,
                         spaceBefore=10, spaceAfter=4, keepWithNext=1),
    "p": ParagraphStyle("p", fontName="Sans", fontSize=10, leading=14.5, spaceAfter=6),
    "item": ParagraphStyle("item", fontName="Sans", fontSize=10, leading=14, leftIndent=14,
                           bulletIndent=4, spaceAfter=2),
    "cel": ParagraphStyle("cel", fontName="Sans", fontSize=8.8, leading=11.5),
    "celb": ParagraphStyle("celb", fontName="Sans-B", fontSize=8.8, leading=11.5, textColor=colors.white),
    "leg": ParagraphStyle("leg", fontName="Sans-I", fontSize=8.8, leading=11, textColor=CINZA,
                          alignment=TA_CENTER, spaceAfter=10),
    "code": ParagraphStyle("code", fontName="Mono", fontSize=8.3, leading=10.8, backColor=colors.HexColor("#F4F6F8"),
                           borderColor=colors.HexColor("#D0D7DE"), borderWidth=0.6, borderPadding=6,
                           spaceBefore=4, spaceAfter=10, leftIndent=6, rightIndent=6),
    "nota": ParagraphStyle("nota", fontName="Sans", fontSize=9.5, leading=13.5, backColor=AVISO,
                           borderColor=colors.HexColor("#B7862B"), borderWidth=0.6, borderPadding=6,
                           spaceBefore=4, spaceAfter=10, leftIndent=6, rightIndent=6),
}

LARGURA = A4[0] - 4 * cm


def P(texto, estilo="p"):
    return Paragraph(texto, st[estilo])


def itens(lista):
    return [Paragraph(t, st["item"], bulletText="•") for t in lista]


def codigo(texto):
    return Preformatted(texto.strip("\n"), st["code"])


def nota(texto):
    return P(texto, "nota")


def tabela(cabecalho, linhas, larguras):
    dados = [[Paragraph(c, st["celb"]) for c in cabecalho]]
    dados += [[Paragraph(str(c), st["cel"]) for c in linha] for linha in linhas]
    t = Table(dados, colWidths=[w * cm for w in larguras], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), AZUL),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, AZUL_CLARO]),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#B8C7D3")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
    ]))
    t.spaceAfter = 10
    return t


def figura(nome, legenda, altura_max=19 * cm, largura_max=LARGURA):
    img = Image(str(DIAG / f"{nome}.png"))
    escala = min(largura_max / img.imageWidth, altura_max / img.imageHeight)
    img.drawWidth = img.imageWidth * escala
    img.drawHeight = img.imageHeight * escala
    return KeepTogether([img, P(legenda, "leg")])


def capa(titulo, subtitulo, resumo):
    return [
        Spacer(1, 5 * cm),
        P("AquiIoT", "subtitulo"),
        Spacer(1, 6),
        P(titulo, "titulo"),
        P(subtitulo, "subtitulo"),
        Spacer(1, 1.5 * cm),
        P(resumo, "p"),
        Spacer(1, 3 * cm),
        P("Projeto Integrador V — Engenharia de Computação<br/>UNIPAMPA — Campus Bagé", "subtitulo"),
        Spacer(1, 6),
        P(f"Documento gerado em {date.today().strftime('%d/%m/%Y')}", "subtitulo"),
        PageBreak(),
    ]


def prender_titulos(historia):
    # Junta cada titulo (h1/h2) ao bloco seguinte para nao ficar sozinho no fim da pagina.
    saida = []
    pendentes = []
    for f in historia:
        if isinstance(f, Paragraph) and f.style.name in ("h1", "h2"):
            pendentes.append(f)
            continue
        if pendentes:
            saida.append(KeepTogether(pendentes + [f]))
            pendentes = []
        else:
            saida.append(f)
    return saida + pendentes


def gerar(caminho, titulo_rodape, historia):
    caminho.parent.mkdir(parents=True, exist_ok=True)
    historia = prender_titulos(historia)

    def rodape(canvas, doc):
        canvas.saveState()
        canvas.setFont("Sans", 8)
        canvas.setFillColor(CINZA)
        canvas.drawString(2 * cm, 1.2 * cm, f"AquiIoT — {titulo_rodape}")
        canvas.drawRightString(A4[0] - 2 * cm, 1.2 * cm, f"página {doc.page}")
        canvas.setStrokeColor(AZUL)
        canvas.setLineWidth(0.6)
        canvas.line(2 * cm, 1.55 * cm, A4[0] - 2 * cm, 1.55 * cm)
        canvas.restoreState()

    doc = SimpleDocTemplate(str(caminho), pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm,
                            topMargin=2 * cm, bottomMargin=2.2 * cm, title=f"AquiIoT — {titulo_rodape}",
                            author="Projeto AquiIoT")
    doc.build(historia, onFirstPage=lambda c, d: None, onLaterPages=rodape)
    print("gerado:", caminho.relative_to(RAIZ))


# ======================================================================
# ESP32 — SETOR
# ======================================================================
def pdf_esp32():
    h = capa("ESP32 do Setor", "Firmware <font face='Mono'>esp32_setor.ino</font>",
             "Este documento descreve o funcionamento do ESP32 instalado em cada setor da edificação. "
             "Ele cria a rede Wi-Fi local onde os chaveiros se conectam, registra a presença de cada "
             "chaveiro, lê os sensores do ambiente (luminosidade, som, temperatura e umidade) e envia "
             "tudo para o backend na Raspberry Pi pela internet.")

    h += [P("1. Visão geral", "h1"),
          P("O ESP32 do setor trabalha em dois modos de Wi-Fi ao mesmo tempo (<b>AP + STA</b>):"),
          *itens([
              "<b>Ponto de acesso (AP)</b>: cria a rede <font face='Mono'>AquiIoT_Setor_01</font> "
              "(IP 192.168.4.1, canal 6, até 4 clientes). Os chaveiros se conectam nela e enviam "
              "<font face='Mono'>POST /presenca</font>.",
              "<b>Estação (STA)</b>: conecta em um Wi-Fi com internet (configurado em "
              "<font face='Mono'>segredos.h</font>) e envia os dados ao backend por HTTPS.",
          ]),
          P("Se o <font face='Mono'>segredos.h</font> não existir ou estiver vazio, o ESP32 funciona apenas "
            "localmente: os chaveiros continuam sendo registrados e os dados podem ser consultados pelas "
            "rotas HTTP do próprio ESP32 e pelo Monitor Serial."),
          nota("<b>Atenção ao canal:</b> quando a estação (STA) está conectada, o rádio do ESP32 passa a usar "
               "o canal do roteador, e o AP acompanha esse canal. O valor <font face='Mono'>CANAL_WIFI = 6</font> "
               "só vale enquanto o STA não está conectado."),

          P("2. Hardware e ligações", "h1"),
          tabela(["Componente", "GPIO", "Tipo", "Observação"], [
              ["LDR (divisor de tensão)", "34", "ADC1, entrada analógica", "0 a 4095 (12 bits). Valores no limite geram aviso."],
              ["Microfone (saída AO)", "35", "ADC1, entrada analógica", "Mede a variação (máx − mín) numa janela de 25 ms."],
              ["DHT11 (dados)", "32", "Digital", "Temperatura (°C) e umidade (%). Biblioteca Adafruit DHT."],
              ["Buzzer", "25", "PWM 2 kHz (passivo)", "Desabilitado no código (HABILITAR_BUZZER = false)."],
          ], [4.2, 1.3, 3.8, 7.7]),
          P("Os pinos 34 e 35 são somente entrada e pertencem ao ADC1, que continua funcionando com o Wi-Fi "
            "ligado (o ADC2 não pode ser usado junto com o Wi-Fi)."),

          P("3. Configuração", "h1"),
          P("3.1 Arquivo <font face='Mono'>segredos.h</font> (não vai para o Git)", "h2"),
          P("Copie <font face='Mono'>segredos.exemplo.h</font> para <font face='Mono'>segredos.h</font> e preencha:"),
          codigo('''
const char* WIFI_STA_SSID  = "NOME_DA_REDE_COM_INTERNET";
const char* WIFI_STA_SENHA = "SENHA_DA_REDE";
const char* URL_BACKEND    = "https://raspberrypi.SEU_TAILNET.ts.net";  // sem barra no final
'''),
          P("3.2 Constantes no início do <font face='Mono'>esp32_setor.ino</font>", "h2"),
          tabela(["Constante", "Valor atual", "Função"], [
              ["ID_SETOR / NOME_SETOR", "SETOR_01 / Setor 01", "Identificação do setor nas APIs e no backend."],
              ["ESP_ID", "ESP32-01", "Identificação da placa."],
              ["NOME_REDE / SENHA_REDE", "AquiIoT_Setor_01 / 12345678", "Rede criada para os chaveiros (mín. 8 caracteres)."],
              ["CHAVE_DISPOSITIVO", "MUDE_ESTA_CHAVE_DOS_CHAVEIROS", "Chave que os chaveiros enviam no cabeçalho X-Device-Key. Deve ser igual no chaveiro."],
              ["CHAVE_BUZZER", "MUDE_ESTA_CHAVE_PRIVADA_DO_BUZZER", "Chave exigida em X-API-Key para acionar o buzzer."],
              ["MAX_CHAVEIROS", "8", "Tamanho da tabela de chaveiros na memória."],
              ["MAX_CLIENTES_WIFI", "4", "Conexões simultâneas no AP."],
          ], [4.5, 5.3, 7.2]),
          nota("As chaves <font face='Mono'>MUDE_ESTA_...</font> são valores de exemplo. Antes de uso real, troque "
               "por valores próprios (no ESP32 e em todos os chaveiros)."),

          P("3.3 Temporizações", "h2"),
          tabela(["Constante", "Valor", "Significado"], [
              ["INTERVALO_SENSORES_MS", "5 s", "Intervalo entre leituras dos sensores."],
              ["JANELA_MIC_MS", "25 ms", "Janela de amostragem do microfone."],
              ["PRESENCA_EXPIRA_MS", "15 s", "Sem mensagem nesse tempo, o chaveiro deixa de contar como presente."],
              ["INTERVALO_VERIFICAR_AP_MS", "10 s", "Verificação/reinício do ponto de acesso."],
              ["INTERVALO_ENVIO_SENSORES_MS", "30 s", "Envio das leituras ao backend."],
              ["INTERVALO_REENVIO_PRESENCA_MS", "60 s", "Reenvio da presença de um chaveiro que continua no setor (o backend marca offline após 120 s)."],
              ["ESPERA_APOS_FALHA_MS", "10 s", "Pausa nos envios após falha de rede ou erro 5xx."],
              ["INTERVALO_RECONECTAR_STA_MS", "30 s", "Nova tentativa de conectar ao Wi-Fi com internet."],
              ["TIMEOUT_BACKEND_MS", "5 s", "Tempo máximo de cada requisição HTTPS."],
              ["TEMPO_BIP_MS / INTERVALO_MINIMO_BIP_MS", "250 ms / 1 s", "Duração do bip e intervalo mínimo entre bips."],
          ], [5.8, 2.2, 9.0]),
          PageBreak(),

          P("4. Inicialização — setup()", "h1"),
          P("Ao ligar, o ESP32 prepara os sensores, liga o ponto de acesso, tenta conectar à internet (se houver "
            "configuração), registra as rotas HTTP e faz a primeira leitura dos sensores."),
          figura("esp32_setup", "Figura 1 — Fluxograma do setup()", altura_max=20 * cm),
          PageBreak(),

          P("5. Laço principal — loop()", "h1"),
          P("O <font face='Mono'>loop()</font> não usa <font face='Mono'>delay()</font> longos: cada tarefa "
            "verifica se já está na hora de agir, usando <font face='Mono'>millis()</font>. Assim o servidor "
            "HTTP continua respondendo aos chaveiros enquanto o resto acontece."),
          figura("esp32_loop", "Figura 2 — Fluxograma do loop()", altura_max=20 * cm),
          PageBreak(),

          P("6. Registro de presença dos chaveiros", "h1"),
          P("Cada chaveiro conectado ao AP envia, a cada 5 s, um <font face='Mono'>POST /presenca</font> com "
            "o seu ID e o RSSI (força do sinal que ele recebe do setor). O ESP32 valida a mensagem e atualiza "
            "a tabela em memória (até 8 registros)."),
          codigo('''
POST /presenca HTTP/1.1
Host: 192.168.4.1
X-Device-Key: MUDE_ESTA_CHAVE_DOS_CHAVEIROS
Content-Type: application/x-www-form-urlencoded

id=00000001&rssi=-25
'''),
          figura("esp32_presenca", "Figura 3 — Tratamento de POST /presenca", altura_max=13 * cm),
          tabela(["Resposta", "Quando acontece"], [
              ["200 Presença atualizada", "Mensagem aceita."],
              ["400", "ID não tem exatamente 8 dígitos, ou RSSI fora de -120 a -1 (ou com caracteres inválidos)."],
              ["401", "Cabeçalho X-Device-Key ausente ou diferente de CHAVE_DISPOSITIVO."],
              ["503", "Todas as 8 posições estão ocupadas por chaveiros ainda presentes."],
          ], [4.5, 12.5]),
          PageBreak(),

          P("7. Leitura e diagnóstico dos sensores", "h1"),
          P("A cada 5 s a função <font face='Mono'>lerSensores()</font> lê os três sensores. Para evitar alarmes "
            "falsos, uma condição só vira alerta depois de <b>3 leituras seguidas</b> "
            "(<font face='Mono'>LIMITE_FALHAS_SEGUIDAS</font>), e um evento de <i>RECUPERADO</i> é registrado "
            "quando ela some."),
          tabela(["Sensor", "Condição suspeita", "Evento gerado"], [
              ["LDR", "ADC ≤ 2 ou ≥ 4093 (limite do conversor)", "AVISO LDR: leituras no limite do ADC. Pode ser luz extrema ou divisor mal ligado."],
              ["Microfone", "Mínimo ≥ 4090 ou máximo ≤ 5, com variação ≤ 2 na janela de 25 ms", "AVISO MICROFONE: saída analógica persistente em nível extremo."],
              ["DHT11", "Leitura NaN ou umidade fora de 0–100 %", "ERRO DHT11 após 3 falhas seguidas. A leitura inválida nunca é enviada como valor atual (vira null)."],
          ], [2.4, 6.2, 8.4]),
          P("Os sensores ficam <b>DEGRADADO</b> quando há alerta no DHT11 ou no microfone. O aviso do LDR é só "
            "diagnóstico e não deixa o setor degradado."),
          P("7.1 Histórico de eventos", "h2"),
          P("Os eventos (INFO, AVISO, ERRO, RECUPERADO) ficam num buffer circular de 12 posições, somente em RAM: "
            "reiniciar o ESP32 apaga o histórico. Eles podem ser lidos em <font face='Mono'>GET /eventos</font> "
            "e são enviados ao backend um a um. Se mais de 12 eventos acontecerem antes do envio, os mais antigos "
            "são perdidos."),

          P("8. Envio ao backend (Raspberry Pi)", "h1"),
          P("A função <font face='Mono'>enviarAoBackend()</font> faz <b>no máximo uma requisição por volta do "
            "loop</b>, para não travar o atendimento aos chaveiros (cada requisição HTTPS leva 1–2 s por causa "
            "do TLS). A ordem de prioridade é: registrar o setor → presença → sensores → eventos."),
          nota("A conexão HTTPS usa <font face='Mono'>setInsecure()</font>: o certificado do servidor não é "
               "conferido. Para produção, troque por <font face='Mono'>setCACert()</font> com a raiz ISRG Root X1 "
               "(Let's Encrypt)."),
          figura("esp32_backend", "Figura 4 — Prioridade dos envios ao backend", altura_max=17 * cm),
          tabela(["Rota no backend", "Corpo JSON (exemplo)"], [
              ["POST /api/setores", '{"nome":"Setor 01","esp32":"ESP32-01"}'],
              ["POST /api/localizacao", '{"dispositivo":"00000001","setor":"Setor 01","rssi":-25}'],
              ["POST /api/eventos (leitura)", '{"tipo":"leitura_setor","nivel":"info","setor":"Setor 01","mensagem":"Leitura dos sensores do setor.","detalhes":{"esp32":"ESP32-01","temperatura_c":22.2,"umidade_percentual":64.0,"luminosidade_adc":0,"som_variacao":0,"sensores_degradados":false}}'],
              ["POST /api/eventos (evento)", '{"tipo":"setor","nivel":"aviso","setor":"Setor 01","mensagem":"LDR: ...","detalhes":{"esp32":"ESP32-01","tipo":"AVISO","origem":"LDR","uptime_ms":12345}}'],
          ], [4.3, 12.7]),
          P("Interpretação das respostas: <b>2xx</b> = aceito; <b>4xx</b> = dado recusado (não adianta reenviar, "
            "é dado como concluído; 409 no registro do setor significa “já cadastrado”); <b>5xx ou erro de rede</b> "
            "= falha, nova tentativa após 10 s."),

          P("9. Rotas HTTP do ESP32 (rede local)", "h1"),
          tabela(["Rota", "Método", "Descrição"], [
              ["/", "GET", "Texto simples com a lista de APIs."],
              ["/saude", "GET", "Estado do setor: uptime, clientes Wi-Fi, conexão com backend, estado dos sensores."],
              ["/dados", "GET", "Leituras completas dos sensores e lista de chaveiros presentes com RSSI."],
              ["/eventos", "GET", "Histórico de eventos em memória (até 12)."],
              ["/presenca", "POST", "Usado pelos chaveiros (X-Device-Key, id, rssi)."],
              ["/apitar", "POST", "Aciona o buzzer por 250 ms. Exige X-API-Key. Responde 503 se o buzzer estiver desabilitado e 429 se pedido em menos de 1 s."],
          ], [2.6, 1.8, 12.6]),

          P("10. Monitor Serial (115200 baud, final de linha “Nova linha”)", "h1"),
          tabela(["Comando", "Resposta"], [
              ["STATUS", "Resumo do setor, sensores e diagnóstico."],
              ["JSON", "Leitura atual em uma linha JSON."],
              ["BIP", "Bip local (se o buzzer estiver habilitado)."],
              ["AJUDA", "Lista de comandos."],
          ], [3, 14]),
          P("Exemplo de saída real (26/10/2026):"),
          codigo('''
=== AQUIIOT | SETOR 01 | TESTE LOCAL ===
[WIFI] Ponto de acesso em 192.168.4.1
[BACKEND] Conectando a rede a22...
[SENSORES] LDR: 0 | MIC: 4095 | Variacao: 0 | DHT11: 22.2 C / 64.0 % | Clientes Wi-Fi: 0 | ...
[BACKEND] Wi-Fi conectado. IP: 192.168.0.117
[BACKEND] Setor Setor 01 pronto no backend (HTTP 201).
[PRESENCA] Chaveiro 00000001, RSSI informado -25 dBm
[BACKEND] Presenca de 00000001 enviada.
'''),
          nota("Em placas com conversor USB CH9102 (como a usada nos testes), abrir o monitor serial pode "
               "manter o ESP32 em reset e a tela fica vazia. Se acontecer, pressione o botão EN/RST com o "
               "monitor aberto."),

          P("11. Compilação e gravação", "h1"),
          *itens([
              "Placa: <b>ESP32 Dev Module</b> (FQBN <font face='Mono'>esp32:esp32:esp32</font>), núcleo esp32 3.x.",
              "Biblioteca necessária: <b>DHT sensor library</b> (Adafruit) e sua dependência Adafruit Unified Sensor.",
              "A pasta do sketch deve se chamar <font face='Mono'>esp32_setor</font> (mesmo nome do .ino).",
          ]),
          codigo('''
arduino-cli lib install "DHT sensor library"
arduino-cli compile --fqbn esp32:esp32:esp32 -u -p /dev/ttyACM0 esp32_setor
'''),

          P("12. Pontos de atenção conhecidos", "h1"),
          *itens([
              "Nos testes, o LDR leu sempre 0 e o microfone sempre 4095: conferir as ligações dos GPIO 34 e 35.",
              "O buzzer está desabilitado (<font face='Mono'>HABILITAR_BUZZER = false</font>) até o circuito ser confirmado.",
              "Chaves de autenticação ainda com valores de exemplo.",
              "Certificado HTTPS não verificado (<font face='Mono'>setInsecure()</font>).",
              "Histórico de eventos apenas em RAM (12 posições).",
          ]),
          ]
    gerar(RAIZ / "esp32_setor" / "docs" / "esp32_setor.pdf", "ESP32 do Setor", h)


# ======================================================================
# ESP8266 — CHAVEIRO
# ======================================================================
def pdf_esp8266():
    h = capa("Chaveiro ESP8266", "Firmware <font face='Mono'>esp8266_chaveiro.ino</font>",
             "Este documento descreve o funcionamento do chaveiro inteligente do AquiIoT, baseado no "
             "módulo ESP8266 (ESP-01S). O chaveiro é o elemento móvel do sistema: ele se conecta à rede "
             "Wi-Fi do setor em que está e avisa periodicamente que está presente, informando a força do "
             "sinal recebido.")

    h += [P("1. Visão geral", "h1"),
          P("O chaveiro funciona apenas como <b>estação Wi-Fi</b>. Ele procura a rede "
            "<font face='Mono'>AquiIoT_Setor_01</font>, criada pelo ESP32 do setor, e, enquanto estiver "
            "conectado, envia a cada 5 segundos uma mensagem HTTP dizendo “estou aqui” junto com o RSSI."),
          P("Se o chaveiro sair da área de cobertura, a conexão cai e ele tenta reconectar sozinho. "
            "Do lado do setor, sem mensagens por 15 s o chaveiro deixa de ser considerado presente."),
          tabela(["Item", "Valor"], [
              ["Módulo", "ESP8266 — ESP-01S"],
              ["Alimentação", "3,3 V (o ESP8266 não tolera 5 V nos pinos)"],
              ["Sensores", "Nenhum nesta versão (apenas Wi-Fi)"],
              ["Comunicação", "Wi-Fi 2,4 GHz, HTTP simples dentro da rede do setor (WPA2)"],
              ["Serial", "115200 baud"],
          ], [4, 13]),

          P("2. Configuração", "h1"),
          P("Todas as configurações ficam no início do <font face='Mono'>esp8266_chaveiro.ino</font>. "
            "Os valores de rede e chave <b>precisam ser iguais aos do ESP32 do setor</b>."),
          tabela(["Constante", "Valor atual", "Função"], [
              ["NOME_REDE", "AquiIoT_Setor_01", "Rede criada pelo ESP32 do setor."],
              ["SENHA_REDE", "12345678", "Senha dessa rede."],
              ["CHAVE_DISPOSITIVO", "MUDE_ESTA_CHAVE_DOS_CHAVEIROS", "Enviada no cabeçalho X-Device-Key. Se diferente, o setor responde 401."],
              ["URL_PRESENCA", "http://192.168.4.1/presenca", "Endereço do ESP32 do setor dentro da rede dele."],
              ["ID_CHAVEIRO", "00000001", "Identificador único, exatamente 8 dígitos. Cada chaveiro deve ter o seu."],
              ["INTERVALO_ENVIO_MS", "5000 (5 s)", "Intervalo entre mensagens. Deve ser bem menor que os 15 s de expiração no setor."],
          ], [3.8, 5.4, 7.8]),
          nota("Para usar vários chaveiros, grave cada um com um <font face='Mono'>ID_CHAVEIRO</font> diferente. "
               "O setor aceita até 4 conexões Wi-Fi simultâneas e guarda até 8 registros."),
          PageBreak(),

          P("3. Funcionamento — setup() e loop()", "h1"),
          P("No <font face='Mono'>setup()</font> o chaveiro inicia a serial, coloca o Wi-Fi em modo estação "
            "com reconexão automática (<font face='Mono'>WiFi.persistent(false)</font> evita gravar a senha "
            "na flash a cada partida) e começa a conectar. O <font face='Mono'>loop()</font> acompanha o estado "
            "da conexão e dispara o envio a cada 5 s."),
          figura("esp8266_fluxo", "Figura 1 — Fluxograma do chaveiro (setup e loop)", altura_max=19 * cm),
          PageBreak(),

          P("4. Envio da presença — enviarPresenca()", "h1"),
          P("O RSSI é a potência, em dBm, com que o chaveiro recebe o sinal do setor. Quanto mais perto de "
            "zero, mais forte (ex.: -25 dBm é muito próximo; -85 dBm é longe). Ele é ajustado para a faixa "
            "aceita pelo setor (-120 a -1) antes do envio."),
          figura("esp8266_envio", "Figura 2 — Fluxograma do envio de presença", altura_max=12 * cm),
          P("Requisição enviada:"),
          codigo('''
POST /presenca HTTP/1.1
Host: 192.168.4.1
Content-Type: application/x-www-form-urlencoded
X-Device-Key: MUDE_ESTA_CHAVE_DOS_CHAVEIROS

id=00000001&rssi=-25
'''),
          tabela(["Resposta do setor", "Significado", "O que fazer"], [
              ["200", "Presença registrada.", "Nada."],
              ["400", "ID ou RSSI inválido.", "Conferir se ID_CHAVEIRO tem 8 dígitos."],
              ["401", "Chave de dispositivo incorreta.", "Igualar CHAVE_DISPOSITIVO ao ESP32 do setor."],
              ["503", "Tabela de chaveiros do setor cheia.", "Aguardar outros chaveiros expirarem (15 s)."],
              ["negativo", "Erro de conexão (timeout de 2 s, setor sem resposta).", "Conferir se o ESP32 está ligado e próximo."],
          ], [3.2, 6.3, 7.5]),

          P("5. Mensagens no Monitor Serial", "h1"),
          codigo('''
=== Chaveiro AquiIoT ===
ID: 00000001 | Rede: AquiIoT_Setor_01
[WIFI] Conectado ao setor. IPTESTE: 192.168.4.2
[PRESENCA] RSSI -25 dBm -> HTTP 200: Presenca atualizada.
[WIFI] Sinal do setor perdido, tentando reconectar...
'''),

          P("6. Compilação e gravação", "h1"),
          *itens([
              "Placa: <b>Generic ESP8266 Module</b> (FQBN <font face='Mono'>esp8266:esp8266:generic</font>).",
              "O ESP-01S é gravado por um adaptador USB-serial (nos testes, em <font face='Mono'>/dev/ttyUSB0</font>). "
              "Para entrar em modo de gravação, o GPIO0 deve estar em GND ao ligar (adaptadores próprios para ESP-01 já fazem isso).",
              "A pasta do sketch deve se chamar <font face='Mono'>esp8266_chaveiro</font> (mesmo nome do .ino).",
          ]),
          codigo('''
arduino-cli compile --fqbn esp8266:esp8266:generic -u -p /dev/ttyUSB0 esp8266_chaveiro
'''),

          P("7. Pontos de atenção conhecidos", "h1"),
          *itens([
              "A comunicação com o setor é HTTP sem criptografia; a proteção vem da senha WPA2 da rede do setor. "
              "A senha padrão 12345678 e a chave de exemplo devem ser trocadas antes de uso real.",
              "O chaveiro conhece apenas uma rede (um setor). Para vários setores, todos precisam usar o mesmo nome "
              "de rede ou o firmware deve escolher a rede de melhor sinal.",
              "O RSSI é medido pelo próprio chaveiro (sinal do AP recebido por ele), não pelo setor.",
              "O rótulo “IPTESTE” na mensagem de conexão é apenas texto de depuração.",
          ]),
          ]
    gerar(RAIZ / "esp8266_chaveiro" / "docs" / "esp8266_chaveiro.pdf", "Chaveiro ESP8266", h)


# ======================================================================
# VISAO GERAL DO PROJETO
# ======================================================================
def pdf_geral():
    h = capa("Funcionamento do Sistema", "Visão geral do projeto",
             "O AquiIoT é um sistema IoT de baixo custo para localizar pessoas e objetos em ambientes fechados, "
             "onde o GPS não funciona bem. Cada pessoa carrega um chaveiro inteligente; cada setor da edificação "
             "tem um ESP32 que detecta os chaveiros próximos e mede o ambiente; uma Raspberry Pi recebe, guarda "
             "e exibe tudo em um painel web.")

    h += [P("1. Objetivo", "h1"),
          P("Identificar <b>em qual setor</b> (sala, corredor, recepção…) cada chaveiro se encontra, e "
            "acompanhar as condições do ambiente de cada setor. O sistema não busca coordenadas exatas dentro "
            "de uma sala, e sim o ambiente onde o chaveiro está."),
          codigo('''
Chaveiro 01 -> Recepção
Chaveiro 02 -> Corredor A
Chaveiro 03 -> Sala 02
'''),
          P("Aplicações: hospitais, shopping centers, indústrias, universidades e prédios comerciais."),

          P("2. Componentes", "h1"),
          tabela(["Componente", "Hardware", "Papel no sistema", "Código"], [
              ["Chaveiro", "ESP8266 (ESP-01S)", "Elemento móvel. Conecta no Wi-Fi do setor e avisa a presença a cada 5 s com o RSSI.", "esp8266_chaveiro/"],
              ["Setor", "ESP32 + LDR, microfone, DHT11, buzzer", "Ponto fixo. Cria o Wi-Fi local, registra chaveiros, lê sensores e envia ao backend.", "esp32_setor/"],
              ["Unidade central", "Raspberry Pi", "Backend Node/Express (API + banco) e front-end React (Vite). Publicada na internet via Tailscale Funnel.", "branch feat/arquitetura-web"],
              ["Painel", "Navegador", "Mostra localização, sensores, estado de conexão, histórico e alertas.", "front-end React"],
          ], [2.6, 3.6, 7.0, 3.8]),

          P("3. Arquitetura", "h1"),
          figura("arquitetura", "Figura 1 — Arquitetura do AquiIoT", altura_max=17 * cm),
          PageBreak(),

          P("4. Caminho de uma informação de presença", "h1"),
          figura("sequencia", "Figura 2 — Do chaveiro ao painel", altura_max=12 * cm),
          P("4.1 Etapa local (chaveiro → ESP32)", "h2"),
          P("O chaveiro conecta na rede <font face='Mono'>AquiIoT_Setor_01</font> e envia "
            "<font face='Mono'>POST http://192.168.4.1/presenca</font> com <font face='Mono'>id</font> e "
            "<font face='Mono'>rssi</font>, autenticado pelo cabeçalho <font face='Mono'>X-Device-Key</font>. "
            "O ESP32 guarda o chaveiro numa tabela em memória; se não ouvir o chaveiro por 15 s, ele deixa "
            "de contar como presente."),
          P("4.2 Etapa remota (ESP32 → Raspberry Pi)", "h2"),
          P("Ao mesmo tempo, o ESP32 está conectado a um Wi-Fi com internet e envia ao backend, por HTTPS:"),
          tabela(["O quê", "Rota", "Quando"], [
              ["Cadastro do setor", "POST /api/setores", "Uma vez, ao conectar (201 criado ou 409 já existe)."],
              ["Localização do chaveiro", "POST /api/localizacao", "Assim que o chaveiro chega e depois a cada 60 s enquanto continua no setor."],
              ["Leitura dos sensores", "POST /api/eventos (tipo leitura_setor)", "A cada 30 s."],
              ["Eventos do setor", "POST /api/eventos (tipo setor)", "Quando ocorrem (avisos, erros, recuperações, conexões)."],
          ], [3.6, 5.4, 8.0]),
          P("O backend considera um chaveiro offline quando fica 120 s sem receber a localização dele."),

          P("5. Endereços e portas", "h1"),
          tabela(["Endereço", "Destino", "Situação"], [
              ["http://192.168.4.1", "ESP32 do setor (rede local dos chaveiros)", "Funcionando."],
              ["https://raspberrypi.tail656d5e.ts.net (443)", "Vite (5173) → repassa /api para o backend", "Funcionando. É o endereço usado hoje pelo ESP32."],
              ["https://raspberrypi.tail656d5e.ts.net:8443", "Backend direto (3000)", "Funnel ativo, mas a conexão fecha no handshake TLS."],
          ], [5.8, 5.6, 5.6]),
          nota("Como o ESP32 usa a porta 443, o envio depende do servidor do Vite estar rodando na Raspberry Pi. "
               "Para o ESP32 falar direto com o backend, é preciso corrigir a porta 8443 do Funnel "
               "(por exemplo, <font face='Mono'>sudo tailscale funnel --bg --https=8443 3000</font>) e voltar "
               "<font face='Mono'>URL_BACKEND</font> para <font face='Mono'>...ts.net:8443</font>."),

          P("6. Segurança", "h1"),
          *itens([
              "<b>Rede do setor</b>: WPA2 com senha (padrão 12345678 — trocar).",
              "<b>Chaveiro → setor</b>: chave compartilhada no cabeçalho X-Device-Key; ID com 8 dígitos e RSSI validados.",
              "<b>Buzzer</b>: chave separada no cabeçalho X-API-Key e limite de 1 bip por segundo.",
              "<b>Setor → backend</b>: HTTPS pelo Tailscale Funnel; o certificado ainda não é verificado no ESP32.",
              "<b>Segredos</b>: dados do Wi-Fi com internet e URL do backend ficam em "
              "<font face='Mono'>esp32_setor/segredos.h</font>, fora do Git.",
          ]),

          P("7. Organização do repositório", "h1"),
          codigo('''
AquiIoT/
├── Readme.md                     descrição do projeto
├── docs/
│   ├── AquiIoT_visao_geral.pdf   este documento
│   └── fontes/                   gerador dos PDFs e fluxogramas (Graphviz)
├── esp32_setor/                  firmware do ponto fixo (ESP32)
│   ├── esp32_setor.ino
│   ├── segredos.exemplo.h        modelo -> copiar para segredos.h
│   ├── segredos.h                (local, ignorado pelo Git)
│   └── docs/esp32_setor.pdf
└── esp8266_chaveiro/             firmware do chaveiro (ESP8266)
    ├── esp8266_chaveiro.ino
    └── docs/esp8266_chaveiro.pdf
'''),

          P("8. Como colocar o sistema para funcionar", "h1"),
          *itens([
              "<b>1.</b> Na Raspberry Pi, iniciar o backend (porta 3000) e o front-end (porta 5173) e conferir "
              "<font face='Mono'>tailscale funnel status</font>.",
              "<b>2.</b> Preencher <font face='Mono'>esp32_setor/segredos.h</font> e gravar o ESP32 do setor.",
              "<b>3.</b> Gravar cada chaveiro com um <font face='Mono'>ID_CHAVEIRO</font> diferente e a mesma "
              "rede/chave do setor.",
              "<b>4.</b> No Monitor Serial do ESP32 (115200), conferir “Setor pronto no backend” e "
              "“Presença de … enviada”.",
              "<b>5.</b> Abrir o painel web e verificar o chaveiro no setor.",
          ]),

          P("9. Limitações atuais e próximos passos", "h1"),
          *itens([
              "Apenas um setor implementado; o chaveiro conhece só a rede <font face='Mono'>AquiIoT_Setor_01</font>. "
              "Com vários setores, o chaveiro precisará escolher o de melhor sinal.",
              "Sensores de temperatura e luminosidade previstos para o chaveiro ainda não foram implementados.",
              "Leituras de sensores do setor vão ao backend como eventos (ainda não há tabela própria).",
              "Alto-falante de alerta na Raspberry Pi ainda não integrado.",
              "Corrigir a porta 8443 do Funnel, ativar verificação do certificado e trocar as chaves de exemplo.",
              "Conferir a ligação do LDR e do microfone (leituras fixas nos limites nos testes).",
          ]),
          PageBreak(),
          P("Apêndice — documentação de cada placa", "h1"),
          P("Os detalhes de cada firmware (fluxogramas internos, rotas, temporizações, mensagens e gravação) estão em:"),
          *itens([
              "<font face='Mono'>esp32_setor/docs/esp32_setor.pdf</font>",
              "<font face='Mono'>esp8266_chaveiro/docs/esp8266_chaveiro.pdf</font>",
          ]),
          ]
    gerar(RAIZ / "docs" / "AquiIoT_visao_geral.pdf", "Visão Geral", h)


if __name__ == "__main__":
    pdf_esp32()
    pdf_esp8266()
    pdf_geral()
