"""Diagrama elétrico do ESP32 do setor (esp32/esp32_setor).

LDR em divisor no GPIO34, sensor de som KY-037 (AO) no GPIO35, DHT11 de 4 pinos
com pull-up de 10 kΩ no GPIO32 e buzzer ativo de 2 pinos no GPIO25. Tudo em 3,3 V.
Só a vista de protoboard (imagem para o relatório).
"""
from fzlib import Sketch, Symbol
from common import core, own, bundle, G

RED, BLACK = '#d32f2f', '#252525'
SIG = {'GPIO34': '#f9a825', 'GPIO35': '#2e7d32', 'GPIO32': '#1565c0', 'GPIO25': '#8e24aa'}


def build():
    esp, dht, mic, buz = own('esp32_devkit_v1'), own('dht11'), own('ky037'), own('buzzer_ativo')
    res, ldr, bb = core('resistor.fzp'), core('LDR_photocell_300mil_v5.fzp'), core('halfBreadboard.fzp')
    sk = Sketch('AquiIoT - ESP32 do setor')
    ten_k = {'resistance': '10kΩ'}

    # ------------------------------------------------ peças
    B = sk.add(bb, 'Protoboard', views=('breadboard',))
    E = sk.add(esp, 'ESP32')
    D = sk.add(dht, 'DHT11')
    M = sk.add(mic, 'Microfone')
    Z = sk.add(buz, 'Buzzer')
    L = sk.add(ldr, 'LDR')
    R1 = sk.add(res, 'R1', props=ten_k)
    R2 = sk.add(res, 'R2', props=ten_k, sch_rot=90)

    # ------------------------------------------------ protoboard
    # Módulos com os pinos na fileira F; trilho Y = 3V3, Z = GND
    sk.place(E, 'breadboard', 'GPIO34', (sk.hole(B, 'J30')[0] + 75, sk.hole(B, 'F1')[1] - 50))
    for inst, first, col in ((Z, '-', 2), (D, 'VCC', 8), (M, 'AO', 14)):
        sk.place(inst, 'breadboard', first, sk.hole(B, f'F{col}'))
    pins = [(Z, [('-', 2), ('+', 5)]),
            (D, [('VCC', 8), ('DATA', 9), ('NC', 10), ('GND', 11)]),
            (M, [('AO', 14), ('G', 15), ('+', 16), ('DO', 17)])]
    for inst, lst in pins:
        for name, col in lst:
            sk.plug(inst, name, B, f'F{col}')
    # Divisor do LDR: 3V3 (col. 20) - LDR - nó (col. 23) - R1 - GND (col. 26)
    hx = lambda n: sk.hole(B, n)
    L['pos']['breadboard'] = (hx('G20')[0] - 3, hx('G20')[1] - 22)
    R1['pos']['breadboard'] = (hx('H23')[0] - 2, hx('H23')[1] + 4)
    # Pull-up do DHT11 entre VCC (col. 8) e DATA (col. 9)
    R2['pos']['breadboard'] = (hx('H8')[0] - 15, hx('H8')[1] + 6)
    for inst, pin, hole in ((L, 'pin 0', 'G20'), (L, 'pin 1', 'G23'), (R1, 'Pin 0', 'H23'), (R1, 'Pin 1', 'H26'),
                            (R2, 'Pin 0', 'H8'), (R2, 'Pin 1', 'H9')):
        sk.bend(inst, pin, hx(hole))
        sk.plug(inst, pin, B, hole)

    w = lambda a, b, via=(), color=None: sk.wire('breadboard', a, b, via, color)
    # Alimentação: colunas até os trilhos
    for col, rail, color in ((2, 'Z', BLACK), (8, 'Y', RED), (11, 'Z', BLACK), (15, 'Z', BLACK), (16, 'Y', RED),
                             (20, 'Y', RED), (26, 'Z', BLACK)):
        w((B, f'J{col}'), (B, f'{rail}{col}'), color=color)
    # ESP32: 3V3 e GND aos trilhos, por baixo da placa
    yb = hx('Z1')[1]
    w((E, '3V3'), (B, 'Y29'), via=[('a', yb + 64), (hx('Y29')[0] + 6, yb + 64), (hx('Y29')[0] + 6, hx('Y29')[1] + 9)], color=RED)
    w((E, 'connector13'), (B, 'Z28'), via=[('a', yb + 56), ('b', yb + 56)], color=BLACK)
    # Sinais: desce da coluna, corre por baixo e sobe por uma faixa até o pino
    x_lane = hx('J30')[0] + 18
    for k, (gpio, col) in enumerate((('GPIO34', 23), ('GPIO35', 14), ('GPIO32', 9), ('GPIO25', 5))):
        y_lane = yb + 14 + 9 * k
        xl = x_lane + 9 * k
        w((B, f'J{col}'), (E, gpio), via=[('a', y_lane), (xl, y_lane), (xl, 'b')], color=SIG[gpio])

    return sk, [esp, dht, mic, buz]


if __name__ == '__main__':
    import sys
    sk, own_parts = build()
    sk.save_fzz(sys.argv[1], bundle(own_parts))
    print('ok', sys.argv[1])
