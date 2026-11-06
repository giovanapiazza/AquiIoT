"""Peças próprias do AquiIoT para o Fritzing (fzp + SVGs).

Todas as medidas em polegadas; o viewBox usa milésimos de polegada (mil), então
1 unidade = 1 mil e o passo dos pinos (0,1") = 100.
"""
from pathlib import Path
from xml.sax.saxutils import escape

FONT = "font-family=\"'Droid Sans', Arial, sans-serif\""
PIN_COLOR = '#c9a94a'


def svg_doc(w, h, body):
    return (f'<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny" '
            f'width="{w / 1000:.4f}in" height="{h / 1000:.4f}in" viewBox="0 0 {w:.1f} {h:.1f}">\n{body}</svg>\n')


def text(x, y, s, size=45, fill='#ffffff', anchor='start', weight='normal', rotate=None):
    tr = f' transform="rotate({rotate} {x} {y})"' if rotate else ''
    return (f'<text x="{x:.1f}" y="{y:.1f}" {FONT} font-size="{size}" fill="{fill}" '
            f'text-anchor="{anchor}" font-weight="{weight}"{tr}>{escape(s)}</text>\n')


class Spec:
    """Peça: pinos (id, nome, descrição) e as três vistas como funções."""

    def __init__(self, key, title, label, family, description, pins, props=None, tags=()):
        self.key, self.title, self.label, self.family = key, title, label, family
        self.description, self.pins, self.props, self.tags = description, pins, props or {}, tags
        self.bb = self.sch = self.pcb = None  # (w, h, corpo svg)

    @property
    def module_id(self):
        return f'AquiIoT_{self.key}_v1'

    def files(self):
        """{caminho relativo: conteúdo} no layout parts/ do Fritzing."""
        base = f'aquiiot_{self.key}'
        out = {}
        for view, data in (('breadboard', self.bb), ('schematic', self.sch), ('pcb', self.pcb)):
            out[f'svg/user/{view}/{base}_{view}.svg'] = svg_doc(*data)
        w, h, body = self.bb
        out[f'svg/user/icon/{base}_icon.svg'] = svg_doc(w, h, body.replace('id="breadboard"', 'id="icon"', 1))
        out[f'user/{base}.fzp'] = self.fzp(base)
        return out

    def fzp(self, base):
        props = ''.join(f'    <property name="{escape(k)}">{escape(v)}</property>\n' for k, v in {'family': self.family, **self.props}.items())
        tags = ''.join(f'    <tag>{escape(t)}</tag>\n' for t in self.tags)
        conns = ''
        for i, (name, desc) in enumerate(self.pins):
            conns += f'''    <connector id="connector{i}" name="{escape(name)}" type="male">
      <description>{escape(desc)}</description>
      <views>
        <breadboardView><p layer="breadboard" svgId="connector{i}pin"/></breadboardView>
        <schematicView><p layer="schematic" svgId="connector{i}pin" terminalId="connector{i}terminal"/></schematicView>
        <pcbView><p layer="copper0" svgId="connector{i}pad"/><p layer="copper1" svgId="connector{i}pad"/></pcbView>
      </views>
    </connector>
'''
        return f'''<?xml version="1.0" encoding="UTF-8"?>
<module fritzingVersion="1.0.8" moduleId="{self.module_id}">
  <version>1</version>
  <title>{escape(self.title)}</title>
  <label>{escape(self.label)}</label>
  <date>2026-11-06</date>
  <author>AquiIoT (UNIPAMPA)</author>
  <tags>
{tags}  </tags>
  <properties>
{props}  </properties>
  <description>{escape(self.description)}</description>
  <views>
    <iconView><layers image="icon/{base}_icon.svg"><layer layerId="icon"/></layers></iconView>
    <breadboardView><layers image="breadboard/{base}_breadboard.svg"><layer layerId="breadboard"/></layers></breadboardView>
    <schematicView><layers image="schematic/{base}_schematic.svg"><layer layerId="schematic"/></layers></schematicView>
    <pcbView><layers image="pcb/{base}_pcb.svg"><layer layerId="copper0"/><layer layerId="silkscreen"/><layer layerId="copper1"/></layers></pcbView>
  </views>
  <connectors>
{conns}  </connectors>
</module>
'''


# ------------------------------------------------------------- desenhos

