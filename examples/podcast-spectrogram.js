// Podcast editor: waveform + STFT spectrogram with zoom and a playhead

import WaveSurfer from 'wavesurfer.js'
import Spectrogram from 'wavesurfer.js/dist/plugins/spectrogram.esm.js'
import Timeline from 'wavesurfer.js/dist/plugins/timeline.esm.js'
import Zoom from 'wavesurfer.js/dist/plugins/zoom.esm.js'

const ws = WaveSurfer.create({
  container: '#waveform',
  url: '/examples/audio/librivox.mp3',
  height: 96,
  waveColor: '#8f9bb3',
  progressColor: '#d8dee9',
  cursorColor: '#ff5c5c',
  cursorWidth: 2,
  minPxPerSec: 140,
  autoScroll: true,
  autoCenter: true,
  fillParent: true,
})

// Windowed rendering keeps a long podcast's memory bounded: only the visible time range
// plus a small prefetch buffer is analyzed, and off-screen segments are evicted.
ws.registerPlugin(
  Spectrogram.create({
    rendering: 'windowed',
    progressiveLoading: true,
    height: 180,
    labels: true,
    labelsBackground: 'rgba(20, 24, 32, 0.85)',
    labelsColor: '#e5e9f0',
    labelsHzColor: '#9aa5b8',
    splitChannels: false,
    scale: 'mel',
    frequencyMin: 60,
    frequencyMax: 12000,
    fftSamples: 1024,
    windowFunc: 'hann',
    colorMap: 'roseus',
    gainDB: 18,
    rangeDB: 80,
    preEmphasis: 6,
    dynamicCompression: 0.35,
    useWebWorker: true,
  }),
)

ws.registerPlugin(
  Timeline.create({
    height: 22,
    insertPosition: 'beforebegin',
  }),
)

ws.registerPlugin(
  Zoom.create({
    scale: 0.6,
    maxZoom: 2000,
  }),
)

const playButton = document.querySelector('#play')
const timeLabel = document.querySelector('#time')
const zoomLabel = document.querySelector('#zoom')

const formatTime = (seconds) => {
  const minutes = Math.floor(seconds / 60)
  const rest = Math.floor(seconds % 60)
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

playButton.addEventListener('click', () => {
  ws.playPause()
})

ws.on('play', () => {
  playButton.textContent = 'Pause'
})

ws.on('pause', () => {
  playButton.textContent = 'Play'
})

// The spectrogram shares the waveform's cursor layer, so this playhead update is already
// synchronized with every rendered frequency column, including while scrolling at high zoom.
ws.on('timeupdate', (currentTime) => {
  timeLabel.textContent = `${formatTime(currentTime)} / ${formatTime(ws.getDuration())}`
})

ws.on('zoom', (minPxPerSec) => {
  zoomLabel.textContent = `${Math.round(minPxPerSec)} px/s`
})

/*
<html>
  <style>
    #waveform {
      margin-top: 1rem;
    }
    #waveform ::part(cursor):before {
      content: '';
      position: absolute;
      top: 0;
      left: -5px;
      width: 0;
      height: 0;
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-top: 8px solid #ff5c5c;
    }
    .toolbar {
      display: flex;
      align-items: center;
      gap: 1rem;
      font-variant-numeric: tabular-nums;
    }
    .toolbar button {
      min-width: 5rem;
    }
    .muted {
      color: #777;
    }
  </style>

  <div class="toolbar">
    <button id="play">Play</button>
    <span id="time">0:00 / 0:00</span>
    <span id="zoom" class="muted">140 px/s</span>
  </div>

  <div id="waveform"></div>

  <p class="muted">
    Scroll the waveform to pan, use the mouse wheel to zoom, and press Play to follow the
    playhead across the spectrogram. The windowed renderer computes STFT data only for the
    visible range, so long podcast episodes remain responsive.
  </p>
</html>
*/
