# 🎬 Agente Video — Generatore di video AI stile Veo 3

Descrivi una scena a parole e ottieni un **vero file video** cinematografico:
sceneggiatura, immagini AI, movimenti di camera, sottotitoli e colonna sonora —
tutto **gratis e direttamente nel browser**, senza code né account.

Ispirato a **Google Veo 3 / Flow**.

## ✨ Funzionalità

- 📝 **Prompt in italiano** → storyboard automatico (inquadrature, narrazione, camera)
- 🤖 **Immagini AI gratuite** (Pollinations/FLUX) con fallback automatici (foto → arte procedurale offline)
- 🎥 **Regia procedurale**: effetto Ken Burns, dissolvenze, grana film, letterbox, vignettatura
- 🎼 **Colonna sonora generativa** sintetizzata in tempo reale (Web Audio): epica, chill, tense, allegra
- 💬 **Sottotitoli** nel video + download `.srt`
- 🔊 Anteprima **voce fuori campo** (sintesi vocale del browser)
- ⏺️ **Export in `.webm`** (canvas + audio registrati in tempo reale) + download
- 🧠 **Integrazione Gemini opzionale**: con chiave gratuita, sceneggiatura e prompt-enhancer diventano AI
- 📱 Formati **16:9, 9:16, 1:1** · durate **8/12/16/30 s** · 8 stili visivi
- 🕘 Cronologia locale delle creazioni (con anteprime)

## 🚀 Avvio

Nessuna dipendenza, nessun build. Serve solo un browser moderno (Chrome/Edge consigliati).

```bash
# dalla cartella del progetto
python3 -m http.server 8000
# poi apri http://localhost:8000
```

Oppure apri direttamente `index.html` (doppio clic): funziona anche da file.

## 🎬 Video dimostrativo

`demo/agente-video-faro-30s.mp4` — corto da 30s ("Il faro nella tempesta") generato con lo script da riga di comando: 7 scene, Ken Burns, pioggia, fulmini, sottotitoli e colonna sonora sintetizzata.

## 🖥️ Generatore da riga di comando (senza browser)

Lo script `tools/genera_video.py` crea un MP4 con la stessa regia dell'app, usando arte procedurale (niente API esterne):

```bash
python3 -m venv .venv && .venv/bin/pip install pillow numpy imageio-ffmpeg
.venv/bin/python tools/genera_video.py --out demo/mio-video.mp4 --dur 30 --seed 42
```

## 🧠 Come funziona

1. **Sceneggiatura** — il prompt viene diviso in scene con shot, movimento camera e battuta narrativa
   (motore locale a template, oppure Gemini 2.0 Flash se fornisci una API key gratuita).
2. **Immagini** — ogni scena genera un'immagine cinematografica via provider gratuiti dal browser.
3. **Montaggio** — un motore canvas anima le immagini (zoom/pan), aggiunge dissolvenze,
   sottotitoli, grana e letterbox come una vera timeline.
4. **Musica + export** — Web Audio sintetizza la colonna sonora; `MediaRecorder` registra
   canvas + audio in un file `.webm` scaricabile.

## 🔑 Chiave Gemini (facoltativa)

1. Crea una chiave gratuita su <https://aistudio.google.com/apikey>
2. Premi **🔑 API Key** nell'app e incollala

La chiave resta nel `localStorage` del tuo browser: nessun server la vede (non esistono server).

## 🎯 Differenze rispetto a Veo 3

Veo 3 genera ogni pixel in movimento con un modello di diffusione video (moto fisico reale:
persone che camminano, acqua che scorre). **Agente Video** anima immagini AI con regia
procedurale: è istantaneo e gratuito, ma non crea vero moto fisico. È il miglior compromesso
possibile al 100% nel browser senza GPU né API a pagamento.

## 📁 Struttura

```
├── index.html      # UI
├── css/style.css   # tema dark cinematografico
└── js/
    ├── script.js    # prompt → sceneggiatura (+ Gemini opzionale)
    ├── providers.js # immagini AI con catena di fallback
    ├── audio.js     # colonna sonora generativa (Web Audio)
    ├── engine.js    # renderer canvas + export MediaRecorder
    └── app.js       # orchestrazione UI
```

## 🗺️ Roadmap

- [ ] Voce fuori campo inclusa nell'export (TTS registrabile)
- [ ] Più voci/musiche e controllo volume
- [ ] Transizioni extra (wipe, zoom-cut) e titoli di testa/coda
- [ ] Export MP4 (WebCodecs) oltre a WebM
- [ ] Backend opzionale con code e modelli video reali
