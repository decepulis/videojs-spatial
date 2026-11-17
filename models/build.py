#!/usr/bin/env python3
"""Generate the USDZ models, the HDR environment map and the shared layout CSS.

    pip install usd-core
    python3 models/build.py

Everything is authored in metres with +Y up and +Z towards the viewer, so a
model's front faces the user when it sits in a portal. Each model's origin is
chosen so that CSS transforms are easy to reason about:

  - parts that sit on the tray have their origin on their back face (z = 0)
  - bars that grow with `scaleX()` have their origin on their left end

The numbers in LAYOUT are the single source of truth: they size the meshes and
are written to public/styles/layout.css as custom properties for the stylesheet.
"""

from __future__ import annotations

import math
import struct
import sys
import tempfile
from pathlib import Path

from pxr import Gf, Sdf, Usd, UsdGeom, UsdShade, UsdUtils, Vt

ROOT = Path(__file__).resolve().parent.parent
OUT_MODELS = ROOT / "public" / "models"
OUT_ENV = ROOT / "public" / "env"
OUT_CSS = ROOT / "public" / "styles" / "layout.css"

CM = 0.01

# All values in centimetres.
LAYOUT = {
    # Tray: a shallow open box the controls sit in. Its bounding box is the
    # automatic portal stage, so it must enclose everything else.
    "tray-inner-width": 60.0,
    "tray-inner-height": 9.0,
    "tray-rim": 1.0,
    "tray-depth": 3.2,  # rim height above the back plate
    "tray-plate": 0.5,  # back plate thickness
    # Play button
    "puck-x": -25.5,
    "puck-radius": 3.2,
    "puck-height": 1.2,
    "glyph-height": 0.6,
    # Timeline
    "track-start": -19.0,
    "track-length": 46.0,
    "track-count": 23,  # number of tiles (hit targets)
    "tile-gap": 0.25,
    "tile-height": 4.6,
    "tile-depth": 0.3,
    "bar-height": 1.0,
    "buffer-depth": 0.2,
    "fill-depth": 0.35,
    "thumb-radius": 1.15,
    "thumb-height": 1.5,
}

MATERIALS = {
    #            diffuse             metallic rough  emissive
    "tray":    ((0.035, 0.038, 0.045), 0.85, 0.42, None),
    "puck":    ((0.86, 0.87, 0.89),    0.10, 0.28, None),
    "glyph":   ((0.06, 0.06, 0.07),    0.00, 0.35, None),
    "tile":    ((0.30, 0.32, 0.36),    0.60, 0.30, None),
    "groove":  ((0.02, 0.02, 0.025),   0.20, 0.60, None),
    "buffer":  ((0.62, 0.64, 0.68),    0.30, 0.35, None),
    "fill":    ((1.00, 0.36, 0.08),    0.00, 0.40, (1.0, 0.30, 0.05)),
    "thumb":   ((0.95, 0.95, 0.96),    0.90, 0.12, None),
}


# ── Geometry ────────────────────────────────────────────────────────────────


class Mesh:
    """Polygon soup with per-face-vertex normals (flat unless told otherwise)."""

    def __init__(self) -> None:
        self.points: list[tuple[float, float, float]] = []
        self.counts: list[int] = []
        self.indices: list[int] = []
        self.normals: list[tuple[float, float, float]] = []

    def face(self, verts, normals=None) -> None:
        """Add one convex face. `verts` wind counter-clockwise seen from outside."""
        if normals is None:
            n = _face_normal(verts)
            normals = [n] * len(verts)
        base = len(self.points)
        self.points.extend(verts)
        self.counts.append(len(verts))
        self.indices.extend(range(base, base + len(verts)))
        self.normals.extend(normals)


def _face_normal(verts):
    # Newell's method: robust for n-gons.
    nx = ny = nz = 0.0
    for i, (x0, y0, z0) in enumerate(verts):
        x1, y1, z1 = verts[(i + 1) % len(verts)]
        nx += (y0 - y1) * (z0 + z1)
        ny += (z0 - z1) * (x0 + x1)
        nz += (x0 - x1) * (y0 + y1)
    length = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
    return (nx / length, ny / length, nz / length)


