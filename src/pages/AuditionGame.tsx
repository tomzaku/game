import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import './AuditionGame.css'

// ─── Types ───────────────────────────────────────────────────────────
type Direction = 'left' | 'up' | 'down' | 'right'
type HitGrade = 'perfect' | 'great' | 'good' | 'miss'
type Difficulty = 'easy' | 'normal' | 'hard'
type GameScreen = 'setup' | 'countdown' | 'playing' | 'results'
type RoundPhase = 'show' | 'input' | 'timing' | 'score'

interface PlayerRound {
  inputSequence: Direction[]
  correctCount: number
  timingGrade: HitGrade | null
  timingScore: number
  arrowScore: number
  totalScore: number
  pressed: boolean // did they press space for timing
}

interface PlayerState {
  name: string
  totalScore: number
  combo: number
  maxCombo: number
  roundData: PlayerRound
  hitCounts: Record<HitGrade, number>
}

// ─── Constants ───────────────────────────────────────────────────────
const PLAYER_COLORS = ['#00f0ff', '#ff00aa', '#aaff00', '#ff8800']
const PLAYER_COLORS_RGB = ['0,240,255', '255,0,170', '170,255,0', '255,136,0']

const DIRECTION_ARROWS: Record<Direction, string> = {
  left: '←', up: '↑', down: '↓', right: '→',
}
const DIRECTIONS: Direction[] = ['left', 'up', 'down', 'right']
const NOTE_COLORS: Record<Direction, string> = {
  left: '#00f0ff', up: '#ff00aa', down: '#aaff00', right: '#ff8800',
}

const KEY_MAPS: Record<Direction, string>[] = [
  { left: 'ArrowLeft', up: 'ArrowUp', down: 'ArrowDown', right: 'ArrowRight' },
  { left: 'KeyA', up: 'KeyW', down: 'KeyS', right: 'KeyD' },
  { left: 'KeyJ', up: 'KeyI', down: 'KeyK', right: 'KeyL' },
  { left: 'Numpad4', up: 'Numpad8', down: 'Numpad5', right: 'Numpad6' },
]

const ACTION_KEYS = ['Space', 'KeyE', 'KeyU', 'Numpad0']
const KEY_LABELS = [
  { arrows: '← ↑ ↓ →', action: 'Space' },
  { arrows: 'A W S D', action: 'E' },
  { arrows: 'J I K L', action: 'U' },
  { arrows: '4 8 5 6 (Num)', action: '0 (Num)' },
]

const GRADE_COLORS: Record<HitGrade, string> = {
  perfect: '#00f0ff', great: '#aaff00', good: '#ff8800', miss: '#ff2255',
}
const GRADE_LABELS: Record<HitGrade, string> = {
  perfect: 'PERFECT', great: 'GREAT', good: 'GOOD', miss: 'MISS',
}

const DIFFICULTY_CONFIG: Record<Difficulty, {
  bpm: number
  startArrows: number
  maxArrows: number
  rounds: number
  timingSpeed: number // needle cycles per second
}> = {
  easy:   { bpm: 110, startArrows: 3, maxArrows: 6,  rounds: 8,  timingSpeed: 0.8 },
  normal: { bpm: 130, startArrows: 4, maxArrows: 8,  rounds: 10, timingSpeed: 1.2 },
  hard:   { bpm: 160, startArrows: 5, maxArrows: 10, rounds: 12, timingSpeed: 1.8 },
}

// Timing bar zones (0-1 range, center = 0.5)
const TIMING_PERFECT = 0.06 // ±6% from center
const TIMING_GREAT = 0.12
const TIMING_GOOD = 0.20

// ─── Music Engine (Web Audio API) ────────────────────────────────────
class MusicEngine {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private beatInterval = 0
  private nextBeatTime = 0
  private schedulerTimer: number | null = null
  private currentBeat = 0
  private playing = false

  // Bass note pattern (semitone offsets from A2=110Hz)
  private bassPattern = [0, 0, 5, 5, 7, 7, 5, 3]
  private bassIndex = 0

