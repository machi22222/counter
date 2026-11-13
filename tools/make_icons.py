#!/usr/bin/env python3
"""Erzeugt die App-Icons (SVG + PNG) ohne externe Bibliotheken.

Aufruf im Projektordner:  python3 tools/make_icons.py
Das Icon wird einmal als einfache Geometrie beschrieben (Verlauf + weißes Plus)
und daraus sowohl als SVG geschrieben als auch als PNG gerastert.
Diese Datei gehört nicht zur App und muss nicht hochgeladen werden.
"""
import pathlib
import struct
import zlib

OUT = pathlib.Path(__file__).resolve().parent.parent / "icons"

# Geometrie in Einheiten eines 100×100-Quadrats
TOP_LEFT = (0x7A, 0x78, 0xF2)      # Verlauf oben links (helles Indigo)
BOTTOM_RIGHT = (0x48, 0x3E, 0xC9)  # Verlauf unten rechts (dunkles Indigo)
BARS = [(26, 44, 48, 12), (44, 26, 12, 48)]  # Plus: zwei Balken (x, y, Breite, Höhe)
BAR_RADIUS = 6                               # runde Enden
FAVICON_RADIUS = 22                          # nur SVG: abgerundete Ecken


def hex_rgb(c):
    return "#%02x%02x%02x" % c


def write_svg():
    bars = "".join(
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{BAR_RADIUS}" fill="#fff"/>'
        for x, y, w, h in BARS
    )
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
        '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
        f'<stop offset="0" stop-color="{hex_rgb(TOP_LEFT)}"/>'
        f'<stop offset="1" stop-color="{hex_rgb(BOTTOM_RIGHT)}"/>'
        "</linearGradient></defs>"
        f'<rect width="100" height="100" rx="{FAVICON_RADIUS}" fill="url(#g)"/>'
        f"{bars}</svg>\n"
    )
    (OUT / "icon.svg").write_text(svg, encoding="utf-8")


def bar_distance(px, py, bar):
    """Vorzeichenbehafteter Abstand eines Punkts zum abgerundeten Balken (negativ = innen)."""
    x, y, w, h = bar
    r = BAR_RADIUS
    qx = abs(px - (x + w / 2)) - (w / 2 - r)
    qy = abs(py - (y + h / 2)) - (h / 2 - r)
    outside = (max(qx, 0) ** 2 + max(qy, 0) ** 2) ** 0.5
    return outside + min(max(qx, qy), 0) - r


def write_png(size):
    """Rastert das Icon als quadratisches, randloses PNG (iOS rundet die Ecken selbst ab)."""
    scale = size / 100
    rows = bytearray()
    for j in range(size):
        rows.append(0)  # PNG-Zeilenfilter „keiner“
        for i in range(size):
            u, v = (i + 0.5) / scale, (j + 0.5) / scale
            t = (u + v) / 200  # Position im diagonalen Verlauf (0..1)
            bg = [a + (b - a) * t for a, b in zip(TOP_LEFT, BOTTOM_RIGHT)]
            # Kantenglättung: Abstand in Pixeln → Deckkraft 0..1
            d = min(bar_distance(u, v, bar) for bar in BARS) * scale
            cover = min(max(0.5 - d, 0.0), 1.0)
            rows.extend(round(c + (255 - c) * cover) for c in bg)

    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes(rows), 9))
        + chunk(b"IEND", b"")
    )
    (OUT / f"icon-{size}.png").write_bytes(png)


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    write_svg()
    for s in (180, 192, 512):
        write_png(s)
    print("Icons geschrieben nach", OUT)