def extrude(mesh: Mesh, outline, z0: float, z1: float, smooth: bool = False) -> None:
    """Extrude a convex outline (counter-clockwise in XY, seen from +Z) along Z."""
    n = len(outline)
    mesh.face([(x, y, z1) for x, y in outline])  # front
    mesh.face([(x, y, z0) for x, y in reversed(outline)])  # back

    def vertex_normal(i):
        (xa, ya), (xb, yb), (xc, yc) = outline[i - 1], outline[i], outline[(i + 1) % n]
        # Average of the two adjacent edge normals.
        ex, ey = (yb - ya) + (yc - yb), -(xb - xa) - (xc - xb)
        length = math.hypot(ex, ey) or 1.0
        return (ex / length, ey / length, 0.0)

    for i in range(n):
        j = (i + 1) % n
        (xa, ya), (xb, yb) = outline[i], outline[j]
        quad = [(xa, ya, z0), (xb, yb, z0), (xb, yb, z1), (xa, ya, z1)]
        if smooth:
            na, nb = vertex_normal(i), vertex_normal(j)
            mesh.face(quad, [na, nb, nb, na])
        else:
            mesh.face(quad)


def rect(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def rounded_rect(x0, y0, x1, y1, r, steps=6):
    r = min(r, (x1 - x0) / 2, (y1 - y0) / 2)
    corners = [  # centre, start angle
        ((x1 - r, y0 + r), -90),
        ((x1 - r, y1 - r), 0),
        ((x0 + r, y1 - r), 90),
        ((x0 + r, y0 + r), 180),
    ]
    points = []
    for (cx, cy), start in corners:
        for s in range(steps + 1):
            a = math.radians(start + 90 * s / steps)
            points.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return points


def circle(r, steps=48):
    return [(r * math.cos(2 * math.pi * s / steps), r * math.sin(2 * math.pi * s / steps)) for s in range(steps)]


def scaled(outline, k=CM):
    return [(x * k, y * k) for x, y in outline]


# ── USD authoring ───────────────────────────────────────────────────────────


class Model:
    def __init__(self, name: str) -> None:
        self.name = name
        self.parts: list[tuple[str, Mesh, str]] = []
        self.anchors: list[tuple[str, tuple[float, float, float]]] = []

    def part(self, name: str, material: str) -> Mesh:
        mesh = Mesh()
        self.parts.append((name, mesh, material))
        return mesh

    def anchor(self, name: str, position_cm) -> None:
        """An empty transform, addressable as `--anchor-name#<name>` from CSS."""
        self.anchors.append((name, tuple(c * CM for c in position_cm)))

    def write(self, directory: Path) -> Path:
        directory.mkdir(parents=True, exist_ok=True)
        target = directory / f"{self.name}.usdz"

        with tempfile.TemporaryDirectory() as tmp:
            layer_path = Path(tmp) / f"{self.name}.usdc"
            stage = Usd.Stage.CreateNew(str(layer_path))
            UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y)
            UsdGeom.SetStageMetersPerUnit(stage, 1.0)

            root = UsdGeom.Xform.Define(stage, "/Root")
            stage.SetDefaultPrim(root.GetPrim())

            materials: dict[str, UsdShade.Material] = {}
            for part_name, mesh, material_name in self.parts:
                prim = UsdGeom.Mesh.Define(stage, f"/Root/{part_name}")
                prim.CreatePointsAttr(Vt.Vec3fArray([Gf.Vec3f(*p) for p in mesh.points]))
                prim.CreateFaceVertexCountsAttr(Vt.IntArray(mesh.counts))
                prim.CreateFaceVertexIndicesAttr(Vt.IntArray(mesh.indices))
                prim.CreateSubdivisionSchemeAttr(UsdGeom.Tokens.none)
                prim.CreateDoubleSidedAttr(False)
                prim.CreateNormalsAttr(Vt.Vec3fArray([Gf.Vec3f(*n) for n in mesh.normals]))
                prim.SetNormalsInterpolation(UsdGeom.Tokens.faceVarying)
                prim.CreateExtentAttr(UsdGeom.PointBased.ComputeExtent(prim.GetPointsAttr().Get()))

                if material_name not in materials:
                    materials[material_name] = _material(stage, material_name)
                UsdShade.MaterialBindingAPI.Apply(prim.GetPrim()).Bind(materials[material_name])

            for anchor_name, position in self.anchors:
                xform = UsdGeom.Xform.Define(stage, f"/Root/{anchor_name}")
                xform.AddTranslateOp().Set(Gf.Vec3d(*position))

            stage.GetRootLayer().Save()
            if not UsdUtils.CreateNewUsdzPackage(Sdf.AssetPath(str(layer_path)), str(target)):
                raise RuntimeError(f"could not package {target}")

        return target


