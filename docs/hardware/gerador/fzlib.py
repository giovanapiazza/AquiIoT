"""Leitura de peças do Fritzing (.fzp + SVG) e geração de sketches (.fz/.fzz).

Coordenadas da cena do Fritzing: pixels a 90 dpi. svgelements com ppi=90 já
devolve as caixas dos elementos nesse sistema, com transformações aplicadas.
"""
import io
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

from svgelements import SVG, SimpleLine, Line, Path as SPath

DPI = 90.0
VIEWS = {'breadboard': 'breadboardView', 'schematic': 'schematicView', 'pcb': 'pcbView'}


def _strip(tag):
    return tag.split('}', 1)[-1]


class Part:
    """Peça: conectores, SVGs e posições dos pinos em cada vista."""

    def __init__(self, fzp_path, svg_root, svg_sub='core'):
        self.fzp_path = Path(fzp_path)
        self.svg_root = Path(svg_root)  # .../svg
        self.svg_sub = svg_sub
        tree = ET.parse(self.fzp_path)
        root = tree.getroot()
        self.module_id = root.get('moduleId')
        self.title = (root.findtext('title') or '').strip()
        self.label = (root.findtext('label') or 'U').strip()
        self.images = {}
        for vname, vtag in VIEWS.items():
            v = root.find(f'views/{vtag}/layers')
            if v is not None:
                self.images[vname] = v.get('image')
        self.connectors = {}  # id -> {name, views: {view: {svgId, terminalId, legId}}}
        for c in root.iter('connector'):
            if c.get('id') is None or c.find('views') is None:
                continue
            info = {'name': c.get('name'), 'views': {}}
            for vname, vtag in VIEWS.items():
                p = c.find(f'views/{vtag}/p')
                if p is not None:
                    info['views'][vname] = {k: p.get(k) for k in ('svgId', 'terminalId', 'legId', 'layer')}
            self.connectors[c.get('id')] = info
        self._svg = {}

    def by_name(self, name):
        hits = [cid for cid, c in self.connectors.items() if c['name'] == name]
        if len(hits) != 1:
            raise KeyError(f'{self.title}: conector {name!r} -> {hits}')
        return hits[0]

    def svg_file(self, view):
        img = self.images[view]
        return self.svg_root / self.svg_sub / img

    def _elements(self, view):
        if view not in self._svg:
            path = self.svg_file(view)
            raw = path.read_text(encoding='utf-8', errors='replace')
            root = re.search(r'<svg\b[^>]*>', raw, re.S).group(0)
            wattr = re.search(r'\swidth\s*=\s*["\']([^"\']+)', root)
            # Como o Fritzing: largura em px (ou sem unidade) vale 72 dpi em
            # arquivos do Illustrator e 90 dpi nos demais
            scale = 1.0
            if wattr and re.fullmatch(r'[\d.]+(px)?', wattr.group(1).strip()) and 'Illustrator' in raw[:2000]:
                scale = DPI / 72.0
            svg = SVG.parse(str(path), reify=True, ppi=DPI)
            ids = {}
            for e in svg.elements():
                i = getattr(e, 'id', None)
                if i:
                    ids.setdefault(i, e)
            self._svg[view] = (svg, ids, scale)
        return self._svg[view]

    def size(self, view):
        svg, _, k = self._elements(view)
        return float(svg.width) * k, float(svg.height) * k

    def point(self, view, cid):
        """Ponto onde o fio se liga: fim da perna, terminal ou centro do pino."""
        x, y = self._point(view, cid)
        k = self._elements(view)[2]
        return x * k, y * k

    def leg_start(self, cid):
        """Início da perna (lado do corpo), em coordenadas do item."""
        _, ids, k = self._elements('breadboard')
        v = self.connectors[cid]['views']['breadboard']
        leg = ids[v['legId']]
        pts = [(leg.x1, leg.y1), (leg.x2, leg.y2)]
        pin = ids.get(v['svgId'])
        bx = pin.bbox(); pc = ((bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2)
        pts.sort(key=lambda p: (p[0] - pc[0]) ** 2 + (p[1] - pc[1]) ** 2)
        return pts[0][0] * k, pts[0][1] * k

    def has_leg(self, cid):
        return bool(self.connectors[cid]['views'].get('breadboard', {}).get('legId'))

    def _point(self, view, cid):
        _, ids, _ = self._elements(view)
        v = self.connectors[cid]['views'][view]
        if v.get('legId') and view == 'breadboard':
            leg = ids[v['legId']]
            if isinstance(leg, (SimpleLine, Line)):
                pts = [(leg.x1, leg.y1), (leg.x2, leg.y2)] if isinstance(leg, SimpleLine) else [(leg.start.x, leg.start.y), (leg.end.x, leg.end.y)]
            else:
                segs = list(SPath(leg).segments())
                pts = [(segs[0].start.x, segs[0].start.y), (segs[-1].end.x, segs[-1].end.y)]
            # A perna sai do corpo: a ponta é a extremidade mais longe do pino
            pin = ids.get(v['svgId'])
            if pin is not None:
                bx = pin.bbox(); pc = ((bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2)
                pts.sort(key=lambda p: (p[0] - pc[0]) ** 2 + (p[1] - pc[1]) ** 2)
                return pts[-1]
            return pts[1]
        key = v.get('terminalId') if v.get('terminalId') in ids else v['svgId']
        b = ids[key].bbox()
        return ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)


def rot_transform(deg, w, h):
    """Matriz Qt (m11..m32) para girar em torno do centro do item."""
    import math
    a = math.radians(deg)
    c, s = round(math.cos(a), 9), round(math.sin(a), 9)
    cx, cy = w / 2, h / 2
    # p' = R(p - c) + c ; Qt: x' = m11 x + m21 y + m31, y' = m12 x + m22 y + m32
    m11, m12, m21, m22 = c, s, -s, c
    m31 = cx - (m11 * cx + m21 * cy)
    m32 = cy - (m12 * cx + m22 * cy)
    return (m11, m12, m21, m22, m31, m32)


def apply(t, x, y):
    m11, m12, m21, m22, m31, m32 = t
    return (m11 * x + m21 * y + m31, m12 * x + m22 * y + m32)


class Sketch:
    def __init__(self, title):
        self.title = title
        self.instances = []  # dicts
        self.wires = []
        self._index = 1000
        self.custom_parts = []  # (fzp_path, {view: svg_path})
        self._boards = set()  # índices das protoboards
        self.notes = []

    def _next(self):
        self._index += 7
        return self._index

    def add(self, part, title, bb=(0, 0), sch=(0, 0), pcb=(0, 0), bb_rot=0, sch_rot=0, props=None, views=None):
        inst = {'part': part, 'title': title, 'index': self._next(), 'props': props or {},
                'pos': {'breadboard': bb, 'schematic': sch, 'pcb': pcb},
                'rot': {'breadboard': bb_rot, 'schematic': sch_rot, 'pcb': 0},
                'connects': {}, 'legs': {}, 'labels': {}, 'views': views}
        if part.module_id.endswith('BreadboardModuleID'):
            self._boards.add(inst['index'])
        self.instances.append(inst)
        return inst

    def place(self, inst, view, pin, target):
        """Move a instância para o pino `pin` cair em `target` (na vista)."""
        inst['pos'][view] = (0, 0)
        _, (x, y) = self.pin(inst, view, pin)
        inst['pos'][view] = (target[0] - x, target[1] - y)

    def bend(self, inst, pin, target):
        """Dobra a perna do pino (protoboard) até `target` (cena)."""
        part = inst['part']
        cid = pin if pin in part.connectors else part.by_name(pin)
        sx, sy = part.leg_start(cid)
        px, py = inst['pos']['breadboard']
        tx, ty = target[0] - px, target[1] - py
        rot = inst['rot']['breadboard']
        if rot:  # alvo em coordenadas locais (inversa da rotação)
            tx, ty = apply(rot_transform(-rot, *part.size('breadboard')), tx, ty)
        inst['legs'][cid] = ((sx, sy), (tx - sx, ty - sy))

    def plug(self, inst, pin, board, hole):
        """Liga o pino da peça ao furo da protoboard (sem fio)."""
        part = inst['part']
        cid = pin if pin in part.connectors else part.by_name(pin)
        bcid = board['part'].by_name(hole)
        inst['connects'].setdefault(('breadboard', cid), []).append((board['index'], bcid, 'breadboardbreadboard'))
        board['connects'].setdefault(('breadboard', bcid), []).append((inst['index'], cid, 'breadboard'))

    def hole(self, board, name):
        return self.pin(board, 'breadboard', name)[1]

    def label(self, inst, view, x, y, keys=('',)):
        inst['labels'][view] = (x, y, keys)

    def pin(self, inst, view, name_or_id):
        part = inst['part']
        cid = name_or_id if name_or_id in part.connectors else part.by_name(name_or_id)
        if view == 'breadboard' and cid in inst['legs']:
            (sx, sy), (dx, dy) = inst['legs'][cid]
            px, py = inst['pos'][view]
            x, y = sx + dx, sy + dy
            if inst['rot'][view]:
                x, y = apply(rot_transform(inst['rot'][view], *part.size(view)), x, y)
            return cid, (px + x, py + y)
        x, y = part.point(view, cid)
        if inst['rot'][view]:
            w, h = part.size(view)
            x, y = apply(rot_transform(inst['rot'][view], w, h), x, y)
        px, py = inst['pos'][view]
        return cid, (px + x, py + y)

    def wire(self, view, a, b, via=(), color=None):
        """Fio de a até b, passando pelos pontos `via` (cada trecho é um fio).

        a e b: (instância, nome_do_pino) ou um ponto (x, y) já existente de
        outro fio (ver `tap`)."""
        ends = []
        for end in (a, b):
            if isinstance(end, tuple) and len(end) == 2 and isinstance(end[0], dict) and 'part' in end[0]:
                cid, pt = self.pin(end[0], view, end[1])
                ends.append(('part', end[0], cid, pt))
            else:  # junção em fio existente: (wire_dict, 'connector0'|'connector1')
                w, wc = end
                ends.append(('wire', w, wc, w['p0'] if wc == 'connector0' else w['p1']))
        pts = [ends[0][3]] + [self._resolve_via(v, ends) for v in via] + [ends[1][3]]
        segs = []
        for i in range(len(pts) - 1):
            w = {'index': self._next(), 'view': view, 'p0': pts[i], 'p1': pts[i + 1],
                 'color': color, 'c0': [], 'c1': []}
            segs.append(w)
            self.wires.append(w)
        for i in range(len(segs) - 1):
            segs[i]['c1'].append(('wire', segs[i + 1]['index'], 'connector0'))
            segs[i + 1]['c0'].append(('wire', segs[i]['index'], 'connector1'))
        for (kind, obj, cid, _), w, wc in ((ends[0], segs[0], 'c0'), (ends[1], segs[-1], 'c1')):
            wcid = 'connector0' if wc == 'c0' else 'connector1'
            if kind == 'part':
                w[wc].append(('part', obj['index'], cid))
                obj['connects'].setdefault((view, cid), []).append((w['index'], wcid, None))
            else:
                w[wc].append(('wire', obj['index'], cid))
                obj['c0' if cid == 'connector0' else 'c1'].append(('wire', w['index'], wcid))
        return segs

    @staticmethod
    def _resolve_via(v, ends):
        # via pode usar None para "mesmo x/y do início/fim": ('x0', y) etc.
        x, y = v
        if x == 'a': x = ends[0][3][0]
        if x == 'b': x = ends[1][3][0]
        if y == 'a': y = ends[0][3][1]
        if y == 'b': y = ends[1][3][1]
        return (x, y)

    # ------------------------------------------------------------ XML
    def to_xml(self):
        out = io.StringIO()
        w = out.write
        w('<?xml version="1.0" encoding="UTF-8"?>\n')
        w('<module fritzingVersion="1.0.8" icon=".png">\n')
        w('  <views>\n')
        w('    <view name="breadboardView" backgroundColor="#ffffff" gridSize="0.1in" showGrid="1" alignToGrid="1" viewFromBelow="0"/>\n')
        w('    <view name="schematicView" backgroundColor="#ffffff" gridSize="0.1in" showGrid="1" alignToGrid="1" viewFromBelow="0"/>\n')
        w('    <view name="pcbView" backgroundColor="#333333" gridSize="0.05in" showGrid="1" alignToGrid="1" viewFromBelow="0"/>\n')
        w('  </views>\n  <instances>\n')
        z = 2.5
        for inst in self.instances:
            p = inst['part']
            w(f'    <instance moduleIdRef="{esc(p.module_id)}" modelIndex="{inst["index"]}" path="{esc(getattr(p, "xml_path", None) or p.fzp_path.name)}">\n')
            for k, val in inst['props'].items():
                w(f'      <property name="{esc(k)}" value="{esc(val)}"/>\n')
            w(f'      <title>{esc(inst["title"])}</title>\n      <views>\n')
            for view, layer, wlayer in (('breadboard', 'breadboard', 'breadboardWire'),
                                         ('schematic', 'schematic', 'schematicTrace'),
                                         ('pcb', 'copper0', 'copper0trace')):
                if view not in p.images or (inst['views'] and view not in inst['views']):
                    continue
                x, y = inst['pos'][view]
                z += 0.0001
                w(f'        <{VIEWS[view]} layer="{layer}">\n')
                rot = inst['rot'][view]
                if rot:
                    t = rot_transform(rot, *p.size(view))
                    w(f'          <geometry z="{z:.5f}" x="{x:.4f}" y="{y:.4f}">\n')
                    w('            <transform m11="%.6f" m12="%.6f" m13="0" m21="%.6f" m22="%.6f" m23="0" m31="%.4f" m32="%.4f" m33="1"/>\n' % t)
                    w('          </geometry>\n')
                else:
                    w(f'          <geometry z="{z:.5f}" x="{x:.4f}" y="{y:.4f}"/>\n')
                if view in inst['labels']:
                    lx, ly, keys = inst['labels'][view]
                    w(f'          <titleGeometry visible="true" x="{lx:.4f}" y="{ly:.4f}" z="{z + 5:.5f}" xOffset="0" yOffset="0" textColor="#000000" fontSize="5">\n')
                    for k in keys:
                        w(f'            <displayKey key="{esc(k)}"/>\n')
                    w('          </titleGeometry>\n')
                conns = {cid: lst for (v, cid), lst in inst['connects'].items() if v == view}
                if view == 'breadboard':
                    for cid in inst['legs']:
                        conns.setdefault(cid, [])
                own_layer = 'breadboardbreadboard' if p.module_id.endswith('BreadboardModuleID') and view == 'breadboard' else layer
                if conns:
                    w('          <connectors>\n')
                    for cid, lst in conns.items():
                        w(f'            <connector connectorId="{cid}" layer="{own_layer}">\n')
                        if view == 'breadboard' and cid in inst['legs']:
                            (sx, sy), (dx, dy) = inst['legs'][cid]
                            w(f'              <geometry x="{sx:.4f}" y="{sy:.4f}"/>\n')
                            w(f'              <leg><point x="0" y="0"/><bezier/><point x="{dx:.4f}" y="{dy:.4f}"/><bezier/></leg>\n')
                        w('              <connects>\n')
                        for widx, wcid, lay in lst:
                            w(f'                <connect connectorId="{wcid}" modelIndex="{widx}" layer="{lay or wlayer}"/>\n')
                        w('              </connects>\n            </connector>\n')
                    w('          </connectors>\n')
                w(f'        </{VIEWS[view]}>\n')
            w('      </views>\n    </instance>\n')
        for wire in self.wires:
            view = wire['view']
            if view == 'breadboard':
                vtag, layer, flags, mils, color = 'breadboardView', 'breadboardWire', 64, 22.2222, wire['color'] or '#418dd9'
                player = 'breadboard'
            else:
                vtag, layer, flags, mils, color = 'schematicView', 'schematicTrace', 128, 9.7222, wire['color'] or '#404040'
                player = 'schematic'
            (x0, y0), (x1, y1) = wire['p0'], wire['p1']
            z += 0.0001
            w(f'    <instance moduleIdRef="WireModuleID" modelIndex="{wire["index"]}" path=":/resources/parts/core/wire.fzp">\n')
            w(f'      <title>Wire{wire["index"]}</title>\n      <views>\n')
            w(f'        <{vtag} layer="{layer}">\n')
            w(f'          <geometry z="{z + 1:.5f}" x="{x0:.4f}" y="{y0:.4f}" x1="0" y1="0" x2="{x1 - x0:.4f}" y2="{y1 - y0:.4f}" wireFlags="{flags}"/>\n')
            w(f'          <wireExtras mils="{mils}" color="{color}" opacity="1" banded="0"/>\n')
            w('          <connectors>\n')
            for wc, key in (('connector0', 'c0'), ('connector1', 'c1')):
                if not wire[key]:
                    continue
                w(f'            <connector connectorId="{wc}" layer="{layer}">\n              <geometry x="0" y="0"/>\n              <connects>\n')
                for kind, idx, cid in wire[key]:
                    lay = layer if kind == 'wire' else ('breadboardbreadboard' if idx in self._boards else player)
                    w(f'                <connect connectorId="{cid}" modelIndex="{idx}" layer="{lay}"/>\n')
                w('              </connects>\n            </connector>\n')
            w('          </connectors>\n')
            w(f'        </{vtag}>\n      </views>\n    </instance>\n')
        for note in self.notes:
            view, x, y, wdt, hgt, html = note
            idx = self._next()
            w(f'    <instance moduleIdRef="NoteModuleID" modelIndex="{idx}" path=":/resources/parts/core/note.fzp">\n')
            w(f'      <title>Note{idx}</title>\n      <text>{esc(html)}</text>\n      <views>\n')
            w(f'        <{VIEWS[view]} layer="{"breadboardbreadboard" if view == "breadboard" else "schematicText"}">\n')
            w(f'          <geometry z="{z + 2:.5f}" x="{x:.4f}" y="{y:.4f}" width="{wdt:.4f}" height="{hgt:.4f}"/>\n')
            w(f'        </{VIEWS[view]}>\n      </views>\n    </instance>\n')
        w('  </instances>\n')
        w(f'  <title>{esc(self.title)}</title>\n')
        w('</module>\n')
        return out.getvalue()

    def note(self, view, x, y, w, h, html):
        self.notes.append((view, x, y, w, h, html))

    def save_fzz(self, path, extra_files=()):
        """extra_files: (nome_no_zip, bytes) das peças próprias embutidas."""
        path = Path(path)
        with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
            z.writestr(path.stem + '.fz', self.to_xml())
            for name, data in extra_files:
                z.writestr(name, data)


def esc(s):
    return (str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;'))


class Symbol:
    """Símbolos embutidos do Fritzing (terra e rótulo de tensão), só no esquemático.

    Geometria medida exportando os símbolos: ambos têm 0,2" (18 px); o terra
    liga no alto, o rótulo de tensão embaixo."""

    def __init__(self, kind):
        self.kind = kind
        self.module_id = 'GroundModuleID' if kind == 'gnd' else 'PowerLabelModuleID'
        self.xml_path = ':/resources/parts/core/' + ('ground.fzp' if kind == 'gnd' else 'power_label.fzp')
        self.fzp_path = Path(self.xml_path)
        self.title = kind
        self.images = {'schematic': None}
        self.connectors = {'connector0': {'name': 'GND' if kind == 'gnd' else 'V+', 'views': {'schematic': {}}}}

    def by_name(self, name):
        return 'connector0'

    def point(self, view, cid):
        return (9.0, 0.6) if self.kind == 'gnd' else (9.0, 17.47)

    def size(self, view):
        return (18.0, 18.0)

    def has_leg(self, cid):
        return False