def header_pin(i, x, y):
    """Pino macho visto de cima (quadrado dourado), centro em (x, y)."""
    return (f'<rect x="{x - 32:.1f}" y="{y - 32:.1f}" width="64" height="64" fill="#2b2b2b"/>\n'
            f'<rect id="connector{i}pin" x="{x - 18:.1f}" y="{y - 18:.1f}" width="36" height="36" fill="{PIN_COLOR}"/>\n')


def pcb_view(positions, w, h, silk_rects=()):
    """Furos de 0,1" nas posições (centro) dadas, com contorno na serigrafia."""
    silk = f'<rect x="10" y="10" width="{w - 20}" height="{h - 20}" fill="none" stroke="#ffffff" stroke-width="10"/>\n'
    for r in silk_rects:
        silk += r
    pads = ''
    for i, (x, y) in enumerate(positions):
        shape = (f'<rect id="connector{i}pad" x="{x - 37.5}" y="{y - 37.5}" width="75" height="75" fill="none" stroke="#F7BD13" stroke-width="20"/>\n'
                 if i == 0 else
                 f'<circle id="connector{i}pad" cx="{x}" cy="{y}" r="27.5" fill="none" stroke="#F7BD13" stroke-width="20"/>\n')
        pads += shape
    body = (f'<g id="silkscreen">\n{silk}</g>\n'
            f'<g id="copper1"><g id="copper0">\n{pads}</g></g>\n')
    return (w, h, body)


def sch_box(title, left, right, top=(), bottom=(), box_w=1000, pitch=100, label_size=60, extra='', bpitch=200):
    """Símbolo retangular. left/right/top/bottom: listas de (índice, rótulo) ou None
    (espaço vazio). Pinos de 0,1"; terminais na grade de 0,1"."""
    pin_len = 100
    rows = max(len(left), len(right), 1)
    cols = max(len(top), len(bottom), 0)
    box_w = max(box_w, (cols + 1) * bpitch)
    box_h = (rows + 1) * pitch if (left or right) else 300
    title_h = 100
    off_x = pin_len if (left or right) else 0
    off_y = title_h + (pin_len if top else 0)
    W = box_w + 2 * off_x
    H = off_y + box_h + (pin_len if bottom else 0)
    if not left and not right:
        W = box_w
    s = f'<g id="schematic">\n'
    s += f'<rect x="{off_x}" y="{off_y}" width="{box_w}" height="{box_h}" fill="#ffffff" stroke="#000000" stroke-width="10"/>\n'
    s += text(off_x + box_w / 2, title_h - 25, title, size=70, fill='#000000', anchor='middle', weight='bold')
    def pin(i, x1, y1, x2, y2, tx, ty, label, anchor, rot=None):
        out = f'<line id="connector{i}pin" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="#000000" stroke-width="10" stroke-linecap="round"/>\n'
        out += f'<rect id="connector{i}terminal" x="{x2 - 5 if x1 != x2 else x2 - 5}" y="{y2 - 5}" width="10" height="10" fill="none" stroke="none"/>\n'
        out += text(tx, ty, label, size=label_size, fill='#000000', anchor=anchor, rotate=rot)
        return out
    for k, p in enumerate(left):
        if p is None: continue
        i, lab = p; y = off_y + (k + 1) * pitch
        s += pin(i, off_x, y, 0, y, off_x + 20, y + label_size * 0.35, lab, 'start')
    for k, p in enumerate(right):
        if p is None: continue
        i, lab = p; y = off_y + (k + 1) * pitch
        s += pin(i, off_x + box_w, y, W, y, off_x + box_w - 20, y + label_size * 0.35, lab, 'end')
    for k, p in enumerate(top):
        if p is None: continue
        i, lab = p; x = off_x + (k + 1) * bpitch
        s += pin(i, x, off_y, x, off_y - pin_len, x, off_y + 30 + label_size * 0.7, lab, 'middle')
    for k, p in enumerate(bottom):
        if p is None: continue
        i, lab = p; x = off_x + (k + 1) * bpitch
        yb = off_y + box_h
        s += pin(i, x, yb, x, yb + pin_len, x, yb - 30, lab, 'middle')
    s += extra + '</g>\n'
    return (W, H, s)


# ------------------------------------------------------------- ESP32

