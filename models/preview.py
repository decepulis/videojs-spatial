#!/usr/bin/env python3
"""Render the assembled controls to models/preview.png, without a headset.

A rough software render: it reads the generated USDZ files back, places them
with the same arithmetic as public/styles/spatial.css, and draws them flat
shaded. It checks geometry, winding and layout; it says nothing about how
Safari lights or fits the scene.

    pip install usd-core pillow numpy
    python3 models/preview.py
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from pxr import Usd, UsdGeom, UsdShade

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build import CM, LAYOUT, OUT_MODELS  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SCALE = 2600  # pixels per metre
SIZE = (1800, 620)
LIGHT = (-0.35, 0.55, 0.76)


def load(name: str):
    """Return [(face points, colour)] for one model, in metres."""
    stage = Usd.Stage.Open(str(OUT_MODELS / f"{name}.usdz"))
    faces = []
    for prim in stage.Traverse():
        if not prim.IsA(UsdGeom.Mesh):
            continue
        mesh = UsdGeom.Mesh(prim)
        points = mesh.GetPointsAttr().Get()
        counts = mesh.GetFaceVertexCountsAttr().Get()
        indices = mesh.GetFaceVertexIndicesAttr().Get()
        material = UsdShade.MaterialBindingAPI(prim).ComputeBoundMaterial()[0]
        shader = UsdShade.Shader(material.GetPrim().GetChild("surface"))
        colour = tuple(shader.GetInput("diffuseColor").Get())
        emissive = shader.GetInput("emissiveColor")
        glow = tuple(emissive.Get()) if emissive else (0, 0, 0)
        cursor = 0
        for count in counts:
            faces.append(([tuple(points[i]) for i in indices[cursor : cursor + count]], colour, glow))
            cursor += count
    return faces


def place(faces, translate=(0, 0, 0), scale=(1, 1, 1)):
    """CSS `translate3d(...) scale3d(...)`: scale about the model origin, then move. Centimetres."""
    tx, ty, tz = (c * CM for c in translate)
    return [
        ([(x * scale[0] + tx, y * scale[1] + ty, z * scale[2] + tz) for x, y, z in points], colour, glow)
        for points, colour, glow in faces
    ]


def assemble(paused=True, progress=0.42, buffered=0.7, press=0.0):
    L = LAYOUT
    scene = place(load("tray"))

    squash = 1 - press * 0.45
    scene += place(load("puck"), (L["puck-x"], 0, 0), (1, 1, squash))
    for name, active in (("play", paused), ("pause", not paused)):
        sink, size = (0, 1) if active else (1.05, 0.6)
        z = L["puck-height"] * squash - sink * L["glyph-height"]
        scene += place(load(name), (L["puck-x"], 0, z), (size, size, size))

    pitch = L["track-length"] / L["track-count"]
    tile = load("tile")
    for i in range(int(L["track-count"])):
        scene += place(tile, (L["track-start"] + (i + 0.5) * pitch, 0, 0))

    scene += place(load("buffer"), (L["track-start"], 0, 0), (max(0.0001, buffered), 1, 1))
    scene += place(load("fill"), (L["track-start"], 0, 0), (max(0.0001, progress), 1, 1))
    scene += place(load("thumb"), (L["track-start"] + progress * L["track-length"], 0, L["tile-depth"]))
    return scene


def render(scene, yaw=0.0, pitch=0.0, zoom=1.0):
    """Flat-shaded orthographic render with a depth buffer."""
    width, height = SIZE
    colour_buffer = np.empty((height, width, 3), dtype=np.uint8)
    colour_buffer[:] = (8, 9, 12)
    depth_buffer = np.full((height, width), -np.inf)
    cy, sy, cp, sp = math.cos(yaw), math.sin(yaw), math.cos(pitch), math.sin(pitch)
    scale = SCALE * zoom

    def view(p):
        x, y, z = p
        x, z = x * cy + z * sy, -x * sy + z * cy
        y, z = y * cp - z * sp, y * sp + z * cp
        return (x, y, z)

    for points, colour, glow in scene:
        eye = [view(p) for p in points]
        # Newell normal in view space; faces wind counter-clockwise seen from outside.
        nx = ny = nz = 0.0
        for i, (x0, y0, z0) in enumerate(eye):
            x1, y1, z1 = eye[(i + 1) % len(eye)]
            nx += (y0 - y1) * (z0 + z1)
            ny += (z0 - z1) * (x0 + x1)
            nz += (x0 - x1) * (y0 + y1)
        length = math.sqrt(nx * nx + ny * ny + nz * nz)
        if length == 0 or nz <= 0:
            continue  # degenerate, or wound to face away from the viewer
        shade = 0.25 + 0.75 * max(0.0, (nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / length)
        rgb = [int(255 * min(1.0, (c * shade + g * 0.6) ** (1 / 2.2))) for c, g in zip(colour, glow)]
        v = [(width / 2 + x * scale, height / 2 - y * scale, z) for x, y, z in eye]

        for i in range(1, len(v) - 1):  # faces are convex: fan triangulation
            (ax, ay, az), (bx, by, bz), (cx, cy_, cz) = v[0], v[i], v[i + 1]
            x_min, x_max = max(int(min(ax, bx, cx)), 0), min(int(max(ax, bx, cx)) + 1, width)
            y_min, y_max = max(int(min(ay, by, cy_)), 0), min(int(max(ay, by, cy_)) + 1, height)
            area = (bx - ax) * (cy_ - ay) - (cx - ax) * (by - ay)
            if x_min >= x_max or y_min >= y_max or area == 0:
                continue
            ys, xs = np.mgrid[y_min:y_max, x_min:x_max] + 0.5
            w1 = ((xs - ax) * (cy_ - ay) - (cx - ax) * (ys - ay)) / area
            w2 = ((bx - ax) * (ys - ay) - (xs - ax) * (by - ay)) / area
            w0 = 1 - w1 - w2
            z = w0 * az + w1 * bz + w2 * cz
            region = depth_buffer[y_min:y_max, x_min:x_max]
            visible = (w0 >= 0) & (w1 >= 0) & (w2 >= 0) & (z > region)
            region[visible] = z[visible]
            colour_buffer[y_min:y_max, x_min:x_max][visible] = rgb

    return Image.fromarray(colour_buffer)


def main() -> int:
    views = [
        render(assemble(paused=True), yaw=0.0, pitch=0.0),
        render(assemble(paused=False, progress=0.75, buffered=0.9), yaw=math.radians(-24), pitch=math.radians(22), zoom=0.9),
        render(assemble(paused=True, progress=0.1, buffered=0.3, press=1.0), yaw=math.radians(28), pitch=math.radians(30), zoom=0.9),
    ]
    sheet = Image.new("RGB", (SIZE[0], SIZE[1] * len(views)), (0, 0, 0))
    for row, image in enumerate(views):
        sheet.paste(image, (0, row * SIZE[1]))
    target = ROOT / "models" / "preview.png"
    sheet.save(target)
    print(target.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    sys.exit(main())
