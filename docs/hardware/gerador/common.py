"""Peças usadas nos sketches e empacotamento das peças próprias no .fzz."""
from pathlib import Path

from fzlib import Part

SCRATCH = Path('/tmp/claude-1000/-home-vitor--rea-de-trabalho-AquiIoT/01d04f04-2db8-46ca-839e-5c5ed4f21644/scratchpad')
CORE = SCRATCH / 'fz/squashfs-root/fritzing-parts'
OWN = SCRATCH / 'gen/out/parts'
G = 9.0  # 0,1" em pixels da cena


def core(fzp):
    return Part(CORE / 'core' / fzp, CORE / 'svg', 'core')


def own(key):
    return Part(OWN / 'user' / f'aquiiot_{key}.fzp', OWN / 'svg', 'user')


def bundle(parts):
    """Arquivos das peças próprias como o Fritzing os guarda no .fzz."""
    files = []
    for p in parts:
        files.append((f'part.{p.fzp_path.name}', p.fzp_path.read_bytes()))
        for view, img in p.images.items():
            folder, name = img.split('/', 1)
            files.append((f'svg.{folder}.{name}', (p.svg_root / 'user' / img).read_bytes()))
        icon = p.fzp_path.read_text(encoding='utf-8').split('<iconView><layers image="', 1)[1].split('"', 1)[0]
        folder, name = icon.split('/', 1)
        files.append((f'svg.{folder}.{name}', (p.svg_root / 'user' / icon).read_bytes()))
    return files