ESP32_LEFT = [('EN', 'EN', 'Reset (ativo em nível baixo)'), ('GPIO36', 'VP', 'GPIO36 / SENSOR_VP, só entrada, ADC1_CH0'),
              ('GPIO39', 'VN', 'GPIO39 / SENSOR_VN, só entrada, ADC1_CH3'), ('GPIO34', 'D34', 'Só entrada, ADC1_CH6 — LDR no AquiIoT'),
              ('GPIO35', 'D35', 'Só entrada, ADC1_CH7 — microfone (AO) no AquiIoT'), ('GPIO32', 'D32', 'ADC1_CH4 — DHT11 (dados) no AquiIoT'),
              ('GPIO33', 'D33', 'ADC1_CH5'), ('GPIO25', 'D25', 'DAC1 — buzzer no AquiIoT'), ('GPIO26', 'D26', 'DAC2'),
              ('GPIO27', 'D27', ''), ('GPIO14', 'D14', ''), ('GPIO12', 'D12', 'Strapping (MTDI): deixe em nível baixo no boot'),
              ('GPIO13', 'D13', ''), ('GND', 'GND', 'Terra'), ('VIN', 'VIN', 'Entrada 5 V (mesma linha do USB)')]
ESP32_RIGHT = [('GPIO23', 'D23', 'VSPI MOSI'), ('GPIO22', 'D22', 'I2C SCL'), ('GPIO1 (TX0)', 'TX0', 'UART0 TX (USB)'),
               ('GPIO3 (RX0)', 'RX0', 'UART0 RX (USB)'), ('GPIO21', 'D21', 'I2C SDA'), ('GPIO19', 'D19', 'VSPI MISO'),
               ('GPIO18', 'D18', 'VSPI SCK'), ('GPIO5', 'D5', 'Strapping; VSPI SS'), ('GPIO17 (TX2)', 'TX2', 'UART2 TX'),
               ('GPIO16 (RX2)', 'RX2', 'UART2 RX'), ('GPIO4', 'D4', ''), ('GPIO2', 'D2', 'LED azul da placa; strapping'),
               ('GPIO15', 'D15', 'Strapping (MTDO)'), ('GND', 'GND', 'Terra'), ('3V3', '3V3', 'Saída 3,3 V do regulador da placa')]


def esp32():
    pins = [(n, d) for n, _, d in ESP32_LEFT] + [(n, d) for n, _, d in ESP32_RIGHT]
    # nomes repetidos (GND) precisam ser únicos para o gerador: GND esquerdo / direito
    pins[13] = ('GND', 'Terra (lado esquerdo, ao lado do VIN)')
    pins[15 + 13] = ('GND', 'Terra (lado direito, ao lado do 3V3)')
    sp = Spec('esp32_devkit_v1', 'ESP32 DevKit V1 (DOIT, 30 pinos)', 'ESP', 'microcontroller board (esp32)',
              'Placa ESP32 DevKit V1 (DOIT) de 30 pinos, módulo ESP-WROOM-32, USB micro e regulador 3,3 V. '
              'Pinagem conferida com a serigrafia da placa. Peça criada para o projeto AquiIoT.',
              pins, {'chip': 'ESP32-D0WD (ESP-WROOM-32)', 'pins': '30', 'variant': 'DOIT DevKit V1'},
              tags=('ESP32', 'DevKit', 'WROOM', 'AquiIoT'))
    # protoboard: 1,10" x 2,10"; fileiras a 1,0" uma da outra
    W, H = 1100, 2100
    lx, rx, y0 = 50, 1050, 350
    b = '<g id="breadboard">\n'
    b += f'<rect x="0" y="0" width="{W}" height="{H}" rx="40" fill="#1f2a44"/>\n'
    # módulo WROOM: antena e blindagem
    b += '<rect x="230" y="20" width="640" height="1000" rx="12" fill="#2b2b2b"/>\n'
    b += '<path d="M290 70 h80 v120 h60 v-120 h60 v120 h60 v-120 h60 v120 h60 v-120 h60" fill="none" stroke="#c9a94a" stroke-width="18"/>\n'
    b += '<rect x="260" y="300" width="580" height="690" rx="10" fill="#c7c9cc" stroke="#9a9ca0" stroke-width="8"/>\n'
    b += text(550, 560, 'ESP-WROOM-32', size=70, fill='#3a3a3a', anchor='middle', weight='bold')
    b += text(550, 650, 'ESP32-D0WD', size=55, fill='#3a3a3a', anchor='middle')
    b += text(550, 1200, 'ESP32', size=90, fill='#ffffff', anchor='middle', weight='bold')
    b += text(550, 1290, 'DevKit V1', size=60, fill='#ffffff', anchor='middle')
    # regulador, botões e USB
    b += '<rect x="470" y="1420" width="160" height="110" fill="#111"/>\n'
    for bx, lab in ((330, 'EN'), (770, 'BOOT')):
        b += f'<rect x="{bx - 60}" y="1820" width="120" height="120" rx="10" fill="#d9d9d9"/><circle cx="{bx}" cy="1880" r="35" fill="#555"/>\n'
        b += text(bx, 2010, lab, size=45, anchor='middle')
    b += '<rect x="400" y="1900" width="300" height="200" rx="15" fill="#b8bcc2" stroke="#7c8086" stroke-width="10"/>\n'
    b += text(550, 1880, 'USB', size=45, anchor='middle')
    b += '<circle cx="550" cy="1600" r="22" fill="#2f7dff"/>\n'
    for k, (_, silk, _) in enumerate(ESP32_LEFT):
        y = y0 + k * 100
        b += header_pin(k, lx, y) + text(lx + 55, y + 16, silk, size=45)
    for k, (_, silk, _) in enumerate(ESP32_RIGHT):
        y = y0 + k * 100
        b += header_pin(15 + k, rx, y) + text(rx - 55, y + 16, silk, size=45, anchor='end')
    b += '</g>\n'
    sp.bb = (W, H, b)
    left = [(k, n if not n.startswith('GPIO3') or k > 2 else n) for k, (n, _, _) in enumerate(ESP32_LEFT)]
    right = [(15 + k, n) for k, (n, _, _) in enumerate(ESP32_RIGHT)]
    sp.sch = sch_box('ESP32 DevKit V1', left, right, box_w=1200)
    sp.pcb = pcb_view([(lx, y0 + k * 100) for k in range(15)] + [(rx, y0 + k * 100) for k in range(15)], W, H)
    return sp


