/* ============================================================
   Agente Video — Motore di rendering + export
   Timeline procedurale: Ken Burns, dissolvenze, grana, letterbox,
   sottotitoli. L'export registra canvas + audio in .webm.
   ============================================================ */
(function () {
  "use strict";

  var SCENE_D = 4.0;   // durata di ogni scena (s)
  var TRANS = 0.8;     // dissolvenza incrociata (s)

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ease(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

  function sceneStart(i) { return i * (SCENE_D - TRANS); }

  function wrapText(ctx, text, maxW) {
    var words = String(text).split(/\s+/);
    var lines = [], line = "";
    words.forEach(function (w) {
      var test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
      else line = test;
    });
    if (line) lines.push(line);
    return lines.slice(0, 3);
  }

  function makeNoiseFrame(w, h) {
    var c = document.createElement("canvas");
    c.width = w; c.height = h;
    var x = c.getContext("2d");
    var img = x.createImageData(w, h);
    for (var i = 0; i < img.data.length; i += 4) {
      var v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return c;
  }

  function Player(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.scenes = [];
    this.opt = { subs: true, letterbox: true, grain: true };
    this.t = 0;
    this.raf = 0;
    this.lastTs = 0;
    this.playing = false;
    this.recorder = null;
    this.chunks = [];
    this.onTime = null;
    this.onEnded = null;
    this._vig = null;
    this._vigKey = "";
    this._noise = [makeNoiseFrame(160, 90), makeNoiseFrame(160, 90), makeNoiseFrame(160, 90), makeNoiseFrame(160, 90)];
    this._frame = 0;
  }

  Player.prototype.setProject = function (scenes, opt) {
    this.scenes = scenes || [];
    if (opt) {
      this.opt.subs = opt.subs !== false;
      this.opt.letterbox = opt.letterbox !== false;
      this.opt.grain = opt.grain !== false;
    }
    this.stop();
    this.render(0);
  };

  Player.prototype.total = function () {
    var n = this.scenes.length;
    if (!n) return 0;
    return n * SCENE_D - (n - 1) * TRANS;
  };

  Player.prototype.starts = function () {
    return this.scenes.map(function (_, i) { return sceneStart(i); });
  };

  Player.prototype.currentIndex = function (t) {
    var idx = 0;
    for (var i = 0; i < this.scenes.length; i++) {
      if (t >= sceneStart(i)) idx = i;
    }
    return idx;
  };

  /* ---------- Disegno ---------- */

  Player.prototype.drawImageCover = function (img, move, p) {
    var ctx = this.ctx, cw = this.cv.width, ch = this.cv.height;
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) {
      ctx.fillStyle = "#14141f";
      ctx.fillRect(0, 0, cw, ch);
      return;
    }
    var base = Math.max(cw / iw, ch / ih);
    var s = 1.1, dx, dy, dw, dh;
    var e = ease(p);
    if (move === "zoom-in") s = lerp(1.02, 1.2, e);
    else if (move === "zoom-out") s = lerp(1.2, 1.02, e);
    else s = 1.16;
    dw = iw * base * s; dh = ih * base * s;
    dx = (cw - dw) / 2; dy = (ch - dh) / 2;
    if (move === "pan-left") dx = lerp(cw - dw, 0, e);           // da destra a sinistra
    else if (move === "pan-right") dx = lerp(0, cw - dw, e);
    else if (move === "pan-up") dy = lerp(0, ch - dh, e);
    ctx.drawImage(img, dx, dy, dw, dh);
  };

  Player.prototype.vignette = function () {
    var cw = this.cv.width, ch = this.cv.height;
    var key = cw + "x" + ch;
    if (this._vigKey !== key) {
      var g = this.ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.36, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,0.42)");
      this._vig = g;
      this._vigKey = key;
    }
    this.ctx.fillStyle = this._vig;
    this.ctx.fillRect(0, 0, cw, ch);
  };

  Player.prototype.grain = function () {
    var ctx = this.ctx, cw = this.cv.width, ch = this.cv.height;
    ctx.save();
    ctx.globalAlpha = 0.055;
    var n = this._noise[this._frame % this._noise.length];
    ctx.drawImage(n, 0, 0, cw, ch);
    ctx.restore();
  };

  Player.prototype.subtitle = function (text) {
    if (!text) return;
    var ctx = this.ctx, cw = this.cv.width, ch = this.cv.height;
    var fs = Math.round(cw * 0.034);
    ctx.font = "600 " + fs + "px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    var lines = wrapText(ctx, text, cw * 0.86);
    var lh = fs * 1.32;
    var barH = this.opt.letterbox ? ch * 0.07 : ch * 0.02;
    var y = ch - barH - ch * 0.025 - (lines.length - 1) * lh;
    lines.forEach(function (ln, i) {
      var yy = y + i * lh;
      ctx.lineWidth = Math.max(2, fs * 0.14);
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.strokeText(ln, cw / 2, yy);
      ctx.fillStyle = "#fff";
      ctx.fillText(ln, cw / 2, yy);
    });
  };

  Player.prototype.overlays = function () {
    var ctx = this.ctx, cw = this.cv.width, ch = this.cv.height;
    this.vignette();
    if (this.opt.grain) this.grain();
    if (this.opt.letterbox) {
      ctx.fillStyle = "#000";
      var b = Math.round(ch * 0.07);
      ctx.fillRect(0, 0, cw, b);
      ctx.fillRect(0, ch - b, cw, b);
    }
    // watermark
    ctx.save();
    ctx.font = "700 " + Math.round(cw * 0.018) + "px Inter, system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    var wy = this.opt.letterbox ? ch - Math.round(ch * 0.07) - 8 : ch - 8;
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText("Agente Video", cw - 14, wy);
    ctx.restore();
  };

  Player.prototype.render = function (t) {
    var ctx = this.ctx, cw = this.cv.width, ch = this.cv.height;
    this._frame++;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, cw, ch);
    var n = this.scenes.length;
    if (!n) {
      ctx.fillStyle = "#8a8aa0";
      ctx.font = "500 " + Math.round(cw * 0.03) + "px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Nessun progetto — genera un video per iniziare", cw / 2, ch / 2);
      return;
    }
    t = clamp(t, 0, this.total());
    // Trova scene visibili (al massimo 2 durante la dissolvenza)
    for (var i = 0; i < n; i++) {
      var lt = t - sceneStart(i);
      if (lt < 0 || lt > SCENE_D) continue;
      var sc = this.scenes[i];
      var alpha = 1;
      if (i > 0 && lt < TRANS) alpha = ease(lt / TRANS);
      ctx.save();
      ctx.globalAlpha = alpha;
      if (sc.img) this.drawImageCover(sc.img, sc.move || "zoom-in", lt / SCENE_D);
      ctx.restore();
    }
    var cur = this.scenes[this.currentIndex(t)];
    if (this.opt.subs && cur && cur.line) this.subtitle(cur.line);
    this.overlays();
  };

  /* ---------- Riproduzione ---------- */

  Player.prototype.tick = function (ts) {
    if (!this.playing) return;
    if (!this.lastTs) this.lastTs = ts;
    var dt = (ts - this.lastTs) / 1000;
    this.lastTs = ts;
    this.t += dt;
    var total = this.total();
    if (this.t >= total) {
      this.t = total;
      this.render(this.t);
      if (this.onTime) this.onTime(this.t, total);
      this.finish();
      return;
    }
    this.render(this.t);
    if (this.onTime) this.onTime(this.t, total);
    var self = this;
    this.raf = requestAnimationFrame(function (x) { self.tick(x); });
  };

  Player.prototype.play = function (opts) {
    opts = opts || {};
    if (!this.scenes.length || this.playing) return false;
    if (this.t >= this.total() - 0.05) this.t = 0;
    if (opts.record) {
      if (!this.startRecorder(opts.audioStream)) return false;
    }
    this.playing = true;
    this.lastTs = 0;
    var self = this;
    this.raf = requestAnimationFrame(function (x) { self.tick(x); });
    return true;
  };

  Player.prototype.pause = function () {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.stopRecorder(true);
  };

  Player.prototype.stop = function () {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.stopRecorder(true);
    this.t = 0;
    this.render(0);
    if (this.onTime) this.onTime(0, this.total());
  };

  Player.prototype.finish = function () {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    var self = this;
    // Dà al recorder un attimo per chiudere l'ultimo frame
    setTimeout(function () {
      self.stopRecorder(false);
    }, 350);
  };

  /* ---------- Registrazione ---------- */

  Player.prototype.pickMime = function () {
    var cands = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm"
    ];
    if (typeof MediaRecorder === "undefined") return "";
    for (var i = 0; i < cands.length; i++) {
      try {
        if (MediaRecorder.isTypeSupported(cands[i])) return cands[i];
      } catch (e) { /* noop */ }
    }
    return "";
  };

  Player.prototype.startRecorder = function (audioStream) {
    try {
      var vStream = this.cv.captureStream(30);
      var tracks = vStream.getVideoTracks().slice();
      if (audioStream) {
        audioStream.getAudioTracks().forEach(function (tr) { tracks.push(tr); });
      }
      var mixed = new MediaStream(tracks);
      var mime = this.pickMime();
      var rec = new MediaRecorder(mixed, {
        mimeType: mime || undefined,
        videoBitsPerSecond: 6 * 1000 * 1000
      });
      this.chunks = [];
      var self = this;
      rec.ondataavailable = function (ev) {
        if (ev.data && ev.data.size) self.chunks.push(ev.data);
      };
      rec.start(250);
      this.recorder = rec;
      return true;
    } catch (e) {
      return false;
    }
  };

  Player.prototype.stopRecorder = function (discard) {
    var rec = this.recorder;
    this.recorder = null;
    if (!rec) {
      if (!discard && this.onEnded) this.onEnded(null);
      return;
    }
    var self = this;
    rec.onstop = function () {
      var blob = null;
      if (!discard && self.chunks.length) {
        blob = new Blob(self.chunks, { type: rec.mimeType || "video/webm" });
      }
      self.chunks = [];
      if (self.onEnded && !discard) self.onEnded(blob);
    };
    try { rec.stop(); } catch (e) { if (self.onEnded && !discard) self.onEnded(null); }
  };

  /* ---------- Sottotitoli SRT ---------- */

  function srtTime(sec) {
    sec = Math.max(0, sec);
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    var s = Math.floor(sec % 60), ms = Math.floor((sec % 1) * 1000);
    function p(n, l) { n = String(n); while (n.length < l) n = "0" + n; return n; }
    return p(h, 2) + ":" + p(m, 2) + ":" + p(s, 2) + "," + p(ms, 3);
  }

  function buildSRT(scenes) {
    var out = [];
    scenes.forEach(function (sc, i) {
      var a = sceneStart(i);
      // Il sottotitolo finisce quando inizia la scena successiva (niente sovrapposizioni)
      var b = (i < scenes.length - 1) ? sceneStart(i + 1) + 0.3 : a + SCENE_D;
      out.push((i + 1) + "\n" + srtTime(a) + " --> " + srtTime(b) + "\n" + (sc.line || "") + "\n");
    });
    return out.join("\n");
  }

  window.AgenteEngine = {
    Player: Player,
    SCENE_D: SCENE_D,
    TRANS: TRANS,
    buildSRT: buildSRT
  };
})();
