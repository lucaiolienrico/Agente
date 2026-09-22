/* ============================================================
   Agente Video — Sceneggiatura
   Trasforma il prompt in scene: inquadratura, movimento camera,
   prompt immagine e battuta narrativa. Funziona in locale (template
   cinematografici) oppure con Gemini se è presente una API key.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- Stili visivi: suffissi per i prompt immagine ---------- */
  var STYLES = {
    cinematic: "cinematic film still, dramatic lighting, shallow depth of field, 35mm, ultra detailed",
    photoreal: "ultra photorealistic, 8k photography, natural light, sharp focus, highly detailed",
    nature: "epic nature photography, breathtaking landscape, golden light, national geographic style, ultra detailed",
    scifi: "sci-fi concept art, futuristic, volumetric light, intricate details, cinematic composition",
    cyberpunk: "cyberpunk aesthetic, neon lights, rain reflections, night city, moody, ultra detailed",
    anime: "beautiful anime style, studio ghibli inspired, vibrant colors, detailed background art",
    watercolor: "delicate watercolor painting, soft washes, artistic, paper texture, dreamy",
    noir: "film noir black and white, high contrast, dramatic shadows, vintage cinema still"
  };

  /* ---------- Archetipi di scena (battute narrative) ---------- */
  var BEATS_IT = [
    {
      shot: "Campo lunghissimo",
      move: "zoom-in",
      lines: [
        "Tutto comincia da qui: {s}, immenso e silenzioso davanti ai nostri occhi.",
        "Da lontano, {s} si rivela in tutta la sua grandezza.",
        "L'orizzonte si apre su {s}: il viaggio sta per iniziare."
      ]
    },
    {
      shot: "Campo medio",
      move: "pan-right",
      lines: [
        "Ci avviciniamo: ogni dettaglio di {s} racconta una storia.",
        "Lo sguardo scivola su {s}, tra luci e ombre in movimento.",
        "{s_cap} si anima: è il momento di entrare nella scena."
      ]
    },
    {
      shot: "Primo piano",
      move: "zoom-in",
      lines: [
        "Un dettaglio cambia tutto: {d}.",
        "Da vicino, {s} mostra la sua anima più vera.",
        "Il tempo rallenta su {d}, ed è pura magia."
      ]
    },
    {
      shot: "Inquadratura dinamica",
      move: "pan-left",
      lines: [
        "L'azione cresce: {s} non è più lo stesso di prima.",
        "Qualcosa si muove in {s}: il ritmo accelera.",
        "La camera danza attorno a {s}, in un crescendo di emozioni."
      ]
    },
    {
      shot: "Finale epico",
      move: "zoom-out",
      lines: [
        "E mentre ci allontaniamo, {s} resta impresso nella memoria.",
        "L'ultima immagine di {s} è quella che ricorderemo per sempre.",
        "Il sipario cala su {s}: fine del viaggio, inizio del ricordo."
      ]
    }
  ];

  var BEATS_EN = [
    { shot: "Extreme wide shot", move: "zoom-in", lines: ["It all begins here: {s}, vast and silent before our eyes.", "From afar, {s} reveals its full grandeur."] },
    { shot: "Medium shot", move: "pan-right", lines: ["We move closer: every detail of {s} tells a story.", "{s_cap} comes alive as we enter the scene."] },
    { shot: "Close-up", move: "zoom-in", lines: ["One detail changes everything: {d}.", "Up close, {s} shows its truest soul."] },
    { shot: "Dynamic shot", move: "pan-left", lines: ["The action rises: {s} will never be the same.", "The camera dances around {s} in a rising crescendo."] },
    { shot: "Epic finale", move: "zoom-out", lines: ["And as we pull away, {s} stays etched in memory.", "The curtain falls on {s}: journey's end, memory's beginning."] }
  ];

  var STOPWORDS = ("il,lo,la,i,gli,le,un,uno,una,di,a,da,in,con,su,per,tra,fra,che,chi,come,dove,quando,quale,quanto,non,si,ci,ne,ne,il,del,dello,della,dei,degli,delle,al,allo,alla,ai,agli,alle,dal,dallo,dalla,dai,dagli,dalle,nel,nello,nella,nei,negli,nelle,sul,sullo,sulla,sui,sugli,sulle,è,sono,ho,hai,ha,abbiamo,hanno,una,questo,questa,questi,queste,quello,quella,molto,più,anche,solo,ogni,sopra,sotto,tra,verso,durante,mentre,dopo,prima,poi,ora,qui,li,là,the,a,an,and,or,of,to,with,from,that,this,these,those,its,it,is,are,was,were,be,been,being,at,by,for,on,over,into,through,during,very,more,most,some,such,than,then,there,their,they,them,he,she,we,you,your,his,her,our,all,any,each,other,about,above,after,before,between,under,while").split(",");

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  function detectLang(prompt) {
    var itHits = (prompt.match(/\b(che|una|della|nella|sono|questo|molto|con|tra|come|dove|quando|bellissim\w*|tramonto|mare|città|notte|luce|sopra|verso)\b/gi) || []).length;
    var enHits = (prompt.match(/\b(the|with|from|that|this|through|beautiful|night|light|city|over|between|while)\b/gi) || []).length;
    return enHits > itHits ? "en" : "it";
  }

  function keywords(prompt) {
    var words = (prompt.toLowerCase().match(/[a-zà-ÿ]{3,}/g) || []);
    var stop = {};
    STOPWORDS.forEach(function (w) { stop[w] = 1; });
    var out = [], seen = {};
    words.forEach(function (w) {
      if (!stop[w] && !seen[w]) { seen[w] = 1; out.push(w); }
    });
    return out;
  }

  function cleanSubject(prompt) {
    var s = prompt.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
    if (s.length > 90) s = s.slice(0, 90).replace(/\s+\S*$/, "") + "…";
    return s;
  }

  /* ---------- Espansione locale ---------- */
  function expandLocal(prompt, nScenes, styleKey, cameraPref) {
    var lang = detectLang(prompt);
    var beats = lang === "en" ? BEATS_EN : BEATS_IT;
    var keys = keywords(prompt);
    var subject = cleanSubject(prompt);
    var subjectLow = subject.charAt(0).toLowerCase() + subject.slice(1);
    var styleSuffix = STYLES[styleKey] || STYLES.cinematic;
    var kws = keys.slice(0, 6).join(", ");

    var order = [];
    for (var i = 0; i < nScenes; i++) {
      if (nScenes === 1) order.push(0);
      else order.push(Math.round((i * (beats.length - 1)) / (nScenes - 1)));
    }

    return order.map(function (b, i) {
      var beat = beats[b];
      var detail = keys.length ? pick(keys) : (lang === "en" ? "light" : "luce");
      var line = pick(beat.lines)
        .replace(/\{s_cap\}/g, cap(subject))
        .replace(/\{s\}/g, subjectLow)
        .replace(/\{d\}/g, detail);
      var shotEn = beat.shot;
      var imgPrompt = subject + ", " + shotEn.toLowerCase() +
        (kws ? ", " + kws : "") + ", " + styleSuffix;
      return {
        index: i,
        shot: beat.shot,
        move: cameraPref === "auto" ? beat.move : cameraPref,
        line: line,
        imagePrompt: imgPrompt,
        lang: lang
      };
    });
  }

  /* ---------- Miglioramento prompt locale ---------- */
  function enhanceLocal(prompt, styleKey) {
    var boosters = {
      cinematic: "ripreso in stile cinematografico con luce drammatica e profondità di campo",
      photoreal: "iper-fotorealistico, luce naturale, dettagli nitidissimi",
      nature: "natura incontaminata e maestosa, luce dorata dell'ora magica",
      scifi: "atmosfera fantascientifica, luci volumetriche, dettagli intricati",
      cyberpunk: "atmosfera cyberpunk notturna, neon e riflessi sulla pioggia",
      anime: "in splendido stile anime, colori vividi e fondali curatissimi",
      watercolor: "come un delicato acquerello sognante su carta",
      noir: "in bianco e nero stile film noir, forti contrasti e ombre lunghe"
    };
    var b = boosters[styleKey] || boosters.cinematic;
    var p = prompt.trim().replace(/[.!?]+$/, "");
    return cap(p) + ", " + b + ". La camera si muove lenta e fluida tra i dettagli più suggestivi.";
  }

  /* ---------- Gemini (facoltativo) ---------- */
  function geminiKey() {
    try { return (localStorage.getItem("agente_gemini_key") || "").trim(); } catch (e) { return ""; }
  }

  function geminiCall(promptText, key) {
    var url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + encodeURIComponent(key);
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 1200 }
      })
    }).then(function (r) {
      if (!r.ok) throw new Error("Gemini HTTP " + r.status);
      return r.json();
    }).then(function (j) {
      var t = (((j.candidates || [])[0] || {}).content || {}).parts || [];
      return t.map(function (p) { return p.text || ""; }).join("");
    });
  }

  function expandWithGemini(prompt, nScenes, styleKey, cameraPref) {
    var key = geminiKey();
    if (!key) return Promise.reject(new Error("no-key"));
    var lang = detectLang(prompt);
    var ask = "Sei un regista. Dato il soggetto video: \"" + prompt + "\", crea uno storyboard di ESATTAMENTE " + nScenes +
      " scene per un video breve. Rispondi SOLO con JSON valido, un array di " + nScenes +
      " oggetti con chiavi: shot (tipo inquadratura, breve), move (una tra: zoom-in, zoom-out, pan-left, pan-right, pan-up), " +
      "image (prompt in INGLESE per generare l'immagine della scena, stile " + styleKey + ", dettagliato), " +
      "line (battuta narrativa " + (lang === "en" ? "in INGLESE" : "in ITALIANO") + ", max 140 caratteri). Niente markdown, solo JSON.";
    return geminiCall(ask, key).then(function (txt) {
      var m = txt.match(/\[[\s\S]*\]/);
      if (!m) throw new Error("bad-json");
      var arr = JSON.parse(m[0]);
      if (!arr.length) throw new Error("empty");
      var styleSuffix = STYLES[styleKey] || STYLES.cinematic;
      return arr.slice(0, nScenes).map(function (s, i) {
        return {
          index: i,
          shot: String(s.shot || "Scena " + (i + 1)).slice(0, 40),
          move: cameraPref === "auto" ? (s.move || pick(["zoom-in", "pan-right", "pan-left", "zoom-out"])) : cameraPref,
          line: String(s.line || "").slice(0, 200),
          imagePrompt: String(s.image || prompt).slice(0, 400) + ", " + styleSuffix,
          lang: lang
        };
      });
    });
  }

  function enhanceWithGemini(prompt, styleKey) {
    var key = geminiKey();
    if (!key) return Promise.reject(new Error("no-key"));
    var ask = "Riscrivi e arricchisci questo prompt per un generatore video AI stile cinema (stile " + styleKey +
      "), aggiungendo dettagli visivi, luce, atmosfera e movimento di camera. Max 400 caratteri. Rispondi solo col prompt riscritto, nella stessa lingua dell'originale. Prompt: \"" + prompt + "\"";
    return geminiCall(ask, key).then(function (t) { return t.trim().replace(/^["']|["']$/g, ""); });
  }

  /* ---------- Prompt di esempio ---------- */
  var EXAMPLES = [
    { icon: "🌅", title: "Coste al tramonto", text: "Un drone sorvola le scogliere della Sardegna al tramonto, il mare turchese si infrange sulle rocce mentre un gabbiano attraversa il cielo arancione" },
    { icon: "🌃", title: "Tokyo cyberpunk", text: "Strade di Tokyo di notte sotto la pioggia, insegne al neon che si riflettono sull'asfalto, un samurai solitario con ombrello luminoso cammina tra la folla" },
    { icon: "🚀", title: "Missione su Marte", text: "Un astronauta cammina tra le dune rosse di Marte mentre due lune sorgono all'orizzonte, la tuta scintilla sotto una tempesta di sabbia dorata" },
    { icon: "🏰", title: "Castello nella nebbia", text: "Un antico castello medievale emerge dalla nebbia all'alba, corvi volano tra le torri mentre la luce dorata filtra tra gli alberi della foresta" },
    { icon: "🦁", title: "Savana africana", text: "Un leone maestoso attraversa la savana africana al tramonto, branchi di elefanti all'orizzonte e un cielo infuocato pieno di nuvole drammatiche" },
    { icon: "🍜", title: "Ramen a Osaka", text: "Una piccola bottega di ramen a Osaka di notte, il vapore sale dalle ciotole fumanti mentre il cuoco sorride sotto una fila di lanterne rosse" }
  ];

  var SURPRISES = EXAMPLES.map(function (e) { return e.text; }).concat([
    "Una balena gigantesca nuota tra le nuvole sopra una città addormentata, mentre le stelle cadono come neve luminosa",
    "Un faro solitario su una scogliera durante una tempesta, onde enormi e fulmini che squarciano il cielo viola",
    "Un mercato galleggiante in Thailandia all'alba, barche colorate piene di frutta e fiori nella foschia dorata",
    "Un treno a vapore attraversa un ponte di pietra tra le montagne innevate, il fumo bianco si alza nel cielo blu"
  ]);

  window.AgenteScript = {
    STYLES: STYLES,
    EXAMPLES: EXAMPLES,
    SURPRISES: SURPRISES,
    expandLocal: expandLocal,
    enhanceLocal: enhanceLocal,
    expandWithGemini: expandWithGemini,
    enhanceWithGemini: enhanceWithGemini,
    hasGeminiKey: function () { return !!geminiKey(); }
  };
})();
