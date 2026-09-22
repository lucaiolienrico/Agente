/* ============================================================
   Agente Video — App (UI + orchestrazione)
   ============================================================ */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  var state = {
    ratio: "16:9",
    dur: 12,
    scenes: [],
    project: null,
    score: null,
    exporting: false,
    playing: false,
    videoURL: null
  };

  var player = null;

  /* ---------------- Toast ---------------- */
  function toast(msg, type) {
    var box = $("toasts");
    var el = document.createElement("div");
    el.className = "toast " + (type || "");
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(function () {
      el.style.opacity = "0";
      el.style.transition = "opacity .4s";
      setTimeout(function () { el.remove(); }, 450);
    }, 4200);
    while (box.children.length > 4) box.firstChild.remove();
  }

  /* ---------------- Steps / progress ---------------- */
  var STEP_ORDER = ["script", "images", "edit", "ready"];
  function setStep(active) {
    var items = document.querySelectorAll("#steps li");
    items.forEach(function (li) {
      var key = li.getAttribute("data-s");
      li.classList.remove("active", "done");
      var ai = STEP_ORDER.indexOf(active), ki = STEP_ORDER.indexOf(key);
      if (active === "idle") return;
      if (ki < ai) li.classList.add("done");
      else if (ki === ai) li.classList.add("active");
      if (active === "ready") li.classList.add("done"), li.classList.remove("active");
    });
  }
  function setProgress(pct) { $("genProgress").style.width = Math.round(pct * 100) + "%"; }
  function setStatus(txt) { $("genStatus").textContent = txt; }

  /* ---------------- Segmented controls ---------------- */
  function seg(id, cb) {
    var el = $(id);
    el.addEventListener("click", function (ev) {
      var b = ev.target.closest("button");
      if (!b) return;
      el.querySelectorAll("button").forEach(function (x) { x.classList.remove("on"); });
      b.classList.add("on");
      cb(b.getAttribute("data-v"));
    });
  }

  /* ---------------- Gemini key ---------------- */
  function refreshAiBadge() {
    var has = window.AgenteScript.hasGeminiKey();
    $("aiBadge").textContent = has
      ? "✨ Sceneggiatura: Gemini AI (chiave attiva)"
      : "🧠 Sceneggiatura: locale (funziona senza chiave)";
  }

  function initKeyModal() {
    var modal = $("keyModal");
    $("btnKey").addEventListener("click", function () {
      $("keyInput").value = "";
      modal.classList.remove("hidden");
    });
    $("btnKeyClose").addEventListener("click", function () { modal.classList.add("hidden"); });
    modal.addEventListener("click", function (ev) { if (ev.target === modal) modal.classList.add("hidden"); });
    $("btnKeySave").addEventListener("click", function () {
      var v = $("keyInput").value.trim();
      if (!v) { toast("Incolla una chiave valida.", "warn"); return; }
      try { localStorage.setItem("agente_gemini_key", v); } catch (e) { /* noop */ }
      modal.classList.add("hidden");
      refreshAiBadge();
      toast("Chiave salvata nel browser. Ora la sceneggiatura è scritta da Gemini!", "ok");
    });
    $("btnKeyRemove").addEventListener("click", function () {
      try { localStorage.removeItem("agente_gemini_key"); } catch (e) { /* noop */ }
      modal.classList.add("hidden");
      refreshAiBadge();
      toast("Chiave rimossa. Torno alla sceneggiatura locale.");
    });
  }

  /* ---------------- Esempi ---------------- */
  function initExamples() {
    var wrap = $("exampleCards");
    window.AgenteScript.EXAMPLES.forEach(function (ex) {
      var c = document.createElement("div");
      c.className = "card";
      c.innerHTML = '<div class="t">' + ex.icon + '</div><h3></h3><p></p>';
      c.querySelector("h3").textContent = ex.title;
      c.querySelector("p").textContent = ex.text;
      c.addEventListener("click", function () {
        $("prompt").value = ex.text;
        $("prompt").focus();
        document.getElementById("promptCard").scrollIntoView({ behavior: "smooth", block: "center" });
        toast("Prompt caricato: “" + ex.title + "”. Premi Genera video! 🎬");
      });
      wrap.appendChild(c);
    });
  }

  /* ---------------- Storyboard ---------------- */
  var SRC_LABEL = { ai: "🤖 AI", foto: "📷 Foto", arte: "🎨 Arte" };

  function renderStoryboard(loading) {
    var box = $("scenes");
    box.innerHTML = "";
    var ratioCls = state.ratio === "9:16" ? "portrait" : state.ratio === "1:1" ? "square" : "";
    state.scenes.forEach(function (sc, i) {
      var d = document.createElement("div");
      d.className = "scene " + ratioCls + (loading ? " loading" : "");
      d.id = "scene-" + i;
      d.innerHTML = '<img alt="" /><div class="scene-body"><div class="scene-top">' +
        '<span class="scene-n"></span><span class="scene-shot"></span><span class="scene-src"></span>' +
        '</div><p></p></div>';
      d.querySelector(".scene-n").textContent = "Scena " + (i + 1);
      d.querySelector(".scene-shot").textContent = sc.shot || "";
      d.querySelector("p").textContent = sc.line || "";
      if (sc.img) d.querySelector("img").src = sc.img.src;
      if (sc.source) d.querySelector(".scene-src").textContent = SRC_LABEL[sc.source] || "";
      box.appendChild(d);
    });
  }

  function updateSceneCard(i) {
    var d = $("scene-" + i);
    if (!d) return;
    var sc = state.scenes[i];
    d.classList.remove("loading");
    if (sc.img) d.querySelector("img").src = sc.img.src;
    d.querySelector(".scene-src").textContent = SRC_LABEL[sc.source] || "";
  }

  /* ---------------- Generazione ---------------- */
  function nScenes() { return Math.max(2, Math.round(state.dur / window.AgenteEngine.SCENE_D)); }

  function setBusy(b) {
    ["btnGenerate", "btnPlay", "btnStop", "btnExport", "btnEnhance", "btnSurprise"].forEach(function (id) {
      var el = $(id);
      if (id === "btnPlay" || id === "btnStop" || id === "btnExport") {
        el.disabled = b || !state.project;
      } else {
        el.disabled = b;
      }
    });
    $("btnVoice").disabled = b || !state.project;
  }

  function generate() {
    var prompt = $("prompt").value.trim();
    if (prompt.length < 8) {
      toast("Scrivi un prompt più descrittivo (almeno qualche parola). ✍️", "warn");
      $("prompt").focus();
      return;
    }
    if (state.exporting || state.playing) stopAll();

    var style = $("selStyle").value;
    var camera = $("selCam").value;
    var need = nScenes();
    var seedBase = Math.floor(Math.random() * 90000) + 1000;

    setBusy(true);
    $("resultBox").classList.add("hidden");
    if (state.videoURL) { URL.revokeObjectURL(state.videoURL); state.videoURL = null; }
    setStep("script");
    setProgress(0.04);
    setStatus("✍️ Scrivo la sceneggiatura…");

    var useGemini = window.AgenteScript.hasGeminiKey();
    var p = useGemini
      ? window.AgenteScript.expandWithGemini(prompt, need, style, camera).catch(function (err) {
          console.warn("Gemini fallito, uso locale:", err);
          toast("Gemini non ha risposto, uso la sceneggiatura locale. ⚠️", "warn");
          return window.AgenteScript.expandLocal(prompt, need, style, camera);
        })
      : Promise.resolve(window.AgenteScript.expandLocal(prompt, need, style, camera));

    p.then(function (scenes) {
      state.scenes = scenes;
      renderStoryboard(true);
      setStep("images");
      setStatus("🎨 Genero le immagini AI (può volerci ~1 minuto)…");
      var done = 0;
      var jobs = scenes.map(function (sc, i) {
        return window.AgenteProviders.fetchSceneImage(sc, state.ratio, seedBase + i * 17)
          .then(function (r) {
            sc.img = r.img; sc.source = r.source;
            done++;
            setProgress(0.08 + (0.8 * done) / scenes.length);
            setStatus("🎨 Immagini AI: " + done + "/" + scenes.length + " pronte…");
            updateSceneCard(i);
          });
      });
      return Promise.all(jobs);
    }).then(function () {
      setStep("edit");
      setProgress(0.92);
      setStatus("🎞️ Montaggio: camera, dissolvenze, sottotitoli, musica…");
      return new Promise(function (res) { setTimeout(res, 350); });
    }).then(function () {
      buildProject(style);
      setStep("ready");
      setProgress(1);
      var aiCount = state.scenes.filter(function (s) { return s.source === "ai"; }).length;
      setStatus("✅ Pronto! " + aiCount + "/" + state.scenes.length + " immagini AI pure. Premi Play o esporta il video.");
      setBusy(false);
      saveHistory(prompt, style);
      toast("Video pronto per l'anteprima! 🎬", "ok");
      // Autoplay dell'anteprima
      setTimeout(function () { playPreview(); }, 500);
    }).catch(function (err) {
      console.error(err);
      setStep("idle");
      setStatus("❌ Qualcosa è andato storto. Riprova.");
      setBusy(false);
      toast("Errore durante la generazione. Riprova tra poco.", "err");
    });
  }

  function buildProject(style) {
    var size = window.AgenteProviders.RATIO_SIZE[state.ratio];
    var cv = $("stage");
    cv.width = size.w; cv.height = size.h;
    var wrap = $("canvasWrap");
    wrap.className = "canvas-wrap ratio-" + state.ratio.replace(":", "-");
    $("canvasOverlay").classList.add("gone");

    state.project = {
      prompt: $("prompt").value.trim(),
      style: style,
      ratio: state.ratio,
      dur: state.dur,
      at: Date.now()
    };
    player.setProject(state.scenes, {
      subs: $("chkSubs").checked,
      letterbox: $("chkBox").checked,
      grain: $("chkGrain").checked
    });
    var total = player.total();
    $("metaPill").textContent = state.scenes.length + " scene · " + total.toFixed(1) + "s · " + state.ratio;
    renderDots(0);
  }

  function renderDots(active) {
    var box = $("sceneDots");
    box.innerHTML = "";
    state.scenes.forEach(function (_, i) {
      var d = document.createElement("i");
      if (i === active) d.className = "on";
      box.appendChild(d);
    });
  }

  /* ---------------- Play / Stop / Export ---------------- */

  function currentMood() { return $("selMusic").value; }

  function playPreview() {
    if (!state.project || state.exporting || state.playing) return;
    if (!state.score) state.score = new window.AgenteAudio.Score(currentMood());
    state.score.moodKey = currentMood();
    state.score.start(player.total(), player.starts(), window.AgenteEngine.SCENE_D);
    player.onEnded = function () { state.playing = false; state.score.stop(); setBusy(false); syncPlayBtn(); };
    if (player.play()) {
      state.playing = true;
      setBusy(true);
      $("btnStop").disabled = false;
      syncPlayBtn();
    } else {
      state.score.stop();
    }
  }

  function stopAll() {
    if (state.score) state.score.stop();
    player.stop();
    state.playing = false;
    state.exporting = false;
    $("expProgress").style.width = "0%";
    setBusy(false);
    syncPlayBtn();
  }

  function syncPlayBtn() {
    $("btnPlay").textContent = state.playing ? "⏸ In riproduzione…" : "▶ Play";
  }

  function exportVideo() {
    if (!state.project || state.exporting || state.playing) return;
    if (typeof MediaRecorder === "undefined" || !HTMLCanvasElement.prototype.captureStream) {
      toast("Il tuo browser non supporta l'export video. Prova Chrome o Edge. ⚠️", "err");
      return;
    }
    state.exporting = true;
    setBusy(true);
    $("resultBox").classList.add("hidden");
    $("expProgress").style.width = "0%";
    setStatus("⏺️ Registrazione in corso… guarda l'anteprima mentre esporto!");
    toast("⏺️ Export avviato: registrazione in tempo reale.", "ok");

    if (!state.score) state.score = new window.AgenteAudio.Score(currentMood());
    state.score.moodKey = currentMood();
    state.score.start(player.total(), player.starts(), window.AgenteEngine.SCENE_D);
    var audioStream = state.score.stream();

    player.onEnded = function (blob) {
      state.score.stop();
      state.exporting = false;
      state.playing = false;
      setBusy(false);
      syncPlayBtn();
      if (blob && blob.size > 1000) {
        if (state.videoURL) URL.revokeObjectURL(state.videoURL);
        state.videoURL = URL.createObjectURL(blob);
        $("resultVideo").src = state.videoURL;
        var dl = $("btnDownload");
        dl.href = state.videoURL;
        dl.download = "agente-video-" + Date.now() + ".webm";
        $("resultBox").classList.remove("hidden");
        $("expProgress").style.width = "100%";
        setStatus("✅ Export completato (" + (blob.size / 1024 / 1024).toFixed(1) + " MB). Scaricalo qui sotto!");
        toast("Video esportato con successo! 🎉", "ok");
        $("resultBox").scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        $("expProgress").style.width = "0%";
        setStatus("❌ Export fallito: il browser non ha registrato nulla.");
        toast("Export fallito. Riprova con Chrome/Edge.", "err");
      }
    };

    player.t = 0;
    if (!player.play({ record: true, audioStream: audioStream })) {
      state.score.stop();
      state.exporting = false;
      setBusy(false);
      setStatus("❌ Il browser ha bloccato la registrazione.");
      toast("Registrazione non riuscita su questo browser.", "err");
    }
  }

  /* ---------------- Voce (anteprima TTS) ---------------- */
  var speaking = false;
  function toggleVoice() {
    if (!("speechSynthesis" in window)) {
      toast("Sintesi vocale non supportata da questo browser.", "warn");
      return;
    }
    if (speaking) {
      window.speechSynthesis.cancel();
      speaking = false;
      $("btnVoice").textContent = "🔊 Voce";
      return;
    }
    var text = state.scenes.map(function (s) { return s.line; }).join(" ");
    if (!text) return;
    var u = new SpeechSynthesisUtterance(text);
    var lang = (state.scenes[0] && state.scenes[0].lang) || "it";
    u.lang = lang === "en" ? "en-US" : "it-IT";
    u.rate = 0.98;
    var voices = window.speechSynthesis.getVoices();
    var v = voices.filter(function (x) { return x.lang && x.lang.toLowerCase().indexOf(lang) === 0; })[0];
    if (v) u.voice = v;
    u.onend = function () { speaking = false; $("btnVoice").textContent = "🔊 Voce"; };
    speaking = true;
    $("btnVoice").textContent = "⏹ Stop voce";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    toast("🔊 Anteprima voce fuori campo (non inclusa nell'export).");
  }

  /* ---------------- SRT ---------------- */
  function downloadSRT() {
    if (!state.scenes.length) return;
    var srt = window.AgenteEngine.buildSRT(state.scenes);
    var blob = new Blob([srt], { type: "text/plain" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "agente-video-" + Date.now() + ".srt";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }

  /* ---------------- Cronologia ---------------- */
  function saveHistory(prompt, style) {
    try {
      var h = JSON.parse(localStorage.getItem("agente_history") || "[]");
      var thumb = "";
      try {
        if (state.scenes[0] && state.scenes[0].img) {
          var c = document.createElement("canvas");
          c.width = 320; c.height = 180;
          c.getContext("2d").drawImage(state.scenes[0].img, 0, 0, 320, 180);
          thumb = c.toDataURL("image/jpeg", 0.7);
        }
      } catch (e) { thumb = ""; }
      h.unshift({ prompt: prompt, style: style, ratio: state.ratio, dur: state.dur, at: Date.now(), thumb: thumb });
      h = h.slice(0, 8);
      localStorage.setItem("agente_history", JSON.stringify(h));
      renderHistory();
    } catch (e) { /* quota o privacy mode */ }
  }

  function renderHistory() {
    var h = [];
    try { h = JSON.parse(localStorage.getItem("agente_history") || "[]"); } catch (e) { /* noop */ }
    if (!h.length) return;
    $("cronologia").hidden = false;
    var box = $("historyCards");
    box.innerHTML = "";
    h.forEach(function (item) {
      var c = document.createElement("div");
      c.className = "card";
      var date = new Date(item.at).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      c.innerHTML = (item.thumb ? '<img alt="" />' : "") + "<p></p><p class='sub-sm'></p>";
      if (item.thumb) c.querySelector("img").src = item.thumb;
      c.querySelector("p").textContent = item.prompt;
      c.querySelector(".sub-sm").textContent = date + " · " + item.style + " · " + item.ratio + " · " + item.dur + "s";
      c.addEventListener("click", function () {
        $("prompt").value = item.prompt;
        $("selStyle").value = item.style;
        document.getElementById("promptCard").scrollIntoView({ behavior: "smooth", block: "center" });
        toast("Prompt ricaricato dalla cronologia. Premi Genera! 🎬");
      });
      box.appendChild(c);
    });
  }

  /* ---------------- Migliora / Sorpresa ---------------- */
  function enhancePrompt() {
    var ta = $("prompt");
    var v = ta.value.trim();
    if (v.length < 4) { toast("Scrivi prima almeno un'idea di prompt. ✍️", "warn"); return; }
    var style = $("selStyle").value;
    $("btnEnhance").disabled = true;
    var p = window.AgenteScript.hasGeminiKey()
      ? window.AgenteScript.enhanceWithGemini(v, style).catch(function () { return window.AgenteScript.enhanceLocal(v, style); })
      : Promise.resolve(window.AgenteScript.enhanceLocal(v, style));
    p.then(function (out) {
      ta.value = out;
      toast("Prompt arricchito! ✨", "ok");
    }).finally(function () { $("btnEnhance").disabled = false; });
  }

  /* ---------------- Init ---------------- */
  function init() {
    player = new window.AgenteEngine.Player($("stage"));
    player.onTime = function (t, total) {
      $("timeLabel").textContent = t.toFixed(1) + "s / " + total.toFixed(1) + "s";
      renderDots(player.currentIndex(t));
      if (state.exporting && total > 0) $("expProgress").style.width = (t / total * 100) + "%";
    };
    player.render(0);

    seg("segRatio", function (v) { state.ratio = v; });
    seg("segDur", function (v) { state.dur = parseInt(v, 10); });

    $("btnGenerate").addEventListener("click", generate);
    $("btnPlay").addEventListener("click", playPreview);
    $("btnStop").addEventListener("click", stopAll);
    $("btnExport").addEventListener("click", exportVideo);
    $("btnVoice").addEventListener("click", toggleVoice);
    $("btnSrt").addEventListener("click", downloadSRT);
    $("btnEnhance").addEventListener("click", enhancePrompt);
    $("btnSurprise").addEventListener("click", function () {
      var arr = window.AgenteScript.SURPRISES;
      $("prompt").value = arr[Math.floor(Math.random() * arr.length)];
      toast("Prompt a sorpresa! 🎲 Premi Genera video.");
    });
    $("btnNew").addEventListener("click", function () {
      $("prompt").value = "";
      $("prompt").focus();
      document.getElementById("promptCard").scrollIntoView({ behavior: "smooth" });
    });

    initKeyModal();
    initExamples();
    renderHistory();
    refreshAiBadge();
    setBusy(false);
    $("btnPlay").disabled = true;
    $("btnStop").disabled = true;
    $("btnExport").disabled = true;
  }

  document.addEventListener("DOMContentLoaded", init);
})();
