/**
 * Matrix-inspired dark electronic music engine (Web Audio API)
 *
 * Dark minor-key pads, heavy sub-bass, industrial percussion,
 * glitchy hi-hats, and tension drones.
 */

const BPM = 140
const BEAT = 60 / BPM

// A minor pentatonic root notes (Hz)
const BASS_NOTES = [55, 55, 65.41, 55, 73.42, 65.41, 55, 49] // Am / Cm / Dm patterns
const PAD_CHORDS = [
  [220, 261.6, 329.6],   // Am
  [196, 246.9, 293.7],   // G5
  [174.6, 220, 261.6],   // F
  [196, 233.1, 293.7],   // Gm
]

export class SnakeMusic {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private playing = false
  private nextBeat = 0
  private beat = 0
  private scheduler: number | null = null
  private bassIdx = 0
  private droneOsc: OscillatorNode | null = null
  private droneGain: GainNode | null = null

  start() {
    this.ctx = new AudioContext()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.45
    this.master.connect(this.ctx.destination)
    if (this.ctx.state === 'suspended') this.ctx.resume()

    this.startDrone()
    this.playing = true
    this.beat = 0
    this.bassIdx = 0
    this.nextBeat = this.ctx.currentTime + 0.05
    this.schedule()
  }

  stop() {
    this.playing = false
    if (this.scheduler) clearTimeout(this.scheduler)
    if (this.droneOsc) {
      try { this.droneOsc.stop() } catch { /* already stopped */ }
    }
    if (this.ctx) {
      this.ctx.close()
      this.ctx = null
    }
  }

  /** Low frequency drone — the Matrix "hum" */
  private startDrone() {
    if (!this.ctx || !this.master) return
    this.droneOsc = this.ctx.createOscillator()
    this.droneGain = this.ctx.createGain()
    const filter = this.ctx.createBiquadFilter()

    this.droneOsc.type = 'sawtooth'
    this.droneOsc.frequency.value = 55 // A1
    filter.type = 'lowpass'
    filter.frequency.value = 120
    filter.Q.value = 8
    this.droneGain.gain.value = 0.12

    this.droneOsc.connect(filter)
    filter.connect(this.droneGain)
    this.droneGain.connect(this.master)
    this.droneOsc.start()
  }

  private schedule() {
    if (!this.playing || !this.ctx) return
    while (this.nextBeat < this.ctx.currentTime + 0.12) {
      this.playBeat(this.nextBeat, this.beat)
      this.nextBeat += BEAT
      this.beat++
    }
    this.scheduler = window.setTimeout(() => this.schedule(), 20)
  }

  private playBeat(t: number, beat: number) {
    const bar = beat % 4

    // ── Kick: beats 0, 2 with sub-frequency sweep ──
    if (bar === 0 || bar === 2) this.kick(t)

    // ── Snare: beats 1, 3 — metallic industrial ──
    if (bar === 1 || bar === 3) this.snare(t)

    // ── Hi-hat: every beat + offbeats ──
    this.hihat(t, 0.05)
    this.hihat(t + BEAT * 0.5, 0.025)
    // Ghost 16th note hats on some beats
    if (beat % 8 >= 4) {
      this.hihat(t + BEAT * 0.25, 0.015)
      this.hihat(t + BEAT * 0.75, 0.015)
    }

    // ── Bass: every 2 beats ──
    if (bar === 0 || bar === 2) this.bass(t)

    // ── Dark pad chord: every 4 beats (each bar) ──
    if (bar === 0) this.pad(t, beat)

    // ── Glitch stab: occasional ──
    if (beat % 16 === 7 || beat % 16 === 15) this.glitch(t)

    // ── Tension riser every 32 beats ──
    if (beat % 32 === 0 && beat > 0) this.riser(t)
  }