  init(bpm: number) {
    this.ctx = new AudioContext()
    this.masterGain = this.ctx.createGain()
    this.masterGain.gain.value = 0.5
    this.masterGain.connect(this.ctx.destination)
    this.beatInterval = 60 / bpm
  }

  start() {
    if (!this.ctx || !this.masterGain) return
    if (this.ctx.state === 'suspended') this.ctx.resume()
    this.playing = true
    this.currentBeat = 0
    this.bassIndex = 0
    this.nextBeatTime = this.ctx.currentTime + 0.1
    this.schedule()
  }

  stop() {
    this.playing = false
    if (this.schedulerTimer) {
      clearTimeout(this.schedulerTimer)
      this.schedulerTimer = null
    }
    if (this.ctx) {
      this.ctx.close()
      this.ctx = null
    }
  }

  setVolume(v: number) {
    if (this.masterGain) this.masterGain.gain.value = v
  }

  playHitSound(grade: HitGrade) {
    if (!this.ctx || !this.masterGain) return
    const freq = grade === 'perfect' ? 880 : grade === 'great' ? 660 : grade === 'good' ? 440 : 220
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15)
    osc.connect(gain)
    gain.connect(this.masterGain!)
    osc.start()
    osc.stop(this.ctx.currentTime + 0.15)
  }

  private schedule() {
    if (!this.playing || !this.ctx) return
    while (this.nextBeatTime < this.ctx.currentTime + 0.1) {
      this.playBeat(this.nextBeatTime, this.currentBeat)
      this.nextBeatTime += this.beatInterval
      this.currentBeat++
    }
    this.schedulerTimer = window.setTimeout(() => this.schedule(), 25)
  }

  private playBeat(time: number, beat: number) {
    if (!this.ctx || !this.masterGain) return
    const beatInBar = beat % 4

    // Kick on 1, 3
    if (beatInBar === 0 || beatInBar === 2) {
      this.playKick(time)
    }
    // Snare on 2, 4
    if (beatInBar === 1 || beatInBar === 3) {
      this.playSnare(time)
    }
    // Hi-hat on every beat
    this.playHiHat(time)
    // Hi-hat offbeat
    this.playHiHat(time + this.beatInterval / 2, 0.03)

    // Bass on every beat
    if (beatInBar === 0 || beatInBar === 2) {
      this.playBass(time)
    }

    // Synth chord every 4 beats
    if (beatInBar === 0) {
      this.playSynthChord(time)
    }
  }

  private playKick(time: number) {
    if (!this.ctx || !this.masterGain) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(150, time)
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.12)
    gain.gain.setValueAtTime(0.6, time)
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3)
    osc.connect(gain)
    gain.connect(this.masterGain!)
    osc.start(time)
    osc.stop(time + 0.3)
  }

  private playSnare(time: number) {
    if (!this.ctx || !this.masterGain) return
    // Noise burst
    const bufferSize = this.ctx.sampleRate * 0.1
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.5
    }
    const noise = this.ctx.createBufferSource()
    noise.buffer = buffer
    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(0.25, time)
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1)
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = 2000
    noise.connect(filter)
    filter.connect(gain)
    gain.connect(this.masterGain!)
    noise.start(time)
    noise.stop(time + 0.1)

    // Tonal body
    const osc = this.ctx.createOscillator()
    const oscGain = this.ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = 200
    oscGain.gain.setValueAtTime(0.15, time)
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.06)
    osc.connect(oscGain)
    oscGain.connect(this.masterGain!)
    osc.start(time)
    osc.stop(time + 0.06)
  }

  private playHiHat(time: number, vol = 0.06) {
    if (!this.ctx || !this.masterGain) return
    const bufferSize = this.ctx.sampleRate * 0.04
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1)
    }
    const noise = this.ctx.createBufferSource()
    noise.buffer = buffer
    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(vol, time)
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04)
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = 8000
    noise.connect(filter)
    filter.connect(gain)
    gain.connect(this.masterGain!)
    noise.start(time)
    noise.stop(time + 0.04)
  }

  private playBass(time: number) {
    if (!this.ctx || !this.masterGain) return
    const semitone = this.bassPattern[this.bassIndex % this.bassPattern.length]
    this.bassIndex++
    const freq = 110 * Math.pow(2, semitone / 12)
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.value = freq
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 300
    filter.Q.value = 5
    gain.gain.setValueAtTime(0.2, time)
    gain.gain.exponentialRampToValueAtTime(0.001, time + this.beatInterval * 1.5)
    osc.connect(filter)
    filter.connect(gain)
    gain.connect(this.masterGain!)
    osc.start(time)
    osc.stop(time + this.beatInterval * 1.5)
  }

  private playSynthChord(time: number) {
    if (!this.ctx || !this.masterGain) return
    const chords = [
      [261.6, 329.6, 392.0], // C major
      [220.0, 277.2, 329.6], // A minor
      [293.7, 370.0, 440.0], // D minor
      [246.9, 311.1, 370.0], // B minor
    ]
    const chord = chords[Math.floor(this.currentBeat / 4) % chords.length]
    for (const freq of chord) {
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.04, time)
      gain.gain.setValueAtTime(0.04, time + this.beatInterval * 3)
      gain.gain.exponentialRampToValueAtTime(0.001, time + this.beatInterval * 4)
      osc.connect(gain)
      gain.connect(this.masterGain!)
      osc.start(time)
      osc.stop(time + this.beatInterval * 4)
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────
function generateSequence(length: number): Direction[] {
  const seq: Direction[] = []
  for (let i = 0; i < length; i++) {
    seq.push(DIRECTIONS[Math.floor(Math.random() * 4)])
  }
  return seq
}

function getTimingGrade(position: number): HitGrade {
  const dist = Math.abs(position - 0.5)
  if (dist <= TIMING_PERFECT) return 'perfect'
  if (dist <= TIMING_GREAT) return 'great'
  if (dist <= TIMING_GOOD) return 'good'
  return 'miss'
}

function emptyRound(): PlayerRound {
  return {
    inputSequence: [],
    correctCount: 0,
    timingGrade: null,
    timingScore: 0,
    arrowScore: 0,
    totalScore: 0,
    pressed: false,
  }
}

// ─── Component ───────────────────────────────────────────────────────
export default function AuditionGame() {
  const navigate = useNavigate()
  const musicRef = useRef<MusicEngine | null>(null)

  // Setup
  const [screen, setScreen] = useState<GameScreen>('setup')
  const [playerCount, setPlayerCount] = useState(2)
  const [playerNames, setPlayerNames] = useState(['P1', 'P2', 'P3', 'P4'])
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [countdown, setCountdown] = useState(3)

  // Game
  const [players, setPlayers] = useState<PlayerState[]>([])
  const [round, setRound] = useState(0)
  const [roundPhase, setRoundPhase] = useState<RoundPhase>('show')
  const [sequence, setSequence] = useState<Direction[]>([])
  const [showIndex, setShowIndex] = useState(-1) // which arrow is currently highlighted
  const [timingPos, setTimingPos] = useState(0) // 0..1 needle position
  const [timingDone, setTimingDone] = useState(false)

  const timingAnimRef = useRef(0)
  const roundTimerRef = useRef<number | null>(null)

  const config = DIFFICULTY_CONFIG[difficulty]
  const totalRounds = config.rounds

  // ─── Cleanup music on unmount ───────────────────────────────────
  useEffect(() => {
    return () => {
      musicRef.current?.stop()
    }
  }, [])

  // ─── Get arrow count for current round ──────────────────────────
  const getArrowCount = useCallback(
    (r: number) => {
      const progress = r / (totalRounds - 1)
      return Math.round(config.startArrows + progress * (config.maxArrows - config.startArrows))
    },
    [config, totalRounds],
  )

  // ─── Start game ─────────────────────────────────────────────────
  const startGame = useCallback(() => {
    setScreen('countdown')
    setCountdown(3)
    let count = 3
    const iv = setInterval(() => {
      count--
      if (count <= 0) {
        clearInterval(iv)
        // Init players
        const initial: PlayerState[] = Array.from({ length: playerCount }, (_, i) => ({
          name: playerNames[i] || `P${i + 1}`,
          totalScore: 0,
          combo: 0,
          maxCombo: 0,
          roundData: emptyRound(),
          hitCounts: { perfect: 0, great: 0, good: 0, miss: 0 },
        }))
        setPlayers(initial)
        setRound(0)

        // Start music
        const engine = new MusicEngine()
        engine.init(DIFFICULTY_CONFIG[difficulty].bpm)
        engine.start()
        musicRef.current = engine

        setScreen('playing')
        // Will trigger round start via effect
      } else {
        setCountdown(count)
      }
    }, 1000)
  }, [difficulty, playerCount, playerNames])

  // ─── Round lifecycle ────────────────────────────────────────────
  // Start a new round when `round` changes and we're playing
  useEffect(() => {
    if (screen !== 'playing') return
    if (round >= totalRounds) {
      musicRef.current?.stop()
      setScreen('results')
      return
    }

    const arrowCount = getArrowCount(round)
    const seq = generateSequence(arrowCount)
    setSequence(seq)
    setShowIndex(-1)
    setTimingPos(0)
    setTimingDone(false)

    // Reset player round data
    setPlayers((prev) =>
      prev.map((p) => ({ ...p, roundData: emptyRound() })),
    )

    // SHOW PHASE: reveal arrows one by one on beat
    setRoundPhase('show')
    const beatMs = (60 / config.bpm) * 1000
    let idx = -1

    // Small delay before showing
    const startDelay = setTimeout(() => {
      idx = 0
      setShowIndex(0)
      const showTimer = setInterval(() => {
        idx++
        if (idx >= seq.length) {
          clearInterval(showTimer)
          // After showing all, brief pause then INPUT phase
          setTimeout(() => {
            setShowIndex(-1)
            setRoundPhase('input')
          }, beatMs)
          return
        }
        setShowIndex(idx)
      }, beatMs)

      roundTimerRef.current = showTimer as unknown as number
    }, beatMs * 0.5)

    return () => {
      clearTimeout(startDelay)
      if (roundTimerRef.current) clearInterval(roundTimerRef.current)
    }
  }, [round, screen, totalRounds, getArrowCount, config.bpm])

  // INPUT PHASE: auto-transition to timing after a beat-synced window
  useEffect(() => {
    if (roundPhase !== 'input' || screen !== 'playing') return
    const beatMs = (60 / config.bpm) * 1000
    const inputWindow = beatMs * (sequence.length + 2) // give them time proportional to arrows

    const timer = setTimeout(() => {
      setRoundPhase('timing')
    }, inputWindow)

    return () => clearTimeout(timer)
  }, [roundPhase, screen, config.bpm, sequence.length])

  // TIMING PHASE: animate the needle
  useEffect(() => {
    if (roundPhase !== 'timing' || screen !== 'playing') return
    setTimingPos(0)
    setTimingDone(false)
    const startTime = performance.now()

    const animate = () => {
      const elapsed = (performance.now() - startTime) / 1000
      // Oscillate 0→1→0→1... using sine
      const pos = (Math.sin(elapsed * config.timingSpeed * Math.PI * 2 - Math.PI / 2) + 1) / 2
      setTimingPos(pos)
      timingAnimRef.current = requestAnimationFrame(animate)
    }
    timingAnimRef.current = requestAnimationFrame(animate)

    // Auto end timing after ~3 seconds
    const timer = setTimeout(() => {
      cancelAnimationFrame(timingAnimRef.current)
      setTimingDone(true)
      // Score anyone who didn't press
      setPlayers((prev) =>
        prev.map((p) => {
          if (p.roundData.pressed) return p
          return scorePlayerRound(p, sequence, 'miss')
        }),
      )
      // Brief score display then next round
      setTimeout(() => {
        setRound((r) => r + 1)
      }, 1500)
    }, 3000)

    return () => {
      cancelAnimationFrame(timingAnimRef.current)
      clearTimeout(timer)
    }
  }, [roundPhase, screen, config.timingSpeed, sequence])

  // ─── Score a player's round ─────────────────────────────────────
  function scorePlayerRound(p: PlayerState, seq: Direction[], timingGrade: HitGrade): PlayerState {
    const correctCount = p.roundData.inputSequence.reduce(
      (count, dir, i) => (i < seq.length && dir === seq[i] ? count + 1 : count),
      0,
    )
    const arrowAccuracy = seq.length > 0 ? correctCount / seq.length : 0
    const arrowScore = Math.round(arrowAccuracy * 100) * seq.length

    const timingMultiplier =
      timingGrade === 'perfect' ? 3 :
      timingGrade === 'great' ? 2 :
      timingGrade === 'good' ? 1.5 : 0.5

    const comboBonus = 1 + p.combo * 0.1
    const totalScore = Math.round(arrowScore * timingMultiplier * comboBonus)

    const newCombo = arrowAccuracy === 1 && timingGrade !== 'miss' ? p.combo + 1 : 0
    const newMaxCombo = Math.max(p.maxCombo, newCombo)

    // Play sound
    musicRef.current?.playHitSound(timingGrade)

    return {
      ...p,
      totalScore: p.totalScore + totalScore,
      combo: newCombo,
      maxCombo: newMaxCombo,
      hitCounts: { ...p.hitCounts, [timingGrade]: p.hitCounts[timingGrade] + 1 },
      roundData: {
        ...p.roundData,
        correctCount,
        timingGrade,
        arrowScore,
        timingScore: Math.round(arrowScore * (timingMultiplier - 1)),
        totalScore,
        pressed: true,
      },
    }
  }

  // ─── All players pressed — advance to score early ───────────────
  const checkAllPressed = useCallback(
    (updatedPlayers: PlayerState[]) => {
      if (roundPhase !== 'timing') return
      if (updatedPlayers.every((p) => p.roundData.pressed)) {
        cancelAnimationFrame(timingAnimRef.current)
        setTimingDone(true)
        setTimeout(() => {
          setRound((r) => r + 1)
        }, 1500)
      }
    },
    [roundPhase],
  )

  // ─── Input handling ─────────────────────────────────────────────
  useEffect(() => {
    if (screen !== 'playing') return

    const handleDown = (e: KeyboardEvent) => {
      e.preventDefault()

      // During INPUT phase: arrow key inputs
      if (roundPhase === 'input') {
        setPlayers((prev) => {
          const updated = prev.map((p, pi) => {
            const keyMap = KEY_MAPS[pi]
            let direction: Direction | null = null
            for (const [dir, code] of Object.entries(keyMap)) {
              if (code === e.code) {
                direction = dir as Direction
                break
              }
            }
            if (!direction) return p
            // Only allow up to sequence length inputs
            if (p.roundData.inputSequence.length >= sequence.length) return p

            const newInput = [...p.roundData.inputSequence, direction]
            return { ...p, roundData: { ...p.roundData, inputSequence: newInput } }
          })

          // Check if all players have completed input
          const allDone = updated.every(
            (p) => p.roundData.inputSequence.length >= sequence.length,
          )
          if (allDone) {
            // Jump to timing phase
            setTimeout(() => setRoundPhase('timing'), 300)
          }

          return updated
        })
      }

      // During TIMING phase: action key to lock in timing
      if (roundPhase === 'timing' && !timingDone) {
        setPlayers((prev) => {
          const updated = prev.map((p, pi) => {
            if (e.code !== ACTION_KEYS[pi]) return p
            if (p.roundData.pressed) return p
            const grade = getTimingGrade(timingPos)
            return scorePlayerRound(p, sequence, grade)
          })
          // Check outside of setState callback isn't reliable, so schedule
          setTimeout(() => checkAllPressed(updated), 0)
          return updated
        })
      }
    }

    window.addEventListener('keydown', handleDown)
    return () => window.removeEventListener('keydown', handleDown)
  }, [screen, roundPhase, sequence, timingPos, timingDone, checkAllPressed])

  // ─── SETUP SCREEN ──────────────────────────────────────────────
  if (screen === 'setup') {
    return (
      <div className="audition-root">
        <div className="audition-bg-grid" />
        <button className="audition-back-btn" onClick={() => navigate('/')}>
          ← Back
        </button>
        <div className="audition-setup">
          <h1 className="audition-title">Audition</h1>
          <p className="audition-subtitle">Rhythm Battle</p>

          <div className="audition-player-select">
            <label>Players</label>
            <div className="audition-player-btns">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  className={`audition-player-btn ${playerCount === n ? 'active' : ''}`}
                  onClick={() => setPlayerCount(n)}
                >
                  {n}
                </button>
              ))}
            </div>

            <div className="audition-name-inputs">
              {Array.from({ length: playerCount }, (_, i) => (
                <div key={i} className="audition-name-field"
                  style={{ '--player-color': PLAYER_COLORS[i] } as React.CSSProperties}
                >
                  <span className="player-label" style={{ color: PLAYER_COLORS[i] }}>
                    Player {i + 1}
                  </span>
                  <input
                    value={playerNames[i]}
                    onChange={(e) => {
                      const names = [...playerNames]
                      names[i] = e.target.value.slice(0, 12)
                      setPlayerNames(names)
                    }}
                    placeholder={`Player ${i + 1}`}
                    maxLength={12}
                  />
                </div>
              ))}
            </div>

            <div className="audition-key-hints">
              {Array.from({ length: playerCount }, (_, i) => (
                <div key={i} className="audition-key-hint">
                  <span className="hint-label" style={{ color: PLAYER_COLORS[i] }}>
                    {playerNames[i] || `P${i + 1}`}
                  </span>
                  <span className="hint-keys">
                    {KEY_LABELS[i].arrows.split(' ').map((k, ki) => (
                      <kbd key={ki}>{k}</kbd>
                    ))}
                  </span>
                  <span className="hint-keys">
                    Timing: <kbd>{KEY_LABELS[i].action}</kbd>
                  </span>
                </div>
              ))}
            </div>

            <label style={{ marginTop: 16 }}>Difficulty</label>
            <div className="audition-difficulty">
              {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
                <button
                  key={d}
                  className={`audition-diff-btn ${difficulty === d ? 'active' : ''}`}
                  onClick={() => setDifficulty(d)}
                >
                  {d}
                </button>
              ))}
            </div>

            <button className="audition-start-btn" onClick={startGame}>
              Start
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── COUNTDOWN ─────────────────────────────────────────────────
  if (screen === 'countdown') {
    return (
      <div className="audition-root">
        <div className="audition-bg-grid" />
        <div className="audition-countdown">
          <span key={countdown} className="audition-countdown-num">{countdown}</span>
        </div>
      </div>
    )
  }

  // ─── RESULTS ───────────────────────────────────────────────────
  if (screen === 'results') {
    const sorted = [...players].sort((a, b) => b.totalScore - a.totalScore)
    const winner = sorted[0]
    const winnerIdx = players.indexOf(winner)
    const others = sorted.slice(1)

    const getAccuracy = (p: PlayerState) => {
      const total = Object.values(p.hitCounts).reduce((a, b) => a + b, 0)
      if (total === 0) return 0
      return Math.round(((p.hitCounts.perfect + p.hitCounts.great) / total) * 100)
    }

    return (
      <div className="audition-root">
        <div className="audition-bg-grid" />
        <div className="audition-results">
          <h1 className="audition-results-title" style={{ color: PLAYER_COLORS[winnerIdx] }}>
            {players.length === 1 ? 'Results' : 'Winner!'}
          </h1>

          <div className="audition-winner-card"
            style={{
              borderColor: PLAYER_COLORS[winnerIdx],
              '--winner-rgb': PLAYER_COLORS_RGB[winnerIdx],
            } as React.CSSProperties}
          >
            {players.length > 1 && <div className="audition-winner-crown">👑</div>}
            <div className="audition-winner-name" style={{ color: PLAYER_COLORS[winnerIdx] }}>
              {winner.name}
            </div>
            <div className="audition-winner-score" style={{ color: PLAYER_COLORS[winnerIdx] }}>
              {winner.totalScore.toLocaleString()}
            </div>
            <div className="audition-winner-stats">
              {(['perfect', 'great', 'good', 'miss'] as HitGrade[]).map((g) => (
                <div key={g} className="audition-winner-stat">
                  <span className="stat-val" style={{ color: GRADE_COLORS[g] }}>
                    {winner.hitCounts[g]}
                  </span>
                  <span className="stat-label">{g}</span>
                </div>
              ))}
              <div className="audition-winner-stat">
                <span className="stat-val">{winner.maxCombo}</span>
                <span className="stat-label">Max Combo</span>
              </div>
              <div className="audition-winner-stat">
                <span className="stat-val">{getAccuracy(winner)}%</span>
                <span className="stat-label">Accuracy</span>
              </div>
            </div>
          </div>

          {others.length > 0 && (
            <div className="audition-others">
              {others.map((p, i) => {
                const origIdx = players.indexOf(p)
                return (
                  <div key={i} className="audition-other-card">
                    <span className="audition-other-rank">#{i + 2}</span>
                    <span className="audition-other-name" style={{ color: PLAYER_COLORS[origIdx] }}>
                      {p.name}
                    </span>
                    <span className="audition-other-score" style={{ color: PLAYER_COLORS[origIdx] }}>
                      {p.totalScore.toLocaleString()}
                    </span>
                    <span className="audition-other-accuracy">
                      {getAccuracy(p)}% · {p.maxCombo} max combo
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          <div className="audition-result-btns">
            <button className="audition-result-btn" onClick={() => navigate('/')}>Menu</button>
            <button className="audition-result-btn primary" onClick={() => {
              setScreen('setup')
              setRound(0)
            }}>
              Play Again
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── PLAYING SCREEN ────────────────────────────────────────────
  return (
    <div className="audition-root">
      <div className="audition-bg-grid" />
      <div className="audition-game">
        {/* HUD */}
        <div className="audition-hud">
          <div className="audition-hud-round">
            Round {round + 1} / {totalRounds}
          </div>
          <div className="audition-hud-phase">
            {roundPhase === 'show' && 'MEMORIZE'}
            {roundPhase === 'input' && 'INPUT!'}
            {roundPhase === 'timing' && 'TIMING!'}
            {roundPhase === 'score' && 'SCORE'}
          </div>
          <div className="audition-hud-scores">
            {players.map((p, i) => (
              <div key={i} className="audition-hud-player">
                <span className="hud-name" style={{ color: PLAYER_COLORS[i] }}>{p.name}</span>
                <span className="hud-score" style={{ color: PLAYER_COLORS[i] }}>
                  {p.totalScore.toLocaleString()}
                </span>
                <span className={`hud-combo ${p.combo > 0 ? 'visible' : ''}`}>
                  {p.combo}x
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Center stage area */}
        <div className="audition-stage">
          {/* Arrow sequence display */}
          <div className="audition-sequence-area">
            <div className="audition-sequence-label">
              {roundPhase === 'show' && 'Memorize the sequence!'}
              {roundPhase === 'input' && 'Type the arrows!'}
              {roundPhase === 'timing' && `Press ${playerCount > 1 ? 'your action key' : 'SPACE'}!`}
            </div>

            <div className="audition-sequence-row">
              {sequence.map((dir, idx) => {
                const isRevealed = roundPhase === 'show' && idx <= showIndex
                const isShowPhase = roundPhase === 'show'
                return (
                  <div
                    key={idx}
                    className={`audition-seq-arrow ${isRevealed ? 'revealed' : ''} ${isShowPhase && idx === showIndex ? 'current' : ''}`}
                    style={{ '--arrow-color': NOTE_COLORS[dir] } as React.CSSProperties}
                  >
                    <span className="seq-arrow-icon">
                      {isRevealed || roundPhase !== 'show' ? '' : '?'}
                      {isRevealed && DIRECTION_ARROWS[dir]}
                      {!isRevealed && roundPhase !== 'show' && '?'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Player input areas */}
          <div className="audition-players-area">
            {players.map((player, pi) => (
              <div key={pi} className="audition-player-panel"
                style={{ '--player-color': PLAYER_COLORS[pi] } as React.CSSProperties}
              >
                <div className="audition-panel-header">
                  <span style={{ color: PLAYER_COLORS[pi] }}>{player.name}</span>
                  {player.combo > 0 && (
                    <span className="panel-combo" style={{ color: PLAYER_COLORS[pi] }}>
                      {player.combo}x combo
                    </span>
                  )}
                </div>

                {/* Arrow input display */}
                <div className="audition-input-row">
                  {sequence.map((targetDir, idx) => {
                    const inputDir = player.roundData.inputSequence[idx]
                    const isCorrect = inputDir === targetDir
                    const isCurrent = idx === player.roundData.inputSequence.length
                    const isEmpty = inputDir === undefined

                    return (
                      <div
                        key={idx}
                        className={`audition-input-slot ${isCurrent && roundPhase === 'input' ? 'current' : ''} ${!isEmpty ? (isCorrect ? 'correct' : 'wrong') : ''}`}
                      >
                        {isEmpty ? (
                          <span className="slot-placeholder">
                            {isCurrent && roundPhase === 'input' ? '▸' : '·'}
                          </span>
                        ) : (
                          <span
                            className="slot-arrow"
                            style={{ color: isCorrect ? NOTE_COLORS[inputDir] : GRADE_COLORS.miss }}
                          >
                            {DIRECTION_ARROWS[inputDir]}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Round result */}
                {player.roundData.pressed && player.roundData.timingGrade && (
                  <div className="audition-round-result">
                    <span
                      className="round-grade"
                      style={{ color: GRADE_COLORS[player.roundData.timingGrade] }}
                    >
                      {GRADE_LABELS[player.roundData.timingGrade]}
                    </span>
                    <span className="round-score">+{player.roundData.totalScore}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Timing bar */}
          {roundPhase === 'timing' && (
            <div className="audition-timing-area">
              <div className="audition-timing-bar">
                {/* Zones */}
                <div className="timing-zone timing-miss" />
                <div className="timing-zone timing-good"
                  style={{ left: `${(0.5 - TIMING_GOOD) * 100}%`, width: `${TIMING_GOOD * 200}%` }}
                />
                <div className="timing-zone timing-great"
                  style={{ left: `${(0.5 - TIMING_GREAT) * 100}%`, width: `${TIMING_GREAT * 200}%` }}
                />
                <div className="timing-zone timing-perfect"
                  style={{ left: `${(0.5 - TIMING_PERFECT) * 100}%`, width: `${TIMING_PERFECT * 200}%` }}
                />
                {/* Needle */}
                <div
                  className="timing-needle"
                  style={{ left: `${timingPos * 100}%` }}
                />
                {/* Center marker */}
                <div className="timing-center" />
              </div>
              <div className="audition-timing-labels">
                <span style={{ color: GRADE_COLORS.miss }}>MISS</span>
                <span style={{ color: GRADE_COLORS.good }}>GOOD</span>
                <span style={{ color: GRADE_COLORS.great }}>GREAT</span>
                <span style={{ color: GRADE_COLORS.perfect }}>PERFECT</span>
                <span style={{ color: GRADE_COLORS.great }}>GREAT</span>
                <span style={{ color: GRADE_COLORS.good }}>GOOD</span>
                <span style={{ color: GRADE_COLORS.miss }}>MISS</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
