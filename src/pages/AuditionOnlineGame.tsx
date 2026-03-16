import { useState, useEffect, useRef, useCallback } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { type Player, PLAYER_COLORS, PLAYER_COLORS_RGB } from '../game/types'
import type { AuditionConfig } from './AuditionLobby'
import './AuditionGame.css'

// ─── Types ───────────────────────────────────────────────────────────
type Direction = 'left' | 'up' | 'down' | 'right'
type HitGrade = 'perfect' | 'great' | 'good' | 'miss'
type Difficulty = 'easy' | 'normal' | 'hard'
type RoundPhase = 'waiting' | 'show' | 'input' | 'timing' | 'score'

interface PlayerRound {
  inputSequence: Direction[]
  correctCount: number
  timingGrade: HitGrade | null
  timingPosition: number | null  // where the needle was when they pressed Space (0..1)
  totalScore: number
  pressed: boolean
}

interface OnlinePlayerState {
  id: string
  name: string
  totalScore: number
  combo: number
  maxCombo: number
  hitCounts: Record<HitGrade, number>
  roundData: PlayerRound
}

// ─── Constants ───────────────────────────────────────────────────────
const DIRECTIONS: Direction[] = ['left', 'up', 'down', 'right']
const DIRECTION_ARROWS: Record<Direction, string> = { left: '←', up: '↑', down: '↓', right: '→' }
const NOTE_COLORS: Record<Direction, string> = { left: '#00f0ff', up: '#ff00aa', down: '#aaff00', right: '#ff8800' }
const GRADE_COLORS: Record<HitGrade, string> = { perfect: '#00f0ff', great: '#aaff00', good: '#ff8800', miss: '#ff2255' }
const GRADE_LABELS: Record<HitGrade, string> = { perfect: 'PERFECT', great: 'GREAT', good: 'GOOD', miss: 'MISS' }

const TIMING_PERFECT = 0.06
const TIMING_GREAT = 0.12
const TIMING_GOOD = 0.20

const DIFFICULTY_CONFIG: Record<Difficulty, {
  bpm: number; startArrows: number; maxArrows: number; rounds: number; timingSpeed: number
}> = {
  easy:   { bpm: 110, startArrows: 3, maxArrows: 6,  rounds: 8,  timingSpeed: 0.8 },
  normal: { bpm: 130, startArrows: 4, maxArrows: 8,  rounds: 10, timingSpeed: 1.2 },
  hard:   { bpm: 160, startArrows: 5, maxArrows: 10, rounds: 12, timingSpeed: 1.8 },
}


// ─── Helpers ─────────────────────────────────────────────────────────
function generateSequence(length: number): Direction[] {
  return Array.from({ length }, () => DIRECTIONS[Math.floor(Math.random() * 4)])
}

function getTimingGrade(position: number): HitGrade {
  const dist = Math.abs(position - 0.5)
  if (dist <= TIMING_PERFECT) return 'perfect'
  if (dist <= TIMING_GREAT) return 'great'
  if (dist <= TIMING_GOOD) return 'good'
  return 'miss'
}

function emptyRound(): PlayerRound {
  return { inputSequence: [], correctCount: 0, timingGrade: null, timingPosition: null, totalScore: 0, pressed: false }
}

function getArrowCount(round: number, config: typeof DIFFICULTY_CONFIG['normal']): number {
  const progress = round / Math.max(config.rounds - 1, 1)
  return Math.round(config.startArrows + progress * (config.maxArrows - config.startArrows))
}

