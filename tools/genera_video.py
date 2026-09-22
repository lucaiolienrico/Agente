#!/usr/bin/env python3
"""Agente Video — generatore da riga di comando (senza browser).

Crea un vero video MP4 da 30s con la stessa regia dell'app web:
storyboard, arte procedurale cinematografica, Ken Burns, dissolvenze,
sottotitoli, grana, letterbox e colonna sonora sintetizzata.

Uso:
    .venv/bin/python tools/genera_video.py --out demo/video.mp4
"""
import argparse, math, os, random, subprocess, sys, wave

import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1280, 720, 30
BASE_W, BASE_H = 1536, 864  # base 1.2x per il Ken Burns
TRANS = 0.8
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

PROMPT = "Un faro solitario su una scogliera durante una tempesta al tramonto"

SCENES = [
    {"shot": "Campo lunghissimo", "move": "zoom-in",
     "line": "Da lontano, un faro solitario veglia sulla scogliera in tempesta.",
     "pal": [(16, 12, 38), (64, 32, 96), (214, 110, 55)], "orb": (0.68, 0.42, 70), "stars": 60, "faro": True},
    {"shot": "Campo medio", "move": "pan-right",
     "line": "Onde enormi si infrangono sulle rocce, tra lampi e foschia.",
     "pal": [(10, 16, 34), (36, 54, 92), (120, 140, 180)], "orb": None, "stars": 0, "faro": False},
    {"shot": "Primo piano", "move": "zoom-in",
     "line": "Il fascio di luce squarcia il buio: un respiro nella notte.",
     "pal": [(8, 8, 26), (30, 24, 70), (90, 70, 150)], "orb": (0.5, 0.34, 46), "stars": 90, "faro": True},
    {"shot": "Inquadratura dinamica", "move": "pan-left",
     "line": "La pioggia sferza la torre, ma la lampada non si arrende.",
     "pal": [(12, 20, 30), (40, 66, 80), (170, 120, 80)], "orb": (0.3, 0.5, 56), "stars": 20, "faro": True},
    {"shot": "Dettaglio drammatico", "move": "zoom-in",
     "line": "Ogni fulmine rivela la furia del mare in burrasca.",
     "pal": [(20, 10, 30), (80, 30, 70), (230, 130, 70)], "orb": (0.55, 0.55, 64), "stars": 30, "faro": False},
    {"shot": "Campo medio", "move": "pan-right",
     "line": "Poi, lentamente, la tempesta allenta la sua morsa.",
     "pal": [(14, 22, 44), (50, 70, 110), (150, 170, 200)], "orb": (0.4, 0.4, 60), "stars": 50, "faro": True},
    {"shot": "Finale epico", "move": "zoom-out",
     "line": "E il faro resta lì: custode silenzioso dell'alba che verrà.",
     "pal": [(24, 14, 44), (96, 48, 88), (255, 170, 90)], "orb": (0.5, 0.46, 78), "stars": 70, "faro": True},
]


def lerp(a, b, t):
    return a + (b - a) * t


def ease(t):
    t = min(1, max(0, t))
    return t * t * (3 - 2 * t)


# ---------------- Arte di base ----------------

def vgrad(w, h, stops):
    """Gradiente verticale a 3 stop -> PIL RGB."""
    top, mid, bot = [np.array(c, float) for c in stops]
    ys = np.linspace(0, 1, h)[:, None, None]
    upper = ys < 0.55
    t1 = np.clip(ys / 0.55, 0, 1)
    t2 = np.clip((ys - 0.55) / 0.45, 0, 1)
    arr = np.where(upper, top + (mid - top) * t1, mid + (bot - mid) * t2)
    return Image.fromarray(np.repeat(arr.astype("uint8"), w, axis=1))


def glow(img, cx, cy, r, color=(255, 230, 190), alpha=200):
    ov = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    for i in range(24, 0, -1):
        rr = r * i / 8
        a = int(alpha * (1 - i / 26) ** 2)
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=color + (a,))
    d.ellipse([cx - r / 3, cy - r / 3, cx + r / 3, cy + r / 3], fill=(255, 250, 240, 255))
    return Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB")