# ------------------------------------------------------------- ESP-01S

def esp01s():
    # fileira de cima: TX EN RST 3V3 ; de baixo: GND IO2 IO0 RX (GND e 3V3 em cantos opostos)
    pins = [('GND', 'Terra'), ('GPIO2', 'GPIO2 (LED azul no ESP-01S); precisa estar em nível alto no boot'),
            ('GPIO0', 'GPIO0: nível baixo no boot = modo de gravação'), ('RXD', 'UART RX (GPIO3)'),
            ('TXD', 'UART TX (GPIO1)'), ('EN', 'CH_PD/EN: já tem pull-up de 12 kΩ no ESP-01S'),
            ('RST', 'Reset (ativo em nível baixo), com pull-up no ESP-01S'), ('3V3', 'Alimentação 3,3 V (não tolera 5 V)')]
    sp = Spec('esp01s', 'ESP-01S (ESP8266)', 'U', 'microcontroller board (esp8266)',
              'Módulo ESP-01S com ESP8266EX, 1 MB de flash e antena na placa. Pinos 2x4 de 0,1". '
              'O ESP-01S já traz pull-ups em EN e RST. Peça criada para o projeto AquiIoT.',
              pins, {'chip': 'ESP8266EX', 'flash': '1 MB'}, tags=('ESP8266', 'ESP-01S', 'AquiIoT'))
    W, H = 570, 980
    xs = [135, 235, 335, 435]
    b = '<g id="breadboard">\n'
    b += f'<rect x="0" y="0" width="{W}" height="{H}" rx="20" fill="#1c1c1c"/>\n'
    b += '<path d="M60 60 h70 v110 h60 v-110 h60 v110 h60 v-110 h60 v110 h60 v-110 h60" fill="none" stroke="#c9a94a" stroke-width="16"/>\n'
    b += '<rect x="150" y="300" width="270" height="270" fill="#2e2e2e" stroke="#555" stroke-width="6"/>\n'
    b += text(285, 450, 'ESP8266', size=50, anchor='middle')
    b += '<rect x="100" y="600" width="140" height="90" fill="#333"/>\n'
    b += text(285, 260, 'ESP-01S', size=55, anchor='middle', weight='bold')
    b += '<circle cx="470" cy="640" r="18" fill="#2f7dff"/>\n'
    for k, x in enumerate(xs):
        b += header_pin(4 + k, x, 780) + header_pin(k, x, 880)
    for k, lab in enumerate(['TX', 'EN', 'RST', '3V3']):
        b += text(xs[k], 735, lab, size=36, anchor='middle')
    for k, lab in enumerate(['GND', 'IO2', 'IO0', 'RX']):
        b += text(xs[k], 960, lab, size=36, anchor='middle')
    b += '</g>\n'
    sp.bb = (W, H, b)
    sp.sch = sch_box('ESP-01S', [(7, '3V3'), (5, 'EN'), (6, 'RST'), (0, 'GND')],
                     [(4, 'TXD'), (3, 'RXD'), (2, 'GPIO0'), (1, 'GPIO2')], box_w=700)
    sp.pcb = pcb_view([(x, 880) for x in xs] + [(x, 780) for x in xs], W, H)
    return sp