// ─── Music Engine (simplified) ───────────────────────────────────────
class SimpleBeatEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private playing = false
  private beatInterval = 0
  private nextBeat = 0
  private beat = 0
  private timer: number | null = null

  start(bpm: number) {
    this.ctx = new AudioContext()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.4
    this.master.connect(this.ctx.destination)
    if (this.ctx.state === 'suspended') this.ctx.resume()
    this.beatInterval = 60 / bpm
    this.playing = true
    this.beat = 0
    this.nextBeat = this.ctx.currentTime + 0.05
    this.schedule()
  }

  stop() {
    this.playing = false
    if (this.timer) clearTimeout(this.timer)
    if (this.ctx) { this.ctx.close(); this.ctx = null }
  }

  playHit(grade: HitGrade) {
    if (!this.ctx || !this.master) return
    const freq = grade === 'perfect' ? 880 : grade === 'great' ? 660 : grade === 'good' ? 440 : 220
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    g.gain.setValueAtTime(0.12, this.ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15)
    osc.connect(g); g.connect(this.master)
    osc.start(); osc.stop(this.ctx.currentTime + 0.15)
  }

  private schedule() {
    if (!this.playing || !this.ctx) return
    while (this.nextBeat < this.ctx.currentTime + 0.1) {
      this.playBeat(this.nextBeat, this.beat)
      this.nextBeat += this.beatInterval
      this.beat++
    }
    this.timer = window.setTimeout(() => this.schedule(), 25)
  }

  private playBeat(t: number, beat: number) {
    if (!this.ctx || !this.master) return
    const bar = beat % 4
    if (bar === 0 || bar === 2) this.kick(t)
    if (bar === 1 || bar === 3) this.snare(t)
    this.hihat(t)
    this.hihat(t + this.beatInterval / 2, 0.02)
    if (bar === 0) this.bass(t)
  }

  private kick(t: number) {
    if (!this.ctx || !this.master) return
    const o = this.ctx.createOscillator(), g = this.ctx.createGain()
    o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12)
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
    o.connect(g); g.connect(this.master!); o.start(t); o.stop(t + 0.3)
  }

  private snare(t: number) {
    if (!this.ctx || !this.master) return
    const len = this.ctx.sampleRate * 0.08, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1)
    const n = this.ctx.createBufferSource(); n.buffer = buf
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.08)
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3000
    n.connect(f); f.connect(g); g.connect(this.master!); n.start(t); n.stop(t + 0.08)
  }

  private hihat(t: number, vol = 0.04) {
    if (!this.ctx || !this.master) return
    const len = this.ctx.sampleRate * 0.02, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1)
    const n = this.ctx.createBufferSource(); n.buffer = buf
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.02)
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 9000
    n.connect(f); f.connect(g); g.connect(this.master!); n.start(t); n.stop(t + 0.02)
  }

  private bass(t: number) {
    if (!this.ctx || !this.master) return
    const o = this.ctx.createOscillator(), g = this.ctx.createGain()
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 250; lp.Q.value = 5
    o.type = 'sawtooth'; o.frequency.value = 55
    g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + this.beatInterval * 1.5)
    o.connect(lp); lp.connect(g); g.connect(this.master!); o.start(t); o.stop(t + this.beatInterval * 1.5)
  }
}

// ─── Component ───────────────────────────────────────────────────────
interface Props {
  channel: RealtimeChannel
  players: Player[]
  myId: string
  isHost: boolean
  config: AuditionConfig
  onLeave: () => void
}

