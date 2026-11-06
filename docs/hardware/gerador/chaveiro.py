"""Diagrama de ligações do chaveiro (esp8266/esp8266_chaveiro, ESP-01S).

Bateria de lítio 18650 (3,7 V) com um diodo 1N4001 em série no positivo: a
queda de ~0,7 V leva a tensão para perto de 3,3 V no ESP-01S. O firmware não
lê sensores. Só a vista de protoboard (imagem para o relatório).
"""
from fzlib import Sketch
from common import core, own, bundle

RED, BLACK = '#d32f2f', '#252525'


def build():
    esp, bat = own('esp01s'), own('bateria_18650')
    dio = core('diode_1N4001_300mil.fzp')
    sk = Sketch('AquiIoT - Chaveiro (ESP-01S)')
    BAT = sk.add(bat, 'Bateria 18650 3,7 V', bb=(0, 40))
    D1 = sk.add(dio, 'D1 (1N4001)', bb=(330, 40), bb_rot=180)
    E = sk.add(esp, 'ESP-01S', bb=(470, 0))
    _, plus = sk.pin(BAT, 'breadboard', '+')
    # Diodo na mesma altura do positivo; pernas até os pontos dos fios
    D1['pos']['breadboard'] = (plus[0] + 70, plus[1] - 4.5)
    dp = D1['pos']['breadboard']
    # O 1N4001 do Fritzing tem o catodo (faixa) à esquerda: girado 180°, a
    # faixa fica do lado do ESP-01S
    sk.bend(D1, 'anode', (dp[0] - 12, plus[1]))
    sk.bend(D1, 'cathode', (dp[0] + 52, plus[1]))
    w = lambda a, b, via=(), color=None: sk.wire('breadboard', a, b, via, color)
    w((BAT, '+'), (D1, 'anode'), color=RED)
    _, v33 = sk.pin(E, 'breadboard', '3V3')
    w((D1, 'cathode'), (E, '3V3'), via=[(v33[0] + 25, 'a'), (v33[0] + 25, 'b')], color=RED)
    _, g = sk.pin(E, 'breadboard', 'GND')
    w((BAT, '-'), (E, 'GND'), via=[('a', g[1] + 40), ('b', g[1] + 40)], color=BLACK)
    return sk, [esp, bat]


if __name__ == '__main__':
    import sys
    sk, own_parts = build()
    sk.save_fzz(sys.argv[1], bundle(own_parts))
    print('ok', sys.argv[1])