# ------------------------------------------------------------- DHT11

def dht11():
    pins = [('VCC', 'Alimentação 3,3 a 5,5 V'), ('DATA', 'Dados (um fio), precisa de pull-up de 10 kΩ'),
            ('NC', 'Não conectado'), ('GND', 'Terra')]
    sp = Spec('dht11', 'DHT11 (4 pinos)', 'U', 'temperature & humidity sensor',
              'Sensor DHT11 de temperatura e umidade, componente avulso de 4 pinos (passo 0,1"). '
              'O pino de dados precisa de resistor de pull-up (10 kΩ para VCC). Peça criada para o projeto AquiIoT.',
              pins, {'sensor': 'DHT11', 'faixa': '0–50 °C, 20–90 %UR'}, tags=('DHT11', 'temperatura', 'umidade', 'AquiIoT'))
    W, H = 480, 900
    xs = [90, 190, 290, 390]
    b = '<g id="breadboard">\n'
    b += '<rect x="10" y="0" width="460" height="620" rx="25" fill="#3d8fd6"/>\n'
    for r in range(6):
        for c in range(5):
            b += f'<rect x="{60 + c * 75}" y="{40 + r * 75}" width="55" height="55" rx="8" fill="#2a6aa6"/>\n'
    b += text(240, 560, 'DHT11', size=60, anchor='middle', weight='bold')
    for k, x in enumerate(xs):
        b += f'<rect x="{x - 12}" y="620" width="24" height="230" fill="#b9b9b9"/>\n'
        b += f'<rect id="connector{k}pin" x="{x - 18}" y="830" width="36" height="36" fill="{PIN_COLOR}"/>\n'
    for k, lab in enumerate(['VCC', 'DATA', 'NC', 'GND']):
        b += text(xs[k], 700, lab, size=34, fill='#222', anchor='middle', rotate=-90)
    b += '</g>\n'
    sp.bb = (W, H, b)
    sp.sch = sch_box('DHT11', [(0, 'VCC'), (3, 'GND')], [(1, 'DATA'), (2, 'NC')], box_w=600)
    sp.pcb = pcb_view([(x, 848) for x in xs], W, H)
    return sp


# ------------------------------------------------------------- KY-038

def ky038():
    pins = [('AO', 'Saída analógica do microfone'), ('G', 'Terra'), ('+', 'Alimentação (3,3 V no ESP32)'),
            ('DO', 'Saída digital (limiar ajustado no trimpot)')]
    sp = Spec('ky038', 'Módulo de microfone KY-038', 'MIC', 'sound sensor',
              'Módulo KY-038: microfone de eletreto, comparador LM393 e trimpot. AO = sinal analógico, DO = digital. '
              'Peça criada para o projeto AquiIoT.',
              pins, {'modulo': 'KY-038'}, tags=('KY-038', 'microfone', 'som', 'AquiIoT'))
    W, H = 600, 1450
    xs = [150, 250, 350, 450]
    b = '<g id="breadboard">\n'
    b += '<rect x="0" y="0" width="600" height="1250" rx="30" fill="#1a1a1a"/>\n'
    b += '<circle cx="300" cy="230" r="190" fill="#c0c0c0" stroke="#888" stroke-width="10"/>\n'
    b += '<circle cx="300" cy="230" r="130" fill="#2a2a2a"/>\n'
    b += '<rect x="170" y="520" width="260" height="260" rx="10" fill="#1f5fbf"/><circle cx="300" cy="650" r="70" fill="#d8b04a"/>\n'
    b += '<path d="M260 650 h80 M300 610 v80" stroke="#6b5420" stroke-width="16"/>\n'
    b += '<rect x="200" y="840" width="200" height="120" fill="#111"/>\n'
    b += text(300, 1040, 'KY-038', size=60, anchor='middle', weight='bold')
    for k, x in enumerate(xs):
        b += f'<rect x="{x - 12}" y="1160" width="24" height="230" fill="#b9b9b9"/>\n'
        b += f'<rect id="connector{k}pin" x="{x - 18}" y="1380" width="36" height="36" fill="{PIN_COLOR}"/>\n'
    for k, lab in enumerate(['AO', 'G', '+', 'DO']):
        b += text(xs[k], 1140, lab, size=42, anchor='middle')
    b += '</g>\n'
    sp.bb = (W, H, b)
    sp.sch = sch_box('KY-038', [(2, '+'), (1, 'G')], [(0, 'AO'), (3, 'DO')], box_w=600)
    sp.pcb = pcb_view([(x, 1398) for x in xs], W, H)
    return sp