export default function AuditionOnlineGame({ channel, players, myId, isHost, config, onLeave }: Props) {
  const difficulty = config.difficulty
  const cfg = DIFFICULTY_CONFIG[difficulty]
  const totalRounds = cfg.rounds

  const [round, setRound] = useState(-1) // -1 = countdown
  const [phase, setPhase] = useState<RoundPhase>('waiting')
  const [sequence, setSequence] = useState<Direction[]>([])
  const [showIndex, setShowIndex] = useState(-1)
  const [timingPos, setTimingPos] = useState(0)
  const [gameOver, setGameOver] = useState(false)
  const [playerStates, setPlayerStates] = useState<OnlinePlayerState[]>(() =>
    players.map((p) => ({
      id: p.id,
      name: p.name,
      totalScore: 0,
      combo: 0,
      maxCombo: 0,
      hitCounts: { perfect: 0, great: 0, good: 0, miss: 0 },
      roundData: emptyRound(),
    })),
  )

  // My local input state
  const [myInput, setMyInput] = useState<Direction[]>([])
  const [, setMyTimingGrade] = useState<HitGrade | null>(null)
  const [myTimingPressed, setMyTimingPressed] = useState(false)
  const myTimingPressedRef = useRef(false)

  const musicRef = useRef<SimpleBeatEngine | null>(null)
  const timingAnimRef = useRef(0)
  const timingPosRef = useRef(0)
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const roundRef = useRef(round)
  roundRef.current = round
  const sequenceRef = useRef(sequence)
  sequenceRef.current = sequence
  const myInputRef = useRef(myInput)
  myInputRef.current = myInput

  // ─── Music ─────────────────────────────────────────────────────
  useEffect(() => {
    const music = new SimpleBeatEngine()
    music.start(cfg.bpm)
    musicRef.current = music
    return () => { music.stop(); musicRef.current = null }
  }, [cfg.bpm])

  // ─── Host: drive game rounds ───────────────────────────────────
  useEffect(() => {
    if (!isHost) return

    // Start with countdown then round 0
    const startTimer = setTimeout(() => {
      startRound(0)
    }, 2000)

    return () => clearTimeout(startTimer)
  }, [isHost]) // eslint-disable-line react-hooks/exhaustive-deps

  const startRound = useCallback((r: number) => {
    if (r >= totalRounds) {
      channel.send({ type: 'broadcast', event: 'aud-game-over', payload: {} })
      setGameOver(true)
      return
    }

    const arrowCount = getArrowCount(r, cfg)
    const seq = generateSequence(arrowCount)

    // Broadcast round start
    channel.send({
      type: 'broadcast',
      event: 'aud-round',
      payload: { round: r, sequence: seq },
    })

    // Apply locally too
    applyRoundStart(r, seq)

    // Show phase: reveal arrows one by one
    const beatMs = (60 / cfg.bpm) * 1000
    let idx = 0

    setTimeout(() => {
      channel.send({ type: 'broadcast', event: 'aud-phase', payload: { phase: 'show' } })
      applyPhase('show')

      setShowIndex(0)
      const showTimer = setInterval(() => {
        idx++
        if (idx >= seq.length) {
          clearInterval(showTimer)
          setTimeout(() => {
            setShowIndex(-1)
            channel.send({ type: 'broadcast', event: 'aud-phase', payload: { phase: 'input' } })
            applyPhase('input')

            // Input timeout
            const inputTimeout = beatMs * (seq.length + 2)
            setTimeout(() => {
              if (phaseRef.current !== 'input') return
              channel.send({ type: 'broadcast', event: 'aud-phase', payload: { phase: 'timing' } })
              applyPhase('timing')

              // Timing timeout
              setTimeout(() => {
                if (phaseRef.current !== 'timing') return
                finishRound(r)
              }, 3000)
            }, inputTimeout)
          }, beatMs)
          return
        }
        setShowIndex(idx)
        channel.send({ type: 'broadcast', event: 'aud-show-idx', payload: { idx } })
      }, beatMs)
    }, beatMs * 0.5)
  }, [channel, cfg, totalRounds]) // eslint-disable-line react-hooks/exhaustive-deps

  const finishRound = useCallback((r: number) => {
    channel.send({ type: 'broadcast', event: 'aud-phase', payload: { phase: 'score' } })
    applyPhase('score')

    // Next round after delay
    setTimeout(() => {
      startRound(r + 1)
    }, 2000)
  }, [channel, startRound])

  // ─── Apply state changes (used by both host and guest) ─────────
  function applyRoundStart(r: number, seq: Direction[]) {
    setRound(r)
    setSequence(seq)
    setShowIndex(-1)
    setMyInput([])
    setMyTimingGrade(null)
    setMyTimingPressed(false)
    myTimingPressedRef.current = false
    setTimingPos(0)
    setPlayerStates((prev) =>
      prev.map((p) => ({ ...p, roundData: emptyRound() })),
    )
  }

  function applyPhase(p: RoundPhase) {
    setPhase(p)
    if (p === 'timing') {
      // Start timing animation
      const startTime = performance.now()
      const animate = () => {
        const elapsed = (performance.now() - startTime) / 1000
        const pos = (Math.sin(elapsed * cfg.timingSpeed * Math.PI * 2 - Math.PI / 2) + 1) / 2
        setTimingPos(pos)
        timingPosRef.current = pos
        if (phaseRef.current === 'timing') {
          timingAnimRef.current = requestAnimationFrame(animate)
        }
      }
      timingAnimRef.current = requestAnimationFrame(animate)
    } else {
      cancelAnimationFrame(timingAnimRef.current)
    }
  }

  // ─── Guest: listen for host broadcasts ─────────────────────────
  useEffect(() => {
    if (isHost) return

    channel.on('broadcast', { event: 'aud-round' }, ({ payload }) => {
      const { round: r, sequence: seq } = payload as { round: number; sequence: Direction[] }
      applyRoundStart(r, seq)
    })

    channel.on('broadcast', { event: 'aud-phase' }, ({ payload }) => {
      const { phase: p } = payload as { phase: RoundPhase }
      applyPhase(p)
    })

    channel.on('broadcast', { event: 'aud-show-idx' }, ({ payload }) => {
      const { idx } = payload as { idx: number }
      setShowIndex(idx)
    })

    channel.on('broadcast', { event: 'aud-game-over' }, () => {
      setGameOver(true)
    })
  }, [channel, isHost]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Both: listen for player results ───────────────────────────
  useEffect(() => {
    // Listen for other players' arrow inputs (live)
    channel.on('broadcast', { event: 'aud-input' }, ({ payload }) => {
      const { playerId, inputSequence } = payload as { playerId: string; inputSequence: Direction[] }
      setPlayerStates((prev) =>
        prev.map((p) => {
          if (p.id !== playerId) return p
          return { ...p, roundData: { ...p.roundData, inputSequence } }
        }),
      )
    })

    // Listen for other players' final results (timing press)
    channel.on('broadcast', { event: 'aud-result' }, ({ payload }) => {
      const result = payload as {
        playerId: string
        correctCount: number
        timingGrade: HitGrade
        timingPosition: number
        totalScore: number
        combo: number
        maxCombo: number
        inputSequence: Direction[]
      }
      setPlayerStates((prev) =>
        prev.map((p) => {
          if (p.id !== result.playerId) return p
          return {
            ...p,
            totalScore: p.totalScore + result.totalScore,
            combo: result.combo,
            maxCombo: result.maxCombo,
            hitCounts: { ...p.hitCounts, [result.timingGrade]: p.hitCounts[result.timingGrade] + 1 },
            roundData: {
              inputSequence: result.inputSequence,
              correctCount: result.correctCount,
              timingGrade: result.timingGrade,
              timingPosition: result.timingPosition,
              totalScore: result.totalScore,
              pressed: true,
            },
          }
        }),
      )
    })
  }, [channel])

  // ─── Score and broadcast my result ─────────────────────────────
  const submitMyResult = useCallback((timingGrade: HitGrade) => {
    const seq = sequenceRef.current
    const input = myInputRef.current
    const correctCount = input.reduce(
      (count, dir, i) => (i < seq.length && dir === seq[i] ? count + 1 : count), 0,
    )
    const arrowAccuracy = seq.length > 0 ? correctCount / seq.length : 0
    const arrowScore = Math.round(arrowAccuracy * 100) * seq.length
    const timingMultiplier = timingGrade === 'perfect' ? 3 : timingGrade === 'great' ? 2 : timingGrade === 'good' ? 1.5 : 0.5

    // Get current combo from state
    const myState = playerStates.find((p) => p.id === myId)
    const prevCombo = myState?.combo ?? 0
    const newCombo = arrowAccuracy === 1 && timingGrade !== 'miss' ? prevCombo + 1 : 0
    const comboBonus = 1 + prevCombo * 0.1
    const totalScore = Math.round(arrowScore * timingMultiplier * comboBonus)
    const newMaxCombo = Math.max(myState?.maxCombo ?? 0, newCombo)

    musicRef.current?.playHit(timingGrade)

    const timingPosition = timingPosRef.current

    const result = {
      playerId: myId,
      correctCount,
      timingGrade,
      timingPosition,
      totalScore,
      combo: newCombo,
      maxCombo: newMaxCombo,
      inputSequence: input,
    }

    // Broadcast result to everyone
    channel.send({ type: 'broadcast', event: 'aud-result', payload: result })

    // Apply locally
    setPlayerStates((prev) =>
      prev.map((p) => {
        if (p.id !== myId) return p
        return {
          ...p,
          totalScore: p.totalScore + totalScore,
          combo: newCombo,
          maxCombo: newMaxCombo,
          hitCounts: { ...p.hitCounts, [timingGrade]: p.hitCounts[timingGrade] + 1 },
          roundData: {
            inputSequence: input,
            correctCount,
            timingGrade,
            timingPosition,
            totalScore,
            pressed: true,
          },
        }
      }),
    )
  }, [channel, myId, playerStates])

  // ─── Keyboard input ────────────────────────────────────────────
  useEffect(() => {
    const handleDown = (e: KeyboardEvent) => {
      e.preventDefault()

      // INPUT phase: arrow keys
      if (phaseRef.current === 'input') {
        const dirMap: Record<string, Direction> = {
          ArrowLeft: 'left', ArrowUp: 'up', ArrowDown: 'down', ArrowRight: 'right',
        }
        const dir = dirMap[e.key]
        if (!dir) return
        setMyInput((prev) => {
          if (prev.length >= sequenceRef.current.length) return prev
          const updated = [...prev, dir]
          // Broadcast input so other players can see it live
          channel.send({ type: 'broadcast', event: 'aud-input', payload: { playerId: myId, inputSequence: updated } })
          return updated
        })
      }

      // TIMING phase: space
      if (phaseRef.current === 'timing' && e.code === 'Space' && !myTimingPressedRef.current) {
        myTimingPressedRef.current = true
        const grade = getTimingGrade(timingPosRef.current)
        setMyTimingGrade(grade)
        setMyTimingPressed(true)
        submitMyResult(grade)
      }
    }

    window.addEventListener('keydown', handleDown)
    return () => window.removeEventListener('keydown', handleDown)
  }, [submitMyResult])

  // Auto-submit miss if timing phase ends without pressing
  useEffect(() => {
    if (phase === 'score' && !myTimingPressedRef.current) {
      myTimingPressedRef.current = true
      setMyTimingGrade('miss')
      setMyTimingPressed(true)
      submitMyResult('miss')
    }
  }, [phase, submitMyResult])

  // ─── Rematch ───────────────────────────────────────────────────
  const handleRematch = () => window.location.reload()

  // ─── GAME OVER ─────────────────────────────────────────────────
  if (gameOver) {
    const sorted = [...playerStates].sort((a, b) => b.totalScore - a.totalScore)
    const winner = sorted[0]
    const winnerIdx = playerStates.indexOf(winner)
    const others = sorted.slice(1)

    const getAccuracy = (p: OnlinePlayerState) => {
      const total = Object.values(p.hitCounts).reduce((a, b) => a + b, 0)
      if (total === 0) return 0
      return Math.round(((p.hitCounts.perfect + p.hitCounts.great) / total) * 100)
    }

    return (
      <div className="audition-root">
        <div className="audition-bg-grid" />
        <div className="audition-results">
          <h1 className="audition-results-title" style={{ color: PLAYER_COLORS[winnerIdx] }}>
            Winner!
          </h1>
          <div className="audition-winner-card" style={{
            borderColor: PLAYER_COLORS[winnerIdx],
            '--winner-rgb': PLAYER_COLORS_RGB[winnerIdx],
          } as React.CSSProperties}>
            <div className="audition-winner-crown">👑</div>
            <div className="audition-winner-name" style={{ color: PLAYER_COLORS[winnerIdx] }}>{winner.name}</div>
            <div className="audition-winner-score" style={{ color: PLAYER_COLORS[winnerIdx] }}>{winner.totalScore.toLocaleString()}</div>
            <div className="audition-winner-stats">
              {(['perfect', 'great', 'good', 'miss'] as HitGrade[]).map((g) => (
                <div key={g} className="audition-winner-stat">
                  <span className="stat-val" style={{ color: GRADE_COLORS[g] }}>{winner.hitCounts[g]}</span>
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
                const origIdx = playerStates.indexOf(p)
                return (
                  <div key={p.id} className="audition-other-card">
                    <span className="audition-other-rank">#{i + 2}</span>
                    <span className="audition-other-name" style={{ color: PLAYER_COLORS[origIdx] }}>{p.name}</span>
                    <span className="audition-other-score" style={{ color: PLAYER_COLORS[origIdx] }}>{p.totalScore.toLocaleString()}</span>
                    <span className="audition-other-accuracy">{getAccuracy(p)}% · {p.maxCombo} max combo</span>
                  </div>
                )
              })}
            </div>
          )}

          <div className="audition-result-btns">
            <button className="audition-result-btn" onClick={onLeave}>Menu</button>
            <button className="audition-result-btn primary" onClick={handleRematch}>Rematch</button>
          </div>
        </div>
      </div>
    )
  }

  // ─── PLAYING ───────────────────────────────────────────────────
  return (
    <div className="audition-root">
      <div className="audition-bg-grid" />
      <div className="audition-game">
        {/* HUD */}
        <div className="audition-hud">
          <div className="audition-hud-round">
            {round >= 0 ? `Round ${round + 1} / ${totalRounds}` : 'Get Ready...'}
          </div>
          <div className="audition-hud-phase">
            {phase === 'waiting' && 'READY'}
            {phase === 'show' && 'MEMORIZE'}
            {phase === 'input' && 'INPUT!'}
            {phase === 'timing' && 'TIMING!'}
            {phase === 'score' && 'SCORE'}
          </div>
          <div className="audition-hud-scores">
            {playerStates.map((p, i) => (
              <div key={p.id} className="audition-hud-player">
                <span className="hud-name" style={{ color: PLAYER_COLORS[i] }}>{p.name}</span>
                <span className="hud-score" style={{ color: PLAYER_COLORS[i] }}>{p.totalScore.toLocaleString()}</span>
                <span className={`hud-combo ${p.combo > 0 ? 'visible' : ''}`}>{p.combo}x</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stage */}
        <div className="audition-stage">
          {/* Sequence display */}
          <div className="audition-sequence-area">
            <div className="audition-sequence-label">
              {phase === 'show' && 'Memorize the sequence!'}
              {phase === 'input' && 'Type the arrows! (← ↑ ↓ →)'}
              {phase === 'timing' && 'Press SPACE!'}
              {phase === 'score' && ''}
              {phase === 'waiting' && 'Starting soon...'}
            </div>

            <div className="audition-sequence-row">
              {sequence.map((dir, idx) => {
                const isRevealed = phase === 'show' && idx <= showIndex
                const isShowPhase = phase === 'show'
                return (
                  <div
                    key={idx}
                    className={`audition-seq-arrow ${isRevealed ? 'revealed' : ''} ${isShowPhase && idx === showIndex ? 'current' : ''}`}
                    style={{ '--arrow-color': NOTE_COLORS[dir] } as React.CSSProperties}
                  >
                    <span className="seq-arrow-icon">
                      {isRevealed ? DIRECTION_ARROWS[dir] : '?'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* All players' panels — visible during input, timing, and score */}
          {(phase === 'input' || phase === 'timing' || phase === 'score') && (
            <div className="audition-players-area">
              {playerStates.map((p, pi) => {
                const isMe = p.id === myId
                const inputSeq = isMe ? myInput : p.roundData.inputSequence
                return (
                  <div key={p.id} className="audition-player-panel" style={{
                    '--player-color': PLAYER_COLORS[pi],
                    border: isMe ? `2px solid ${PLAYER_COLORS[pi]}` : undefined,
                  } as React.CSSProperties}>
                    <div className="audition-panel-header">
                      <span style={{ color: PLAYER_COLORS[pi] }}>
                        {p.name} {isMe && '(You)'}
                      </span>
                      {p.combo > 0 && (
                        <span className="panel-combo" style={{ color: PLAYER_COLORS[pi] }}>{p.combo}x combo</span>
                      )}
                    </div>
                    {/* Arrow input slots */}
                    <div className="audition-input-row">
                      {sequence.map((targetDir, idx) => {
                        const inputDir = inputSeq[idx]
                        const isCorrect = inputDir === targetDir
                        const isCurrent = isMe && idx === inputSeq.length
                        const isEmpty = inputDir === undefined
                        return (
                          <div
                            key={idx}
                            className={`audition-input-slot ${isCurrent && phase === 'input' ? 'current' : ''} ${!isEmpty ? (isCorrect ? 'correct' : 'wrong') : ''}`}
                          >
                            {isEmpty ? (
                              <span className="slot-placeholder">{isCurrent && phase === 'input' ? '▸' : '·'}</span>
                            ) : (
                              <span className="slot-arrow" style={{ color: isCorrect ? NOTE_COLORS[inputDir] : GRADE_COLORS.miss }}>
                                {DIRECTION_ARROWS[inputDir]}
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    {/* Timing result */}
                    {p.roundData.pressed && p.roundData.timingGrade && (
                      <div className="audition-round-result">
                        <span className="round-grade" style={{ color: GRADE_COLORS[p.roundData.timingGrade] }}>
                          {GRADE_LABELS[p.roundData.timingGrade]}
                        </span>
                        <span className="round-score">+{p.roundData.totalScore}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Timing bar */}
          {(phase === 'timing' || (phase === 'score' && playerStates.some((p) => p.roundData.timingPosition !== null))) && (
            <div className="audition-timing-area">
              <div className="audition-timing-bar">
                <div className="timing-zone timing-miss" />
                <div className="timing-zone timing-good" style={{ left: `${(0.5 - TIMING_GOOD) * 100}%`, width: `${TIMING_GOOD * 200}%` }} />
                <div className="timing-zone timing-great" style={{ left: `${(0.5 - TIMING_GREAT) * 100}%`, width: `${TIMING_GREAT * 200}%` }} />
                <div className="timing-zone timing-perfect" style={{ left: `${(0.5 - TIMING_PERFECT) * 100}%`, width: `${TIMING_PERFECT * 200}%` }} />
                {/* Moving needle — hidden after local player presses */}
                {phase === 'timing' && !myTimingPressed && (
                  <div className="timing-needle" style={{ left: `${timingPos * 100}%` }} />
                )}
                {/* Frozen markers for each player who pressed */}
                {playerStates.map((p, pi) => {
                  if (p.roundData.timingPosition === null) return null
                  const isMe = p.id === myId
                  return (
                    <div
                      key={p.id}
                      className="timing-needle"
                      style={{
                        left: `${p.roundData.timingPosition * 100}%`,
                        background: PLAYER_COLORS[pi],
                        boxShadow: `0 0 10px ${PLAYER_COLORS[pi]}, 0 0 20px ${PLAYER_COLORS[pi]}80`,
                        width: isMe ? 4 : 3,
                        opacity: isMe ? 1 : 0.7,
                        zIndex: isMe ? 6 : 4,
                      }}
                    />
                  )
                })}
                <div className="timing-center" />
              </div>
              {/* Player name labels under their markers */}
              <div style={{ position: 'relative', height: 20, marginTop: 4 }}>
                {playerStates.map((p, pi) => {
                  if (p.roundData.timingPosition === null) return null
                  return (
                    <span
                      key={p.id}
                      style={{
                        position: 'absolute',
                        left: `${p.roundData.timingPosition * 100}%`,
                        transform: 'translateX(-50%)',
                        fontSize: 9,
                        fontFamily: "'Orbitron', sans-serif",
                        color: PLAYER_COLORS[pi],
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.name}
                    </span>
                  )
                })}
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