  private kick(t: number) {
    if (!this.ctx || !this.master) return
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(160, t)
    osc.frequency.exponentialRampToValueAtTime(35, t + 0.15)
    g.gain.setValueAtTime(0.7, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
    osc.connect(g)
    g.connect(this.master)
    osc.start(t)
    osc.stop(t + 0.35)

    // Click transient
    const click = this.ctx.createOscillator()
    const cg = this.ctx.createGain()
    click.type = 'square'
    click.frequency.value = 800
    cg.gain.setValueAtTime(0.08, t)
    cg.gain.exponentialRampToValueAtTime(0.001, t + 0.015)
    click.connect(cg)
    cg.connect(this.master)
    click.start(t)
    click.stop(t + 0.015)
  }

  private snare(t: number) {
    if (!this.ctx || !this.master) return
    // Noise
    const len = this.ctx.sampleRate * 0.12
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1)
    const noise = this.ctx.createBufferSource()
    noise.buffer = buf
    const ng = this.ctx.createGain()
    ng.gain.setValueAtTime(0.22, t)
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
    const hp = this.ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 3000
    const bp = this.ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 5000
    bp.Q.value = 0.8
    noise.connect(hp)
    hp.connect(bp)
    bp.connect(ng)
    ng.connect(this.master)
    noise.start(t)
    noise.stop(t + 0.12)

    // Body tone
    const osc = this.ctx.createOscillator()
    const og = this.ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = 180
    og.gain.setValueAtTime(0.12, t)
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.06)
    osc.connect(og)
    og.connect(this.master)
    osc.start(t)
    osc.stop(t + 0.06)
  }

  private hihat(t: number, vol: number) {
    if (!this.ctx || !this.master) return
    const len = this.ctx.sampleRate * 0.03
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1)
    const noise = this.ctx.createBufferSource()
    noise.buffer = buf
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.03)
    const hp = this.ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 9000
    noise.connect(hp)
    hp.connect(g)
    g.connect(this.master)
    noise.start(t)
    noise.stop(t + 0.03)
  }

  private bass(t: number) {
    if (!this.ctx || !this.master) return
    const freq = BASS_NOTES[this.bassIdx % BASS_NOTES.length]
    this.bassIdx++

    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    const lp = this.ctx.createBiquadFilter()
    osc.type = 'sawtooth'
    osc.frequency.value = freq
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(400, t)
    lp.frequency.exponentialRampToValueAtTime(150, t + BEAT * 1.5)
    lp.Q.value = 6
    g.gain.setValueAtTime(0.2, t)
    g.gain.setValueAtTime(0.2, t + BEAT * 0.8)
    g.gain.exponentialRampToValueAtTime(0.001, t + BEAT * 1.8)
    osc.connect(lp)
    lp.connect(g)
    g.connect(this.master)
    osc.start(t)
    osc.stop(t + BEAT * 1.8)
  }

  private pad(t: number, beat: number) {
    if (!this.ctx || !this.master) return
    const chord = PAD_CHORDS[Math.floor(beat / 4) % PAD_CHORDS.length]
    for (const freq of chord) {
      const osc = this.ctx.createOscillator()
      const g = this.ctx.createGain()
      const lp = this.ctx.createBiquadFilter()
      osc.type = 'sawtooth'
      osc.frequency.value = freq
      // Detune slightly for width
      osc.detune.value = (Math.random() - 0.5) * 12
      lp.type = 'lowpass'
      lp.frequency.value = 800
      lp.Q.value = 1
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.03, t + BEAT * 0.5)
      g.gain.setValueAtTime(0.03, t + BEAT * 3)
      g.gain.exponentialRampToValueAtTime(0.001, t + BEAT * 4)
      osc.connect(lp)
      lp.connect(g)
      g.connect(this.master)
      osc.start(t)
      osc.stop(t + BEAT * 4)
    }
  }

  /** Digital glitch stab */
  private glitch(t: number) {
    if (!this.ctx || !this.master) return
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(440, t)
    osc.frequency.setValueAtTime(880, t + 0.03)
    osc.frequency.setValueAtTime(330, t + 0.06)
    g.gain.setValueAtTime(0.06, t)
    g.gain.setValueAtTime(0, t + 0.02)
    g.gain.setValueAtTime(0.06, t + 0.03)
    g.gain.setValueAtTime(0, t + 0.05)
    g.gain.setValueAtTime(0.04, t + 0.06)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09)
    osc.connect(g)
    g.connect(this.master)
    osc.start(t)
    osc.stop(t + 0.09)
  }

  /** Tension riser — sweeping noise ─ */
  private riser(t: number) {
    if (!this.ctx || !this.master) return
    const dur = BEAT * 4
    const len = this.ctx.sampleRate * dur
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1)
    const noise = this.ctx.createBufferSource()
    noise.buffer = buf
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.08, t + dur * 0.8)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    const bp = this.ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(500, t)
    bp.frequency.exponentialRampToValueAtTime(6000, t + dur * 0.9)
    bp.Q.value = 3
    noise.connect(bp)
    bp.connect(g)
    g.connect(this.master)
    noise.start(t)
    noise.stop(t + dur)
  }

  // ── Sound effects ──

  playEat() {
    if (!this.ctx || !this.master) return
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(600, this.ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.08)
    g.gain.setValueAtTime(0.12, this.ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15)
    osc.connect(g)
    g.connect(this.master)
    osc.start()
    osc.stop(this.ctx.currentTime + 0.15)
  }

  playDeath() {
    if (!this.ctx || !this.master) return
    const t = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(300, t)
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.6)
    g.gain.setValueAtTime(0.15, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6)
    const lp = this.ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(2000, t)
    lp.frequency.exponentialRampToValueAtTime(100, t + 0.5)
    osc.connect(lp)
    lp.connect(g)
    g.connect(this.master)
    osc.start(t)
    osc.stop(t + 0.6)

    // Noise burst
    const len = this.ctx.sampleRate * 0.3
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1)
    const noise = this.ctx.createBufferSource()
    noise.buffer = buf
    const ng = this.ctx.createGain()
    ng.gain.setValueAtTime(0.08, t)
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
    noise.connect(ng)
    ng.connect(this.master)
    noise.start(t)
    noise.stop(t + 0.3)
  }

  playGameOver() {
    if (!this.ctx || !this.master) return
    // Stop the beat
    this.playing = false
    if (this.scheduler) clearTimeout(this.scheduler)
    if (this.droneOsc) {
      this.droneGain?.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1)
    }

    const t = this.ctx.currentTime
    // Descending minor arpeggio
    const notes = [440, 392, 329.6, 261.6, 220]
    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator()
      const g = this.ctx!.createGain()
      osc.type = 'triangle'
      osc.frequency.value = freq
      g.gain.setValueAtTime(0, t + i * 0.15)
      g.gain.linearRampToValueAtTime(0.08, t + i * 0.15 + 0.05)
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.15 + 0.5)
      osc.connect(g)
      g.connect(this.master!)
      osc.start(t + i * 0.15)
      osc.stop(t + i * 0.15 + 0.5)
    })
  }

  playFreeze() {
    if (!this.ctx || !this.master) return
    const t = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(1200, t)
    osc.frequency.exponentialRampToValueAtTime(2400, t + 0.1)
    osc.frequency.exponentialRampToValueAtTime(1800, t + 0.2)
    g.gain.setValueAtTime(0.1, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
    osc.connect(g)
    g.connect(this.master)
    osc.start(t)
    osc.stop(t + 0.3)
  }
}