# ------------------------------------------------------------- LDO 3,3 V

def ldo():
    pins = [('VIN', 'Entrada (bateria, até 6 V)'), ('GND', 'Terra'), ('VOUT', 'Saída 3,3 V')]
    sp = Spec('ldo33', 'Regulador LDO 3,3 V (≥ 500 mA)', 'U', 'voltage regulator',
              'Regulador linear de baixa queda, saída 3,3 V e pelo menos 500 mA (ex.: ME6211C33, RT9013-33, HT7833). '
              'Desenho genérico em placa adaptadora: confira a pinagem do encapsulamento escolhido no datasheet. '
              'Peça criada para o projeto AquiIoT.',
              pins, {'voltage': '3.3V', 'corrente': '≥ 500 mA'}, tags=('LDO', 'regulador', '3.3V', 'AquiIoT'))
    W, H = 450, 560
    xs = [125, 225, 325]
    b = '<g id="breadboard">\n'
    b += '<rect x="0" y="0" width="450" height="440" rx="20" fill="#3b2a6b"/>\n'
    b += '<rect x="140" y="80" width="170" height="120" fill="#151515"/>\n'
    b += text(225, 270, 'LDO 3V3', size=56, anchor='middle', weight='bold')
    b += '<rect x="80" y="40" width="40" height="60" fill="#a0784a"/><rect x="330" y="40" width="40" height="60" fill="#a0784a"/>\n'
    for k, x in enumerate(xs):
        b += f'<rect x="{x - 12}" y="440" width="24" height="90" fill="#b9b9b9"/>\n'
        b += f'<rect id="connector{k}pin" x="{x - 18}" y="510" width="36" height="36" fill="{PIN_COLOR}"/>\n'
    for k, lab in enumerate(['VIN', 'GND', 'VOUT']):
        b += text(xs[k], 400, lab, size=30, anchor='middle')
    b += '</g>\n'
    sp.bb = (W, H, b)
    sp.sch = sch_box('LDO 3,3 V', [(0, 'VIN'), None], [(2, 'VOUT'), None], bottom=[None, (1, 'GND')], box_w=600)
    sp.pcb = pcb_view([(x, 528) for x in xs], W, H)
    return sp


ALL = [esp32, esp01s, dht11, ky038, ldo]


def write(root):
    """Escreve as peças em root/ (layout de parts/ do Fritzing)."""
    root = Path(root)
    specs = [f() for f in ALL]
    for sp in specs:
        for rel, content in sp.files().items():
            p = root / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(content, encoding='utf-8')
    return specs


# ------------------------------------------------------------- KY-037

def ky037():
    sp = ky038()
    sp.key, sp.title, sp.label = 'ky037', 'Módulo sensor de som KY-037', 'MIC'
    sp.description = ('Módulo KY-037 (sensibilidade ao som): microfone de eletreto grande, comparador LM393 e trimpot. '
                      'AO = sinal analógico, DO = digital. Peça criada para o projeto AquiIoT.')
    sp.props, sp.tags = {'modulo': 'KY-037'}, ('KY-037', 'microfone', 'som', 'AquiIoT')
    w, h, b = sp.bb
    b = b.replace('<circle cx="300" cy="230" r="190"', '<circle cx="300" cy="250" r="240"').replace(
        '<circle cx="300" cy="230" r="130"', '<circle cx="300" cy="250" r="170"').replace('KY-038', 'KY-037')
    sp.bb = (w, h, b)
    sp.sch = sch_box('KY-037', [(2, '+'), (1, 'G')], [(0, 'AO'), (3, 'DO')], box_w=600)
    return sp