def _material(stage, name: str) -> UsdShade.Material:
    diffuse, metallic, roughness, emissive = MATERIALS[name]
    material = UsdShade.Material.Define(stage, f"/Root/Materials/{name}")
    shader = UsdShade.Shader.Define(stage, f"/Root/Materials/{name}/surface")
    shader.CreateIdAttr("UsdPreviewSurface")
    shader.CreateInput("diffuseColor", Sdf.ValueTypeNames.Color3f).Set(Gf.Vec3f(*diffuse))
    shader.CreateInput("metallic", Sdf.ValueTypeNames.Float).Set(metallic)
    shader.CreateInput("roughness", Sdf.ValueTypeNames.Float).Set(roughness)
    if emissive:
        shader.CreateInput("emissiveColor", Sdf.ValueTypeNames.Color3f).Set(Gf.Vec3f(*emissive))
    material.CreateSurfaceOutput().ConnectToSource(shader.ConnectableAPI(), "surface")
    return material


# ── The models ──────────────────────────────────────────────────────────────


def build_models() -> list[Model]:
    L = LAYOUT
    models: list[Model] = []

    # Tray: back plate behind z = 0, rim rising to z = tray-depth.
    half_w = L["tray-inner-width"] / 2
    half_h = L["tray-inner-height"] / 2
    rim, depth, plate = L["tray-rim"], L["tray-depth"], L["tray-plate"]
    tray = Model("tray")
    body = tray.part("body", "tray")
    outer = (-half_w - rim, -half_h - rim, half_w + rim, half_h + rim)
    extrude(body, scaled(rounded_rect(*outer, r=1.2)), -plate * CM, 0.0)
    for x0, y0, x1, y1 in (
        (outer[0], half_h, outer[2], outer[3]),  # top
        (outer[0], outer[1], outer[2], -half_h),  # bottom
        (outer[0], -half_h, -half_w, half_h),  # left
        (half_w, -half_h, outer[2], half_h),  # right
    ):
        extrude(body, scaled(rect(x0, y0, x1, y1)), 0.0, depth * CM)
    models.append(tray)

    # Puck: the play button's body. `glyph` marks where a glyph sits on its face.
    puck = Model("puck")
    extrude(puck.part("body", "puck"), scaled(circle(L["puck-radius"])), 0.0, L["puck-height"] * CM, smooth=True)
    puck.anchor("glyph", (0, 0, L["puck-height"]))
    models.append(puck)

    glyph_depth = L["glyph-height"] * CM

    # Play glyph: a triangle pointing right, nudged so it looks centred.
    play = Model("play")
    triangle = [(-1.15, -1.7), (1.75, 0.0), (-1.15, 1.7)]
    extrude(play.part("body", "glyph"), scaled(triangle), 0.0, glyph_depth)
    models.append(play)

    # Pause glyph: two bars.
    pause = Model("pause")
    bars = pause.part("body", "glyph")
    for x0 in (-1.35, 0.35):
        extrude(bars, scaled(rounded_rect(x0, -1.6, x0 + 1.0, 1.6, r=0.2, steps=3)), 0.0, glyph_depth)
    models.append(pause)

    # Tile: one hit target of the timeline, with a groove the bars run along.
    pitch = L["track-length"] / L["track-count"]
    tile_w = pitch - L["tile-gap"]
    tile = Model("tile")
    extrude(
        tile.part("body", "tile"),
        scaled(rounded_rect(-tile_w / 2, -L["tile-height"] / 2, tile_w / 2, L["tile-height"] / 2, r=0.3, steps=4)),
        0.0,
        L["tile-depth"] * CM,
    )
    extrude(
        tile.part("groove", "groove"),
        scaled(rect(-tile_w / 2, -L["bar-height"] / 2, tile_w / 2, L["bar-height"] / 2)),
        L["tile-depth"] * CM,
        (L["tile-depth"] + 0.02) * CM,
    )
    models.append(tile)

    # Buffer and fill bars: origin on the left end so scaleX() grows rightwards.
    z = L["tile-depth"] + 0.02
    half = L["bar-height"] / 2
    for name, bar_depth in (("buffer", L["buffer-depth"]), ("fill", L["fill-depth"])):
        bar = Model(name)
        extrude(bar.part("body", name), scaled(rect(0.0, -half, L["track-length"], half)), z * CM, (z + bar_depth) * CM)
        models.append(bar)

    # Thumb: a knob standing proud of the fill.
    thumb = Model("thumb")
    extrude(thumb.part("body", "thumb"), scaled(circle(L["thumb-radius"])), 0.0, L["thumb-height"] * CM, smooth=True)
    models.append(thumb)

    return models


