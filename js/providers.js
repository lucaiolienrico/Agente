/* ============================================================
   Agente Video — Provider immagini
   Catena di fallback: Pollinations (FLUX, gratis) → Picsum (foto
   reali) → arte procedurale generata in locale (funziona offline).
   Tutte le immagini esterne sono caricate con CORS per poter
   essere registrate nel video senza "taint" del canvas.
   ============================================================ */
(function () {
  "use strict";

  var RATIO_SIZE = {
    "16:9": { w: 1280, h: 720 },
    "9:16": { w: 720, h: 1280 },
    "1:1": { w: 960, h: 960 }
  };

  function loadImage(url, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.crossOrigin = "anonymous";
      var done = false;
      var timer = setTimeout(function () {
        if (!done) { done = true; reject(new Error("timeout")); }
      }, timeoutMs || 60000);
      img.onload = function () { if (!done) { done = true; clearTimeout(timer); resolve(img); } };
      img.onerror = function () { if (!done) { done = true; clearTimeout(timer); reject(new Error("load-error")); } };
      img.src = url;
    });
  }

  function pollinationsUrl(prompt, w, h, seed) {
    return "https://image.pollinations.ai/prompt/" + encodeURIComponent(prompt) +
      "?width=" + w + "&height=" + h + "&seed=" + seed + "&model=flux&nologo=true";
  }

  function picsumUrl(w, h, seed) {
    return "https://picsum.photos/seed/agente" + seed + "/" + w + "/" + h;
  }

  /* ---------- Arte procedurale (fallback offline) ---------- */
  function proceduralArt(w, h, seed, label) {
    var c = document.createElement("canvas");
    c.width = w; c.height = h;
    var x = c.getContext("2d");
    var rnd = mulberry(seed);
    var h1 = Math.floor(rnd() * 360), h2 = (h1 + 40 + Math.floor(rnd() * 80)) % 360;
    var g = x.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "hsl(" + h1 + ",60%,14%)");
    g.addColorStop(0.55, "hsl(" + h2 + ",55%,24%)");
    g.addColorStop(1, "hsl(" + h1 + ",65%,10%)");
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
    // sole/luna
    var sx = w * (0.2 + rnd() * 0.6), sy = h * (0.2 + rnd() * 0.3), sr = Math.min(w, h) * (0.08 + rnd() * 0.08);
    var glow = x.createRadialGradient(sx, sy, 0, sx, sy, sr * 3);
    glow.addColorStop(0, "hsla(" + ((h1 + 180) % 360) + ",80%,75%,0.9)");
    glow.addColorStop(0.25, "hsla(" + ((h1 + 180) % 360) + ",70%,60%,0.5)");
    glow.addColorStop(1, "transparent");
    x.fillStyle = glow;
    x.fillRect(0, 0, w, h);
    // montagne/sagome
    for (var L = 0; L < 3; L++) {
      x.fillStyle = "hsla(" + h1 + ",45%," + (8 + L * 5) + "%,0.9)";
      x.beginPath();
      x.moveTo(0, h);
      var base = h * (0.55 + L * 0.13);
      for (var px = 0; px <= w; px += w / 12) {
        x.lineTo(px, base + (rnd() - 0.5) * h * 0.22);
      }
      x.lineTo(w, h);
      x.closePath();
      x.fill();
    }
    // stelle/particelle
    x.fillStyle = "rgba(255,255,255,0.7)";
    for (var i = 0; i < 120; i++) {
      var r = rnd() * 1.8 + 0.4;
      x.globalAlpha = 0.15 + rnd() * 0.6;
      x.beginPath();
      x.arc(rnd() * w, rnd() * h * 0.7, r, 0, 7);
      x.fill();
    }
    x.globalAlpha = 1;
    var img = new Image();
    img.src = c.toDataURL("image/jpeg", 0.85);
    img.dataset.procedural = "1";
    if (label) img.alt = label;
    return img;
  }

  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Carica l'immagine di una scena seguendo la catena di fallback.
   * Risolve con { img, source } dove source è "ai" | "foto" | "arte".
   */
  function fetchSceneImage(scene, ratio, seed) {
    var size = RATIO_SIZE[ratio] || RATIO_SIZE["16:9"];
    var w = size.w, h = size.h;
    // 1) Pollinations / FLUX
    return loadImage(pollinationsUrl(scene.imagePrompt, w, h, seed), 90000)
      .then(function (img) { return { img: img, source: "ai" }; })
      .catch(function () {
        // 2) Picsum (foto reali, niente AI ma sempre belle)
        return loadImage(picsumUrl(w, h, seed), 25000)
          .then(function (img) { return { img: img, source: "foto" }; })
          .catch(function () {
            // 3) Arte procedurale locale (offline)
            var art = proceduralArt(w, h, seed, scene.shot);
            if (art.complete && art.naturalWidth) return { img: art, source: "arte" };
            return new Promise(function (res) {
              art.onload = function () { res({ img: art, source: "arte" }); };
            });
          });
      });
  }

  window.AgenteProviders = {
    RATIO_SIZE: RATIO_SIZE,
    fetchSceneImage: fetchSceneImage,
    proceduralThumb: proceduralArt
  };
})();
