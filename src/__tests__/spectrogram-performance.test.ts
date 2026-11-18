import SpectrogramPlugin from '../plugins/spectrogram.js'
import { __getFFTCacheStatsForTests, __resetFFTCacheForTests, computeFrequencies } from '../spectrogram-frequencies.js'
import { efficientResample } from '../spectrogram-render-utils.js'
import { createFakeAudioBuffer } from './helpers/audio-buffer.js'
import { createFakeWaveSurfer } from './helpers/fake-wavesurfer.js'

const SAMPLE_RATE = 44_100
const PODCAST_SECONDS = 30

function makePodcastSignal(seconds: number, sampleRate = SAMPLE_RATE): Float32Array {
  const samples = new Float32Array(Math.round(seconds * sampleRate))
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate
    samples[i] =
      0.3 * Math.sin(2 * Math.PI * 180 * t) +
      0.15 * Math.sin(2 * Math.PI * 1200 * t) +
      0.05 * Math.sin(2 * Math.PI * 4200 * t)
  }
  return samples
}

function elapsedMs(run: () => void): number {
  const start = performance.now()
  run()
  return performance.now() - start
}

describe('spectrogram STFT performance', () => {
  it('processes 30 seconds of podcast audio within a watchable budget', () => {
    const signal = makePodcastSignal(PODCAST_SECONDS)
    const params = {
      fftSamples: 1024,
      noverlap: 512,
      scale: 'mel' as const,
      gainDB: 20,
      rangeDB: 80,
      sampleRate: SAMPLE_RATE,
    }

    // Warm up the shared FFT cache/JIT so the measurement reflects steady-state rendering.
    computeFrequencies([signal.subarray(0, SAMPLE_RATE * 2)], params)

    let frames = 0
    const elapsed = elapsedMs(() => {
      frames = computeFrequencies([signal], params)[0].length
    })

    expect(frames).toBeGreaterThan(2500)
    // Typical local runs are well under 100 ms. The deliberately generous ceiling catches an
    // accidental return to per-pixel FFTs or another order-of-magnitude regression without
    // failing on a slow, coverage-instrumented CI worker.
    expect(elapsed).toBeLessThan(2000)
  })

  it('downsamples a full-resolution column grid to a viewport within budget', () => {
    const frames = Array.from({ length: 5000 }, (_, frame) =>
      Uint8Array.from({ length: 512 }, (_, bin) => (frame + bin) % 256),
    )

    // Warm up the allocation-heavy path as well.
    efficientResample([frames.slice(0, 100)], 100)

    let columns = 0
    const elapsed = elapsedMs(() => {
      columns = efficientResample([frames], 1200)[0].length
    })

    expect(columns).toBe(1200)
    expect(elapsed).toBeLessThan(500)
  })
})

describe('spectrogram zoom redraw performance', () => {
  it('reuses the cached whole-buffer analysis and FFT instance across redraws', async () => {
    const signal = makePodcastSignal(8, 8000)
    const buffer = createFakeAudioBuffer(signal, { sampleRate: 8000 })
    const plugin: any = SpectrogramPlugin.create({
      fftSamples: 1024,
      noverlap: 512,
      scale: 'mel',
    })
    plugin._init(createFakeWaveSurfer({ getDecodedData: () => buffer }))

    try {
      __resetFFTCacheForTests()
      const first = await plugin.getFrequenciesData()
      const constructions = __getFFTCacheStatsForTests().constructions

      let second: Uint8Array[][] | null = null
      const elapsed = await new Promise<number>((resolve) => {
        const start = performance.now()
        void plugin.getFrequenciesData().then((data: Uint8Array[][] | null) => {
          second = data
          resolve(performance.now() - start)
        })
      })

      expect(second).toBe(first)
      expect(__getFFTCacheStatsForTests().constructions).toBe(constructions)
      expect(elapsed).toBeLessThan(100)
    } finally {
      plugin.destroy()
    }
  })
})
