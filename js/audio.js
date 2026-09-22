/* ============================================================
   Agente Video — Colonna sonora generativa (Web Audio)
   Niente file mp3: pad, basso, arpeggio e whoosh sono sintetizzati
   in tempo reale. L'output va sia alle casse sia a un
   MediaStreamDestination registrabile nel video esportato.
   ============================================================ */
(function () {
  "use strict";

  var MOODS = {
    epic:   { bpm: 92,  root: 73.42, minor: true,  prog: [0, -4, -7, -2], bright: 900,  arp: true },
    chill:  { bpm: 70,  root: 110.0, minor: true,  prog: [0, -2, -4, -7], bright: 600,  arp: true },
    tense:  { bpm: 60,  root: 65.41, minor: true,  prog: [0, 1, 0, -5],   bright: 350,  arp: false },
    happy:  { bpm: 104, root: 130.81, minor: false, prog: [0, -3, 5, -2], bright: 1400, arp: true },
    none:   null
  };

  function semitone(freq, n) { return freq * Math.pow(2, n / 12); }

  function Score(moodKey) {
    this.moodKey = moodKey;
    this.ctx = null;
    this.master = null;
    this.musicBus = null;
    this.dest = null;
    this.timers = [];
    this.playing = false;
  }

  Score.prototype.ensureCtx = function () {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return this.ctx;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
    this.dest = this.ctx.createMediaStreamDestination();
    this.master.connect(this.dest);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.5;
    var comp = this.ctx.createDynamicsCompressor();
    this.musicBus.connect(comp);
    comp.connect(this.master);
    return this.ctx;
  };

  Score.prototype.stream = function () {
    return this.dest ? this.dest.stream : null;
  };

  /* Pianifica l'intera timeline musicale in anticipo (semplice e robusto) */
  Score.prototype.start = function (totalDur, sceneStarts, sceneDur) {
    this.stop();
    if (this.moodKey === "none") return true;
    var cfg = MOODS[this.moodKey];
    if (!cfg) return true;
    var ctx = this.ensureCtx();
    if (!ctx) return false;
    var self = this;
    this.playing = true;
    var t0 = ctx.currentTime + 0.08;
    var beat = 60 / cfg.bpm;

    sceneStarts.forEach(function (st, i) {
      var chordRoot = semitone(cfg.root, cfg.prog[i % cfg.prog.length]);
      var at = t0 + st;
      var dur = sceneDur + 0.6;
      self._pad(at, dur, chordRoot, cfg);
      self._bass(at, dur, chordRoot, cfg, beat);
      if (cfg.arp) self._arp(at, sceneDur, chordRoot, cfg, beat);
      if (i > 0) self._whoosh(at - 0.4);
    });

    // Chiusura: dissolvenza finale
    var endAt = t0 + totalDur;
    this.musicBus.gain.setValueAtTime(0.5, Math.max(t0, endAt - 1.6));
    this.musicBus.gain.linearRampToValueAtTime(0.0001, endAt + 0.3);

    this.timers.push(setTimeout(function () { self.playing = false; }, (totalDur + 0.8) * 1000));
    return true;
  };

  Score.prototype._pad = function (at, dur, root, cfg) {
    var ctx = this.ctx;
    var notes = cfg.minor ? [0, 3, 7, 12] : [0, 4, 7, 12];
    var flt = ctx.createBiquadFilter();
    flt.type = "lowpass";
    flt.frequency.setValueAtTime(cfg.bright * 0.5, at);
    flt.frequency.linearRampToValueAtTime(cfg.bright, at + dur * 0.5);
    flt.frequency.linearRampToValueAtTime(cfg.bright * 0.4, at + dur);
    flt.Q.value = 0.6;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(0.16, at + dur * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, at + dur);
    flt.connect(g); g.connect(this.musicBus);
    notes.forEach(function (n) {
      [ -4, 3 ].forEach(function (det) {
        var o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = semitone(root * 2, n);
        o.detune.value = det;
        o.connect(flt);
        o.start(at); o.stop(at + dur + 0.05);
      });
    });
  };

  Score.prototype._bass = function (at, dur, root, cfg, beat) {
    var ctx = this.ctx;
    var n = Math.max(2, Math.floor(dur / (beat * 2)));
    for (var i = 0; i < n; i++) {
      var t = at + i * beat * 2;
      if (t > at + dur - 0.2) break;
      var o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = root;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t + beat * 1.8);
      o.connect(g); g.connect(this.musicBus);
      o.start(t); o.stop(t + beat * 2);
    }
  };

  Score.prototype._arp = function (at, dur, root, cfg, beat) {
    var ctx = this.ctx;
    var scale = cfg.minor ? [0, 3, 7, 12, 15, 12, 7, 3] : [0, 4, 7, 12, 16, 12, 7, 4];
    var step = beat / 2;
    var n = Math.floor(dur / step);
    for (var i = 0; i < n; i++) {
      var t = at + 0.15 + i * step;
      var o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = semitone(root * 4, scale[i % scale.length]);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.07, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + step * 0.95);
      o.connect(g); g.connect(this.musicBus);
      o.start(t); o.stop(t + step);
    }
  };

  Score.prototype._whoosh = function (at) {
    if (at < this.ctx.currentTime) return;
    var ctx = this.ctx;
    var len = Math.floor(ctx.sampleRate * 0.9);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var flt = ctx.createBiquadFilter();
    flt.type = "bandpass";
    flt.Q.value = 1.2;
    flt.frequency.setValueAtTime(300, at);
    flt.frequency.exponentialRampToValueAtTime(3500, at + 0.45);
    flt.frequency.exponentialRampToValueAtTime(400, at + 0.9);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(0.12, at + 0.4);
    g.gain.linearRampToValueAtTime(0.0001, at + 0.9);
    src.connect(flt); flt.connect(g); g.connect(this.musicBus);
    src.start(at);
  };

  Score.prototype.stop = function () {
    var self = this;
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.playing = false;
    if (this.ctx && this.musicBus) {
      try {
        this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime);
        this.musicBus.gain.setValueAtTime(0.0001, this.ctx.currentTime);
        setTimeout(function () {
          if (self.musicBus && !self.playing) self.musicBus.gain.value = 0.5;
        }, 300);
      } catch (e) { /* noop */ }
    }
  };

  window.AgenteAudio = { Score: Score, MOODS: MOODS };
})();