def mountains(img, rng, base_y, amp, color):
    w, h = img.size
    ov = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    n = 26
    pts = [0, h]
    ys = [base_y + (rng.random() - 0.45) * amp for _ in range(n + 1)]
    ys = [sum(ys[max(0, i - 1):i + 2]) / 3 for i in range(len(ys))]  # smussa
    for i, y in enumerate(ys):
        pts += [i * w / n, y]
    pts += [w, h]
    d.polygon(pts, fill=color + (235,))
    return Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB")


def sea(img, rng, top_y, orb_x=None):
    w, h = img.size
    d = ImageDraw.Draw(img)
    d.rectangle([0, top_y, w, h], fill=(6, 10, 22))
    for _ in range(90):  # riflessi orizzontali
        y = top_y + rng.random() ** 1.5 * (h - top_y)
        ww = 20 + rng.random() * 160
        x = rng.random() * w
        bright = 40 + rng.random() * 90
        d.line([x, y, x + ww, y], fill=(int(bright * 0.7), int(bright * 0.8), int(bright)), width=2)
    if orb_x:  # colonna di luce sotto l'astro
        for _ in range(40):
            y = top_y + rng.random() * (h - top_y)
            ww = 30 + rng.random() * 90
            d.line([orb_x - ww / 2, y, orb_x + ww / 2, y], fill=(255, 190, 120, 255), width=3)
    return img


def lighthouse(img, rng, fx):
    """Torre + fascio di luce su scoglio."""
    w, h = img.size
    ov = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    fy = h * 0.62  # base scoglio
    d.polygon([(fx - 120, h), (fx - 70, fy), (fx + 70, fy), (fx + 130, h)], fill=(12, 12, 20, 255))
    tw, th = 46, 190
    d.polygon([(fx - tw / 2, fy), (fx - tw / 2 + 8, fy - th),
               (fx + tw / 2 - 8, fy - th), (fx + tw / 2, fy)], fill=(232, 230, 225, 255))
    for i in range(3):  # fasce rosse
        yy = fy - 30 - i * 55
        d.polygon([(fx - tw / 2 + 4, yy), (fx - tw / 2 + 10, yy - 26),
                   (fx + tw / 2 - 10, yy - 26), (fx + tw / 2 - 4, yy)], fill=(180, 40, 40, 255))
    lamp_y = fy - th
    d.rectangle([fx - 22, lamp_y - 30, fx + 22, lamp_y], fill=(20, 20, 30, 255))
    d.rectangle([fx - 15, lamp_y - 26, fx + 15, lamp_y - 4], fill=(255, 240, 200, 255))
    d.polygon([(fx - 26, lamp_y - 30), (fx, lamp_y - 48), (fx + 26, lamp_y - 30)], fill=(140, 30, 30, 255))
    # fascio doppio
    for sgn in (1, -1):
        for k in range(3):
            spread = 26 + k * 14
            d.polygon([(fx, lamp_y - 15),
                       (fx + sgn * w * 0.55, lamp_y - 15 - spread * 4),
                       (fx + sgn * w * 0.55, lamp_y - 15 + spread * 3)],
                      fill=(255, 244, 200, 34 - k * 8))
    img = Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB")
    return glow(img, fx, lamp_y - 15, 40)


def base_art(sc, seed):
    rng = random.Random(seed)
    img = vgrad(BASE_W, BASE_H, sc["pal"])
    if sc["orb"]:
        ox, oy, orr = sc["orb"]
        img = glow(img, int(BASE_W * ox), int(BASE_H * oy), orr)
    d = ImageDraw.Draw(img)
    for _ in range(sc["stars"]):  # stelle
        x, y = rng.random() * BASE_W, rng.random() * BASE_H * 0.55
        b = 120 + rng.random() * 135
        d.ellipse([x - 1, y - 1, x + 1, y + 1], fill=(int(b), int(b), int(b)))
    img = mountains(img, rng, BASE_H * 0.52, 130, (18, 16, 34))
    img = mountains(img, rng, BASE_H * 0.62, 100, (10, 10, 22))
    ox = int(BASE_W * sc["orb"][0]) if sc["orb"] else None
    img = sea(img, rng, int(BASE_H * 0.72), ox)
    if sc["faro"]:
        img = lighthouse(img, rng, int(BASE_W * (0.32 + (seed % 5) * 0.09)))
    return img