# ------------------------------------------------------------- buzzer ativo

def buzzer():
    pins = [('-', 'Negativo (GND)'), ('+', 'Positivo (sinal do GPIO)')]
    sp = Spec('buzzer_ativo', 'Buzzer ativo 12 mm (2 pinos)', 'BZ', 'buzzer',
              'Buzzer ativo de 12 mm com oscilador interno: soa com nível alto no pino +. '
              'Pinos a 0,3" (7,6 mm). Peça criada para o projeto AquiIoT.',
              pins, {'tipo': 'ativo', 'tensão': '3–5 V'}, tags=('buzzer', 'ativo', 'AquiIoT'))
    W, H = 500, 760
    xs = [100, 400]
    b = '<g id="breadboard">\n'
    b += '<circle cx="250" cy="250" r="240" fill="#151515"/>\n'
    b += '<circle cx="250" cy="250" r="60" fill="#2d2d2d"/>\n'
    b += text(250, 160, '+', size=90, anchor='middle', weight='bold')
    b += text(250, 420, 'BUZZER', size=50, anchor='middle')
    for k, x in enumerate(xs):
        b += f'<rect x="{x - 12}" y="470" width="24" height="250" fill="#b9b9b9"/>\n'
        b += f'<rect id="connector{k}pin" x="{x - 18}" y="700" width="36" height="36" fill="{PIN_COLOR}"/>\n'
    b += text(100, 610, '−', size=60, fill='#222', anchor='middle', weight='bold')
    b += text(400, 610, '+', size=60, fill='#c62828', anchor='middle', weight='bold')
    b += '</g>\n'
    sp.bb = (W, H, b)
    sp.sch = sch_box('Buzzer', [(1, '+')], [(0, '−')], box_w=500)
    sp.pcb = pcb_view([(x, 718) for x in xs], W, H)
    return sp


# ------------------------------------------------------------- bateria 18650

def bat18650():
    pins = [('+', 'Positivo (3,0–4,2 V)'), ('-', 'Negativo')]
    sp = Spec('bateria_18650', 'Bateria de lítio 18650 3,7 V (com suporte)', 'BAT', 'battery',
              'Célula de íon-lítio 18650, 3,7 V nominal (4,2 V carregada), em suporte com fios. '
              'Peça criada para o projeto AquiIoT.',
              pins, {'voltage': '3.7V', 'formato': '18650'}, tags=('18650', 'bateria', 'lítio', 'AquiIoT'))
    W, H = 3100, 900
    b = '<g id="breadboard">\n'
    b += '<rect x="0" y="100" width="2800" height="800" rx="60" fill="#1b1b1b"/>\n'
    b += '<rect x="120" y="190" width="2560" height="620" rx="80" fill="#1e88e5"/>\n'
    b += '<rect x="2560" y="330" width="140" height="340" rx="30" fill="#cfd8dc"/>\n'
    b += text(1350, 470, '18650', size=220, anchor='middle', weight='bold')
    b += text(1350, 680, 'Li-ion 3,7 V', size=150, anchor='middle')
    b += text(2450, 560, '+', size=260, anchor='middle', weight='bold')
    b += text(260, 560, '−', size=260, anchor='middle', weight='bold')
    # fios do suporte até os pinos à direita
    b += '<path d="M2780 300 C2950 300 2950 200 3050 200" fill="none" stroke="#d32f2f" stroke-width="40"/>\n'
    b += '<path d="M60 860 C60 960 2900 960 2950 700 L3050 700" fill="none" stroke="#212121" stroke-width="40"/>\n'
    b += f'<rect id="connector0pin" x="3032" y="182" width="36" height="36" fill="{PIN_COLOR}"/>\n'
    b += f'<rect id="connector1pin" x="3032" y="682" width="36" height="36" fill="{PIN_COLOR}"/>\n'
    b += '</g>\n'
    sp.bb = (W, H + 100, b)
    sp.sch = sch_box('18650 3,7 V', [], [(0, '+'), (1, '−')], box_w=600)
    sp.pcb = pcb_view([(3050, 200), (3050, 700)], W, H + 100)
    return sp


ALL = [esp32, esp01s, dht11, ky037, buzzer, bat18650]