# ── Environment map ─────────────────────────────────────────────────────────


def write_environment(path: Path, lights, ambient_top, ambient_bottom, width=256, height=128) -> None:
    """Write an equirectangular Radiance .hdr: a soft gradient plus a few area lights."""
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = bytearray()

    for row in range(height):
        v = (row + 0.5) / height  # 0 = straight up
        polar = v * math.pi
        for col in range(width):
            azimuth = ((col + 0.5) / width - 0.5) * 2 * math.pi  # 0 = image centre
            direction = (
                math.sin(polar) * math.sin(azimuth),
                math.cos(polar),
                -math.sin(polar) * math.cos(azimuth),
            )
            rgb = [ambient_top[i] * (1 - v) + ambient_bottom[i] * v for i in range(3)]
            for (lx, ly, lz), sharpness, colour in lights:
                norm = math.sqrt(lx * lx + ly * ly + lz * lz)
                cosine = (direction[0] * lx + direction[1] * ly + direction[2] * lz) / norm
                weight = math.exp(sharpness * (cosine - 1.0))
                for i in range(3):
                    rgb[i] += colour[i] * weight
            rows += _rgbe(*rgb)

    header = f"#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y {height} +X {width}\n".encode("ascii")
    path.write_bytes(header + bytes(rows))


def _rgbe(r: float, g: float, b: float) -> bytes:
    peak = max(r, g, b)
    if peak < 1e-32:
        return b"\x00\x00\x00\x00"
    mantissa, exponent = math.frexp(peak)
    scale = mantissa * 256.0 / peak
    return struct.pack("BBBB", int(r * scale), int(g * scale), int(b * scale), exponent + 128)


def build_environments() -> None:
    # Direction vectors: +x right, +y up, -z ahead of the viewer (behind the tray),
    # +z behind the viewer (which is what the front of the controls reflects).
    write_environment(
        OUT_ENV / "studio.hdr",
        lights=[
            ((0.0, 1.0, 0.6), 6.0, (9.0, 9.0, 9.5)),  # big soft box above and in front
            ((-1.0, 0.3, 0.8), 14.0, (6.0, 4.6, 3.2)),  # warm key from the left
            ((1.0, 0.1, 0.5), 20.0, (1.6, 2.6, 5.0)),  # cool rim from the right
        ],
        ambient_top=(0.35, 0.37, 0.42),
        ambient_bottom=(0.05, 0.05, 0.06),
    )
    write_environment(
        OUT_ENV / "neon.hdr",
        lights=[
            ((-1.0, 0.2, 0.6), 10.0, (10.0, 0.6, 5.0)),  # magenta from the left
            ((1.0, 0.2, 0.6), 10.0, (0.3, 5.0, 10.0)),  # cyan from the right
            ((0.0, -1.0, 0.3), 8.0, (1.2, 0.2, 2.4)),  # violet underlight
        ],
        ambient_top=(0.02, 0.02, 0.05),
        ambient_bottom=(0.03, 0.01, 0.05),
    )


# ── Layout CSS ──────────────────────────────────────────────────────────────


def build_css() -> None:
    lines = [
        "/* Generated by models/build.py. Do not edit by hand. */",
        ":root {",
    ]
    for key, value in LAYOUT.items():
        unit = "" if key.endswith("-count") else "cm"
        lines.append(f"  --{key}: {value:g}{unit};")
    lines.append("}")
    OUT_CSS.parent.mkdir(parents=True, exist_ok=True)
    OUT_CSS.write_text("\n".join(lines) + "\n")


def main() -> int:
    for model in build_models():
        path = model.write(OUT_MODELS)
        print(f"{path.relative_to(ROOT)}  {path.stat().st_size} bytes")
    build_environments()
    build_css()
    print(f"{OUT_CSS.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