# ---------------- Ken Burns ----------------

def kb_frame(base, move, p):
    e = ease(p)
    if move == "zoom-in":
        s = lerp(1.00, 1.16, e)
        cx, cy = 0.5, 0.5
    elif move == "zoom-out":
        s = lerp(1.16, 1.00, e)
        cx, cy = 0.5, 0.5
    elif move == "pan-right":
        s = 1.16
        cx, cy = lerp(0.5 - 0.07, 0.5 + 0.07, e), 0.5
    else:  # pan-left
        s = 1.16
        cx, cy = lerp(0.5 + 0.07, 0.5 - 0.07, e), 0.5
    ww, hh = BASE_W / s, BASE_H / s
    x0 = min(max(cx * BASE_W - ww / 2, 0), BASE_W - ww)
    y0 = min(max(cy * BASE_H - hh / 2, 0), BASE_H - hh)
    return base.crop((int(x0), int(y0), int(x0 + ww), int(y0 + hh))).resize((W, H), Image.BILINEAR)


# ---------------- Overlay ----------------

def vignette():
    yy, xx = np.mgrid[0:H, 0:W]
    d = np.sqrt(((xx - W / 2) / (W * 0.62)) ** 2 + ((yy - H / 2) / (H * 0.62)) ** 2)
    return np.clip(1 - d * 0.55, 0.45, 1)[..., None]


def wrap(draw, font, text, max_w):
    words, lines, line = text.split(), [], ""
    for wd in words:
        t = (line + " " + wd).strip()
        if draw.textlength(t, font=font) > max_w and line:
            lines.append(line)
            line = wd
        else:
            line = t
    if line:
        lines.append(line)
    return lines[:2]


# ---------------- Musica ----------------

def synth_music(path, total, starts, scene_d):
    sr = 44100
    t_all = np.arange(int(total * sr)) / sr
    out = np.zeros_like(t_all)
    prog = [0, -4, -7, -2, -5, -4, 0]  # semitoni da D3
    root = 146.83
    beat = 60 / 92
    for i, st in enumerate(starts):
        f0 = root * 2 ** (prog[i % len(prog)] / 12)
        # pad: tonica+terza+quinta+ottava con inviluppo lento
        m = (t_all >= st) & (t_all < st + scene_d + 0.6)
        tt = t_all[m] - st
        env = np.minimum(1, tt / 1.2) * np.minimum(1, (scene_d + 0.6 - tt) / 1.2)
        chord = sum(np.sin(2 * np.pi * f0 * 2 ** (n / 12) * 1.001 * t_all[m]) +
                    np.sin(2 * np.pi * f0 * 2 ** (n / 12) * 0.999 * t_all[m])
                    for n in (0, 3, 7, 12))
        out[m] += 0.05 * env * chord
        # basso
        for b in range(int((scene_d) / (beat * 2))):
            t0 = st + b * beat * 2
            mb = (t_all >= t0) & (t_all < t0 + beat * 1.8)
            tb = t_all[mb] - t0
            out[mb] += 0.20 * np.sin(2 * np.pi * (f0 / 2) * t_all[mb]) * np.exp(-tb * 2.2)
        # arpeggio
        scale = (0, 3, 7, 12, 15, 12, 7, 3)
        step = beat / 2
        for k in range(int(scene_d / step)):
            t0 = st + 0.15 + k * step
            ma = (t_all >= t0) & (t_all < t0 + step)
            ta = t_all[ma] - t0
            f = f0 * 2 * 2 ** (scale[k % len(scale)] / 12)
            out[ma] += 0.06 * np.sin(2 * np.pi * f * t_all[ma]) * np.exp(-ta * 9)
    # fade out + normalizza
    fade = np.minimum(1, (total - t_all) / 1.5).clip(0, 1)
    out = (out * fade)
    out = (out / (np.abs(out).max() + 1e-6) * 0.85 * 32767).astype(np.int16)
    with wave.open(path, "wb") as wv:
        wv.setnchannels(1)
        wv.setsampwidth(2)
        wv.setframerate(sr)
        wv.writeframes(out.tobytes())


