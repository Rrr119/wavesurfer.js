import SpectrogramPlugin from '../plugins/spectrogram.js'
import { createFakeAudioBuffer } from './helpers/audio-buffer.js'
import { createFakeWaveSurfer } from './helpers/fake-wavesurfer.js'

function makeFrames(): Uint8Array[][] {
  return [Array.from({ length: 8 }, (_, frame) => Uint8Array.from({ length: 8 }, (_, bin) => (frame * 8 + bin) % 256))]
}

describe('full-mode lazy canvas rendering', () => {
  const originalImageData = (globalThis as any).ImageData
  const originalCreateImageBitmap = (globalThis as any).createImageBitmap
  let getContextSpy: jest.SpyInstance

  beforeEach(() => {
    getContextSpy = jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillStyle: '',
      fillRect: jest.fn(),
      drawImage: jest.fn(),
      scale: jest.fn(),
    } as any)
    ;(globalThis as any).ImageData = class {
      data: Uint8ClampedArray
      constructor(
        public width: number,
        public height: number,
      ) {
        this.data = new Uint8ClampedArray(width * height * 4)
      }
    }
    ;(globalThis as any).createImageBitmap = jest.fn(() => Promise.resolve({ close: jest.fn() }))
  })

  afterEach(() => {
    getContextSpy.mockRestore()
    ;(globalThis as any).ImageData = originalImageData
    ;(globalThis as any).createImageBitmap = originalCreateImageBitmap
  })

  it('draws newly visible canvases on the scroll container, whose scroll events do not bubble', async () => {
    const scrollContainer = document.createElement('div')
    const wrapper = document.createElement('div')
    scrollContainer.appendChild(wrapper)
    document.body.appendChild(scrollContainer)
    Object.defineProperty(wrapper, 'offsetWidth', { value: 120_000, configurable: true })
    Object.defineProperty(wrapper, 'clientWidth', { value: 600, configurable: true })
    Object.defineProperty(scrollContainer, 'clientWidth', { value: 600, configurable: true })
    const addScrollListener = jest.spyOn(scrollContainer, 'addEventListener')

    const plugin: any = SpectrogramPlugin.create({ maxCanvasWidth: 30_000, scale: 'linear' })
    plugin._init(
      createFakeWaveSurfer({
        getWrapper: () => wrapper,
        getDecodedData: () => createFakeAudioBuffer(new Float32Array(8000)),
      }),
    )
    const internals = plugin.__spectrogramInternalsForTests()
    internals.buffer = createFakeAudioBuffer(new Float32Array(8000))

    internals.drawSpectrogram(makeFrames())

    // The viewport starts at 0, so only the canvases around the first 900 px are drawn.
    expect(internals.drawnCanvases[0]).toBe(true)
    expect(internals.drawnCanvases[3]).toBeUndefined()
    expect(addScrollListener).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true })

    scrollContainer.scrollLeft = 100_000
    scrollContainer.dispatchEvent(new Event('scroll'))
    await new Promise((resolve) => setTimeout(resolve, 30))

    // The old listener was attached to `wrapper`, which never emits a scroll event.
    expect(internals.drawnCanvases[3]).toBe(true)

    plugin.destroy()
    scrollContainer.remove()
  })
})