# ---------------- Main ----------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="demo/agente-video-30s.mp4")
    ap.add_argument("--dur", type=float, default=30.0)
    ap.add_argument("--seed", type=int, default=20260922)
    args = ap.parse_args()

    n = len(SCENES)
    D = (args.dur + (n - 1) * TRANS) / n
    starts = [i * (D - TRANS) for i in range(n)]
    total = n * D - (n - 1) * TRANS
    nframes = int(total * FPS)
    print(f"Scene: {n} x {D:.2f}s, dissolvenze {TRANS}s -> totale {total:.1f}s ({nframes} frame)")

    print("Disegno scenografie...")
    bases = [base_art(sc, args.seed + i * 101) for i, sc in enumerate(SCENES)]

    print("Sintetizzo colonna sonora...")
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    wav = args.out + ".wav"
    synth_music(wav, total, starts, D)

    import imageio_ffmpeg
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [ff, "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
           "-i", "-", "-i", wav, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20",
           "-preset", "veryfast", "-c:a", "aac", "-b:a", "128k", "-shortest",
           "-movflags", "+faststart", args.out]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    vig = vignette()
    font = ImageFont.truetype(FONT, 40)
    rng_rain = np.random.RandomState(args.seed)
    drops = rng_rain.rand(140, 4)  # x, y0, speed, len
    bar = int(H * 0.07)

    print("Rendering + encoding...")
    for f in range(nframes):
        t = f / FPS
        frame = None
        for i, sc in enumerate(SCENES):
            lt = t - starts[i]
            if lt < 0 or lt > D:
                continue
            img = kb_frame(bases[i], sc["move"], lt / D)
            a = ease(lt / TRANS) if (i > 0 and lt < TRANS) else 1.0
            arr = np.asarray(img).astype(float)
            frame = arr if frame is None else frame * (1 - a) + arr * a
            cur = sc
        # pioggia (spazio schermo)
        img = Image.fromarray(frame.astype("uint8"))
        d = ImageDraw.Draw(img, "RGBA")
        yy = ((drops[:, 1] * (H + 60) + t * drops[:, 2] * 900) % (H + 60)) - 30
        for (x0, _, _, ln), y0 in zip(drops, yy):
            x = x0 * W + y0 * 0.12
            d.line([x, y0, x - ln * 8, y0 - ln * 26], fill=(170, 190, 220, 70), width=2)
        # fulmini casuali
        if random.Random(args.seed + f // 7).random() < 0.10 and f % 7 < 2:
            img = Image.blend(img, Image.new("RGB", img.size, (200, 210, 255)), 0.18)
        arr = np.asarray(img).astype(float)
        arr *= vig  # vignettatura
        arr += np.random.RandomState(f).randn(H, W, 1) * 5  # grana
        img = Image.fromarray(np.clip(arr, 0, 255).astype("uint8"))
        d = ImageDraw.Draw(img)
        d.rectangle([0, 0, W, bar], fill="black")  # letterbox
        d.rectangle([0, H - bar, W, H], fill="black")
        d.text((W - 16, H - bar - 12), "Agente Video", font=ImageFont.truetype(FONT, 24),
               anchor="rb", fill=(255, 255, 255, 140))
        lines = wrap(d, font, cur["line"], W * 0.86)  # sottotitoli
        y = H - bar - 18 - len(lines) * 50
        for ln in lines:
            d.text((W / 2, y), ln, font=font, anchor="ma", fill="white",
                   stroke_width=2, stroke_fill="black")
            y += 50
        proc.stdin.write(np.asarray(img).tobytes())
        if (f + 1) % 150 == 0 or f + 1 == nframes:
            print(f"  {f + 1}/{nframes} ({(f + 1) / nframes * 100:.0f}%)", flush=True)

    proc.stdin.close()
    proc.wait()
    os.remove(wav)
    size = os.path.getsize(args.out) / 1024 / 1024
    print(f"OK: {args.out} ({size:.1f} MB)")


if __name__ == "__main__":
    main()
