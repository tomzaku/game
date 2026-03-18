import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../supabase'
import './TypeRacer.css'

// ── WORD BANK ──
const WORD_BANK = [
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'it',
  'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this',
  'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or',
  'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what',
  'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me',
  'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know',
  'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could',
  'them', 'see', 'other', 'than', 'then', 'now', 'look', 'only', 'come',
  'its', 'over', 'think', 'also', 'back', 'after', 'use', 'two', 'how',
  'our', 'work', 'first', 'well', 'way', 'even', 'new', 'want', 'because',
  'any', 'these', 'give', 'day', 'most', 'us', 'great', 'between', 'need',
  'large', 'often', 'important', 'life', 'world', 'still', 'should', 'every',
  'never', 'start', 'city', 'run', 'story', 'keep', 'place', 'help', 'move',
  'change', 'play', 'small', 'end', 'put', 'home', 'read', 'hand', 'high',
  'last', 'school', 'might', 'name', 'always', 'point', 'found', 'old',
  'big', 'must', 'under', 'long', 'learn', 'same', 'own', 'while', 'mean',
  'left', 'right', 'turn', 'call', 'set', 'try', 'ask', 'house', 'kind',
  'off', 'head', 'far', 'line', 'hard', 'near', 'open', 'seem', 'together',
  'next', 'children', 'few', 'water', 'been', 'number', 'side', 'part',
  'build', 'real', 'almost', 'let', 'thought', 'light', 'program', 'below',
  'power', 'system', 'best', 'family', 'fact', 'area', 'young', 'group',
  'often', 'problem', 'early', 'possible', 'able', 'against', 'before',
  'until', 'without', 'again', 'second', 'enough', 'already', 'during',
  'follow', 'around', 'question', 'however', 'nothing', 'course', 'example',
  'answer', 'produce', 'develop', 'market', 'paper', 'along', 'both',
  'music', 'across', 'close', 'state', 'consider', 'result', 'reason',
  'idea', 'clear', 'simple', 'study', 'level', 'strong', 'watch', 'voice',
  'continue', 'minute', 'design', 'stand', 'heart', 'among', 'true', 'whole',
  'action', 'window', 'finish', 'value', 'rather', 'create', 'machine',
]

const WORD_COUNT_OPTIONS = [25, 50, 100, 150, 200]

// ── KEYBOARD LAYOUT & FINGER MAP ──
// Finger indices: 0=L-pinky 1=L-ring 2=L-mid 3=L-index 4=R-index 5=R-mid 6=R-ring 7=R-pinky 8=thumbs(space)
const FINGER_COLORS = [
  '#ff6b6b', // L-pinky (red)
  '#ffa94d', // L-ring (orange)
  '#ffd43b', // L-mid (yellow)
  '#69db7c', // L-index (green)
  '#4dabf7', // R-index (blue)
  '#da77f2', // R-mid (purple)
  '#ffa94d', // R-ring (orange)
  '#ff6b6b', // R-pinky (red)
  '#868e96', // thumbs (gray)
]

const FINGER_NAMES = [
  'L Pinky', 'L Ring', 'L Middle', 'L Index',
  'R Index', 'R Middle', 'R Ring', 'R Pinky', 'Thumb',
]

// QWERTY keyboard rows with finger assignments
const KB_ROWS: { key: string; finger: number; w?: number }[][] = [
  // Row 0: number row (simplified)
  [
    { key: '`', finger: 0 }, { key: '1', finger: 0 }, { key: '2', finger: 1 },
    { key: '3', finger: 2 }, { key: '4', finger: 3 }, { key: '5', finger: 3 },
    { key: '6', finger: 4 }, { key: '7', finger: 4 }, { key: '8', finger: 5 },
    { key: '9', finger: 6 }, { key: '0', finger: 7 }, { key: '-', finger: 7 },
    { key: '=', finger: 7 },
  ],
  // Row 1: QWERTY
  [
    { key: 'q', finger: 0 }, { key: 'w', finger: 1 }, { key: 'e', finger: 2 },
    { key: 'r', finger: 3 }, { key: 't', finger: 3 }, { key: 'y', finger: 4 },
    { key: 'u', finger: 4 }, { key: 'i', finger: 5 }, { key: 'o', finger: 6 },
    { key: 'p', finger: 7 }, { key: '[', finger: 7 }, { key: ']', finger: 7 },
  ],
  // Row 2: Home row
  [
    { key: 'a', finger: 0 }, { key: 's', finger: 1 }, { key: 'd', finger: 2 },
    { key: 'f', finger: 3 }, { key: 'g', finger: 3 }, { key: 'h', finger: 4 },
    { key: 'j', finger: 4 }, { key: 'k', finger: 5 }, { key: 'l', finger: 6 },
    { key: ';', finger: 7 }, { key: "'", finger: 7 },
  ],
  // Row 3: Bottom row
  [
    { key: 'z', finger: 0 }, { key: 'x', finger: 1 }, { key: 'c', finger: 2 },
    { key: 'v', finger: 3 }, { key: 'b', finger: 3 }, { key: 'n', finger: 4 },
    { key: 'm', finger: 4 }, { key: ',', finger: 5 }, { key: '.', finger: 6 },
    { key: '/', finger: 7 },
  ],
  // Row 4: Space bar
  [
    { key: ' ', finger: 8, w: 8 },
  ],
]

// Build a lookup: char → finger index
const CHAR_TO_FINGER: Record<string, number> = {}
for (const row of KB_ROWS) {
  for (const k of row) {
    CHAR_TO_FINGER[k.key] = k.finger
    CHAR_TO_FINGER[k.key.toUpperCase()] = k.finger
  }
}

// ── THEMES ──
type ThemeId = 'neon' | 'cyberpunk' | 'ocean' | 'terminal' | 'sunset'

interface ThemeConfig {
  id: ThemeId
  label: string
  arpNotes: number[]
  bassNote: number
  tempo: number
}

const THEMES: ThemeConfig[] = [
  {
    id: 'neon',
    label: 'Arcade Neon',
    arpNotes: [130.8, 164.8, 196.0, 261.6, 196.0, 164.8, 220.0, 261.6],
    bassNote: 55.0,
    tempo: 140,
  },
  {
    id: 'cyberpunk',
    label: 'Cyberpunk',
    arpNotes: [138.6, 174.6, 207.7, 277.2, 207.7, 174.6, 233.1, 277.2],
    bassNote: 58.3,
    tempo: 150,
  },
  {
    id: 'ocean',
    label: 'Ocean Deep',
    arpNotes: [123.5, 155.6, 185.0, 246.9, 185.0, 155.6, 207.7, 246.9],
    bassNote: 49.0,
    tempo: 110,
  },
  {
    id: 'terminal',
    label: 'Retro Terminal',
    arpNotes: [98.0, 123.5, 146.8, 196.0, 146.8, 123.5, 164.8, 196.0],
    bassNote: 41.2,
    tempo: 120,
  },
  {
    id: 'sunset',
    label: 'Sunset Blaze',
    arpNotes: [146.8, 185.0, 220.0, 293.7, 220.0, 185.0, 246.9, 293.7],
    bassNote: 61.7,
    tempo: 125,
  },
]

const THEME_IDS: ThemeId[] = THEMES.map(t => t.id)

// ── TYPES ──
type FxMode = 'particle' | 'neon' | 'minimal'
type PlayerMode = 1 | 2 | 3 | 4
type GamePhase = 'idle' | 'countdown' | 'racing' | 'finished'

interface Racer {
  id: string
  name: string
  avatar: string
  isBot: boolean
  progress: number
  wpm: number
  accuracy: number
  finished: boolean
  finishTime: number
}

interface Particle {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: string
  size: number
}

// ── BOT CONFIG ──
const BOT_PROFILES = [
  { name: 'NeonBot', avatar: '\u{1F916}', baseWpm: 45, variance: 15 },
  { name: 'TurboTyper', avatar: '\u{26A1}', baseWpm: 60, variance: 20 },
  { name: 'GhostKeys', avatar: '\u{1F47B}', baseWpm: 35, variance: 10 },
]

// ── HELPERS ──
function generateText(wordCount: number): string {
  const words: string[] = []
  for (let i = 0; i < wordCount; i++) {
    words.push(WORD_BANK[Math.floor(Math.random() * WORD_BANK.length)])
  }
  return words.join(' ')
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function pickRandomTheme(): ThemeId {
  return THEME_IDS[Math.floor(Math.random() * THEME_IDS.length)]
}

// ── MATRIX MUSIC SYSTEM ──
// Browsers block AudioContext until user gesture. We defer creation and use a
// global "user has interacted" flag so the first click/key triggers playback.
let _userGestured = false
if (typeof window !== 'undefined') {
  const markGesture = () => { _userGestured = true }
  window.addEventListener('click', markGesture, { once: true, capture: true })
  window.addEventListener('keydown', markGesture, { once: true, capture: true })
}

function useMusic(theme: ThemeConfig, isPlaying: boolean) {
  const ctxRef = useRef<AudioContext | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const delayRef = useRef<DelayNode | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const stepRef = useRef(0)
  const wantPlayRef = useRef(isPlaying)
  wantPlayRef.current = isPlaying

  const startEngine = useCallback(() => {
    if (ctxRef.current) return
    const ctx = new AudioContext()
    // Resume immediately — will succeed if called from user gesture context
    ctx.resume()
    ctxRef.current = ctx

    const masterGain = ctx.createGain()
    masterGain.gain.value = 0.18
    masterGain.connect(ctx.destination)
    gainRef.current = masterGain

    // Delay / reverb
    const delay = ctx.createDelay()
    delay.delayTime.value = 0.25
    const fb = ctx.createGain()
    fb.gain.value = 0.3
    const dGain = ctx.createGain()
    dGain.gain.value = 0.2
    delay.connect(fb)
    fb.connect(delay)
    delay.connect(dGain)
    dGain.connect(masterGain)
    delayRef.current = delay

    const beatDur = 60 / theme.tempo
    const arpNotes = theme.arpNotes

    const playStep = () => {
      if (!ctxRef.current || ctxRef.current.state === 'closed') return
      // If context got suspended (tab hidden etc), resume
      if (ctxRef.current.state === 'suspended') ctxRef.current.resume()
      const now = ctx.currentTime
      const step = stepRef.current % arpNotes.length
      const note = arpNotes[step]

      // Arpeggio (sawtooth + lowpass filter = Matrix digital rain)
      const osc = ctx.createOscillator()
      const filter = ctx.createBiquadFilter()
      const noteGain = ctx.createGain()
      osc.type = 'sawtooth'
      osc.frequency.value = note
      filter.type = 'lowpass'
      filter.frequency.value = 1200 + Math.sin(stepRef.current * 0.3) * 400
      filter.Q.value = 5
      noteGain.gain.setValueAtTime(0, now)
      noteGain.gain.linearRampToValueAtTime(0.18, now + 0.02)
      noteGain.gain.exponentialRampToValueAtTime(0.01, now + beatDur * 0.9)
      osc.connect(filter)
      filter.connect(noteGain)
      noteGain.connect(masterGain)
      noteGain.connect(delay)
      osc.start(now)
      osc.stop(now + beatDur)

      // Sub bass (every 4 beats)
      if (step % 4 === 0) {
        const bass = ctx.createOscillator()
        const bG = ctx.createGain()
        bass.type = 'sine'
        bass.frequency.value = theme.bassNote
        bG.gain.setValueAtTime(0, now)
        bG.gain.linearRampToValueAtTime(0.25, now + 0.05)
        bG.gain.linearRampToValueAtTime(0.15, now + beatDur * 2)
        bG.gain.linearRampToValueAtTime(0, now + beatDur * 4)
        bass.connect(bG)
        bG.connect(masterGain)
        bass.start(now)
        bass.stop(now + beatDur * 4 + 0.1)
      }

      // Kick
      if (step % 4 === 0) {
        const kick = ctx.createOscillator()
        const kG = ctx.createGain()
        kick.type = 'sine'
        kick.frequency.setValueAtTime(150, now)
        kick.frequency.exponentialRampToValueAtTime(30, now + 0.1)
        kG.gain.setValueAtTime(0.3, now)
        kG.gain.exponentialRampToValueAtTime(0.01, now + 0.15)
        kick.connect(kG)
        kG.connect(masterGain)
        kick.start(now)
        kick.stop(now + 0.2)
      }

      // Hi-hat
      const hat = ctx.createOscillator()
      const hG = ctx.createGain()
      hat.type = 'square'
      hat.frequency.value = 8000 + Math.random() * 3000
      const hVol = step % 2 === 1 ? 0.04 : 0.02
      hG.gain.setValueAtTime(hVol, now)
      hG.gain.exponentialRampToValueAtTime(0.001, now + 0.04)
      hat.connect(hG)
      hG.connect(masterGain)
      hat.start(now)
      hat.stop(now + 0.05)

      stepRef.current++
    }

    playStep()
    intervalRef.current = setInterval(playStep, beatDur * 1000)
  }, [theme])

  const stopEngine = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = undefined
    }
    if (gainRef.current && ctxRef.current && ctxRef.current.state !== 'closed') {
      try { gainRef.current.gain.linearRampToValueAtTime(0, ctxRef.current.currentTime + 0.5) } catch { /* */ }
    }
    setTimeout(() => {
      if (ctxRef.current && ctxRef.current.state !== 'closed') {
        ctxRef.current.close()
      }
      ctxRef.current = null
      gainRef.current = null
      delayRef.current = null
      stepRef.current = 0
    }, 600)
  }, [])

  // Wait for user gesture then start
  useEffect(() => {
    if (!isPlaying) { stopEngine(); return }

    // If user already interacted, start immediately
    if (_userGestured) { startEngine(); return }

    // Otherwise wait for the first click/key
    const tryStart = () => {
      _userGestured = true
      if (wantPlayRef.current) startEngine()
    }
    window.addEventListener('click', tryStart, { once: true, capture: true })
    window.addEventListener('keydown', tryStart, { once: true, capture: true })

    return () => {
      window.removeEventListener('click', tryStart, { capture: true })
      window.removeEventListener('keydown', tryStart, { capture: true })
      stopEngine()
    }
  }, [isPlaying, startEngine, stopEngine])
}

// ── PARTICLE SYSTEM ──
function useParticles(fxMode: FxMode, gamePhase: GamePhase) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const nextIdRef = useRef(0)
  const rafRef = useRef<number | undefined>(undefined)

  const spawnBurst = useCallback((x: number, y: number, color: string) => {
    if (fxMode !== 'particle') return
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 * i) / 6 + Math.random() * 0.5
      const speed = 60 + Math.random() * 80
      particlesRef.current.push({
        id: nextIdRef.current++,
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        maxLife: 0.4 + Math.random() * 0.3,
        color,
        size: 2 + Math.random() * 3,
      })
    }
  }, [fxMode])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let lastTime = performance.now()

    function resize() {
      if (!canvas) return
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    function animate(now: number) {
      if (!ctx || !canvas) return
      const dt = Math.min((now - lastTime) / 1000, 0.05)
      lastTime = now
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const particles = particlesRef.current
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.life -= dt / p.maxLife
        if (p.life <= 0) { particles.splice(i, 1); continue }
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.vx *= 0.96
        p.vy *= 0.96
        ctx.globalAlpha = p.life * 0.8
        ctx.fillStyle = p.color
        ctx.shadowColor = p.color
        ctx.shadowBlur = 8
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      ctx.shadowBlur = 0
      rafRef.current = requestAnimationFrame(animate)
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => {
      window.removeEventListener('resize', resize)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [gamePhase])

  return { canvasRef, spawnBurst }
}

// ── HAND SVG COMPONENT ──
// Left hand fingers: 0=pinky 1=ring 2=middle 3=index (+ thumb)
// Right hand fingers: 4=index 5=middle 6=ring 7=pinky (+ thumb)
function HandSVG({ side, activeFinger }: { side: 'left' | 'right'; activeFinger: number }) {
  // Map finger indices to which finger on this hand is active
  // Left hand: fingers 0-3, Right hand: fingers 4-7, thumb: 8
  const isLeft = side === 'left'
  const fingers = isLeft
    ? [
        { idx: 0, label: 'Pinky', cx: 18, cy: 10, h: 40 },
        { idx: 1, label: 'Ring', cx: 35, cy: 4, h: 48 },
        { idx: 2, label: 'Middle', cx: 52, cy: 0, h: 52 },
        { idx: 3, label: 'Index', cx: 69, cy: 6, h: 46 },
      ]
    : [
        { idx: 4, label: 'Index', cx: 21, cy: 6, h: 46 },
        { idx: 5, label: 'Middle', cx: 38, cy: 0, h: 52 },
        { idx: 6, label: 'Ring', cx: 55, cy: 4, h: 48 },
        { idx: 7, label: 'Pinky', cx: 72, cy: 10, h: 40 },
      ]
  const thumbIdx = 8
  const thumbCx = isLeft ? 82 : 8
  const thumbActive = activeFinger === thumbIdx

  return (
    <svg viewBox="0 0 90 110" className={`tr-hand-svg tr-hand-${side}`}>
      {/* Palm */}
      <rect
        x={isLeft ? 12 : 8} y="52" width="70" height="50" rx="16"
        fill="var(--tr-bg-card)" stroke="var(--tr-border)" strokeWidth="1.5"
      />
      {/* Fingers */}
      {fingers.map(f => {
        const isActive = activeFinger === f.idx
        const color = FINGER_COLORS[f.idx]
        return (
          <g key={f.idx}>
            <rect
              x={f.cx - 7} y={f.cy + 12} width="14" height={f.h} rx="7"
              fill={isActive ? color : 'var(--tr-bg-card)'}
              stroke={isActive ? color : 'var(--tr-border)'}
              strokeWidth="1.5"
              opacity={isActive ? 1 : 0.5}
              className={isActive ? 'tr-hand-finger-active' : ''}
            />
            {/* Fingertip dot */}
            <circle
              cx={f.cx} cy={f.cy + 18} r="3"
              fill={color} opacity={isActive ? 1 : 0.3}
            />
          </g>
        )
      })}
      {/* Thumb */}
      <rect
        x={thumbCx - 6} y="60" width="12" height="30" rx="6"
        fill={thumbActive ? FINGER_COLORS[thumbIdx] : 'var(--tr-bg-card)'}
        stroke={thumbActive ? FINGER_COLORS[thumbIdx] : 'var(--tr-border)'}
        strokeWidth="1.5"
        opacity={thumbActive ? 1 : 0.5}
        transform={`rotate(${isLeft ? 25 : -25}, ${thumbCx}, 75)`}
        className={thumbActive ? 'tr-hand-finger-active' : ''}
      />
    </svg>
  )
}

// ── KEYBOARD VISUALIZER COMPONENT ──
function KeyboardVisualizer({ nextChar, showTrainer }: { nextChar: string; showTrainer: boolean }) {
  if (!showTrainer) return null

  const targetFinger = CHAR_TO_FINGER[nextChar] ?? -1
  const targetKey = nextChar === ' ' ? ' ' : nextChar.toLowerCase()

  return (
    <div className="tr-keyboard-section">
      <div className="tr-keyboard-header">
        <span className="tr-keyboard-title">Finger Guide</span>
        {targetFinger >= 0 && (
          <span className="tr-keyboard-hint" style={{ color: FINGER_COLORS[targetFinger] }}>
            {FINGER_NAMES[targetFinger]}
            {nextChar === ' ' ? ' (Space)' : ` \u2192 ${nextChar}`}
          </span>
        )}
      </div>
      <div className="tr-keyboard-with-hands">
        {/* Left Hand */}
        <HandSVG side="left" activeFinger={targetFinger} />

        <div className="tr-keyboard">
          {KB_ROWS.map((row, ri) => (
            <div key={ri} className="tr-kb-row" data-row={ri}>
              {row.map((k) => {
                const isTarget = k.key === targetKey
                const isTargetFinger = k.finger === targetFinger && targetFinger >= 0
                const fingerColor = FINGER_COLORS[k.finger]

                return (
                  <div
                    key={k.key}
                    className={`tr-kb-key ${isTarget ? 'is-target' : ''} ${isTargetFinger ? 'is-finger' : ''}`}
                    style={{
                      '--finger-color': fingerColor,
                      width: k.w ? `${k.w * 40 + (k.w - 1) * 4}px` : undefined,
                    } as React.CSSProperties}
                  >
                    <span className="tr-kb-key-label">
                      {k.key === ' ' ? 'SPACE' : k.key}
                    </span>
                    <span className="tr-kb-finger-dot" style={{ background: fingerColor }} />
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* Right Hand */}
        <HandSVG side="right" activeFinger={targetFinger} />
      </div>
      <div className="tr-finger-legend">
        {FINGER_NAMES.map((name, i) => (
          <span key={i} className="tr-finger-legend-item">
            <span className="tr-finger-dot" style={{ background: FINGER_COLORS[i] }} />
            {name}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── ONLINE HELPERS ──
const CAR_OPTIONS = [
  '\u{1F3CE}\u{FE0F}', // racing car
  '\u{1F680}',         // rocket
  '\u{1F3CD}\u{FE0F}', // motorcycle
  '\u{1F6F8}',         // UFO
  '\u{1F40E}',         // horse
  '\u{1F6A2}',         // ship
  '\u{2708}\u{FE0F}',  // airplane
  '\u{1F682}',         // train
  '\u{1F6F5}',         // scooter
  '\u{1F409}',         // dragon
]

function generateRoomCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

// ── MAIN COMPONENT ──
export default function TypeRacer() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // Game config
  const [fxMode, setFxMode] = useState<FxMode>('neon')
  const [wordCount, setWordCount] = useState(100)
  const [strictMode, setStrictMode] = useState(true)
  const [themeChoice, setThemeChoice] = useState<'random' | ThemeId>('random')
  const [activeTheme, setActiveTheme] = useState<ThemeId>(pickRandomTheme)
  const [musicOn, setMusicOn] = useState(true)
  const [showTrainer, setShowTrainer] = useState(true)
  const [gameMode, setGameMode] = useState<'offline' | 'online'>('offline')
  const [playerMode, setPlayerMode] = useState<PlayerMode>(1) // offline bots

  // Online state
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('tr-name') || '')
  const [myCar, setMyCar] = useState(() => localStorage.getItem('tr-car') || CAR_OPTIONS[0])
  const [roomCode, setRoomCode] = useState('')
  const [onlinePlayers, setOnlinePlayers] = useState<{ id: string; name: string; isHost: boolean; avatar: string }[]>([])
  const [isHost, setIsHost] = useState(false)
  const myIdRef = useRef(crypto.randomUUID())
  const channelRef = useRef<RealtimeChannel | null>(null)

  // Persist name & car
  const updateName = useCallback((name: string) => {
    setPlayerName(name)
    localStorage.setItem('tr-name', name)
  }, [])
  const updateCar = useCallback((car: string) => {
    setMyCar(car)
    localStorage.setItem('tr-car', car)
  }, [])

  // Resolve theme config
  const themeConfig = useMemo(() => THEMES.find(t => t.id === activeTheme)!, [activeTheme])

  // Music
  useMusic(themeConfig, musicOn)

  // Game state
  const [gamePhase, setGamePhase] = useState<GamePhase>('idle')
  const [quote, setQuote] = useState('')
  const [typedChars, setTypedChars] = useState('')
  const [errors, setErrors] = useState(0)
  const [totalKeystrokes, setTotalKeystrokes] = useState(0)
  const [startTime, setStartTime] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [countdown, setCountdown] = useState(3)
  const [racers, setRacers] = useState<Racer[]>([])
  const [lobbyPhase, setLobbyPhase] = useState<'none' | 'join' | 'waiting'>('none')
  const [joinCode, setJoinCode] = useState('')

  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const botIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const broadcastRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const mountedRef = useRef(true)

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  // Auto-join from URL ?room=CODE
  const initialRoomRef = useRef(searchParams.get('room'))
  useEffect(() => {
    const code = initialRoomRef.current
    if (code && playerName.trim()) {
      setGameMode('online')
      setLobbyPhase('join')
      setJoinCode(code.toUpperCase())
    } else if (code) {
      // Has room code but no name yet — show join screen
      setGameMode('online')
      setLobbyPhase('join')
      setJoinCode(code.toUpperCase())
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const { canvasRef, spawnBurst } = useParticles(fxMode, gamePhase)

  // Next character to type
  const nextChar = quote[typedChars.length] ?? ''

  // ── THEME SELECTION ──
  const handleThemeChoice = useCallback((choice: 'random' | ThemeId) => {
    setThemeChoice(choice)
    setActiveTheme(choice === 'random' ? pickRandomTheme() : choice)
  }, [])

  // ── DERIVED STATE ──
  const progress = quote.length > 0 ? typedChars.length / quote.length : 0
  const wpm = useMemo(() => {
    if (elapsed < 1) return 0
    return Math.round((typedChars.length / 5) / (elapsed / 60))
  }, [typedChars.length, elapsed])

  const accuracy = useMemo(() => {
    if (totalKeystrokes === 0) return 100
    return Math.round(((totalKeystrokes - errors) / totalKeystrokes) * 100)
  }, [totalKeystrokes, errors])

  // ── CLEANUP CHANNEL ──
  const cleanupChannel = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
    if (broadcastRef.current) { clearInterval(broadcastRef.current); broadcastRef.current = undefined }
  }, [])

  // ── SHARED: setup channel listeners ──
  const setupChannelListeners = useCallback((ch: RealtimeChannel) => {
    ch.on('presence', { event: 'sync' }, () => {
      if (!mountedRef.current) return
      const state = ch.presenceState()
      const players: { id: string; name: string; isHost: boolean; avatar: string }[] = []
      for (const [, presences] of Object.entries(state)) {
        const p = presences[0] as unknown as { id: string; name: string; isHost: boolean; avatar: string }
        if (p?.id) players.push(p)
      }
      players.sort((a, b) => (a.isHost === b.isHost ? 0 : a.isHost ? -1 : 1))
      setOnlinePlayers(players)
    })

    ch.on('broadcast', { event: 'racer-progress' }, ({ payload }) => {
      if (!mountedRef.current) return
      const p = payload as { id: string; progress: number; wpm: number; accuracy: number; finished: boolean; finishTime: number }
      setRacers(prev => {
        const exists = prev.find(r => r.id === p.id)
        if (!exists) return prev
        return prev.map(r => r.id === p.id ? { ...r, ...p } : r)
      })
    })

    ch.on('broadcast', { event: 'race-start' }, ({ payload }) => {
      if (!mountedRef.current) return
      const { text, wordCount: wc, players: gamePlayers } = payload as {
        text: string; wordCount: number; players: { id: string; name: string; avatar: string }[]
      }
      const newRacers: Racer[] = gamePlayers.map(gp => ({
        id: gp.id, name: gp.name, avatar: gp.avatar,
        isBot: false, progress: 0, wpm: 0, accuracy: 100, finished: false, finishTime: 0,
      }))
      setRacers(newRacers)
      setQuote(text)
      setWordCount(wc)
      setTypedChars('')
      setErrors(0)
      setTotalKeystrokes(0)
      setElapsed(0)
      setGamePhase('countdown')
      setCountdown(3)
    })
  }, [])

  // ── ONLINE: CREATE ROOM ──
  const createRoom = useCallback(() => {
    if (!playerName.trim()) return
    localStorage.setItem('tr-name', playerName.trim())
    const code = generateRoomCode()
    setRoomCode(code)
    setIsHost(true)
    setLobbyPhase('waiting')
    setSearchParams({ room: code }, { replace: true })

    const myId = myIdRef.current
    const ch = supabase.channel(`typeracer-${code}`, {
      config: { broadcast: { self: false, ack: false }, presence: { key: myId } },
    })
    channelRef.current = ch
    setupChannelListeners(ch)

    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({ id: myId, name: playerName.trim(), isHost: true, avatar: myCar })
      }
    })
  }, [playerName, myCar, setupChannelListeners, setSearchParams])

  // ── ONLINE: JOIN ROOM ──
  const joinRoom = useCallback((code: string) => {
    if (!playerName.trim() || !code.trim()) return
    localStorage.setItem('tr-name', playerName.trim())
    const finalCode = code.trim().toUpperCase()
    setRoomCode(finalCode)
    setIsHost(false)
    setLobbyPhase('waiting')
    setSearchParams({ room: finalCode }, { replace: true })

    const myId = myIdRef.current
    const ch = supabase.channel(`typeracer-${finalCode}`, {
      config: { broadcast: { self: false, ack: false }, presence: { key: myId } },
    })
    channelRef.current = ch
    setupChannelListeners(ch)

    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({ id: myId, name: playerName.trim(), isHost: false, avatar: myCar })
      }
    })
  }, [playerName, myCar, setupChannelListeners, setSearchParams])

  // ── ONLINE: HOST STARTS RACE ──
  const startOnlineRace = useCallback(() => {
    if (!channelRef.current || !isHost) return
    if (themeChoice === 'random') setActiveTheme(pickRandomTheme())
    const text = generateText(wordCount)
    const gamePlayers = onlinePlayers.map(p => ({ id: p.id, name: p.name, avatar: p.avatar }))

    channelRef.current.send({
      type: 'broadcast', event: 'race-start',
      payload: { text, wordCount, players: gamePlayers },
    })

    // Also start locally for host
    const newRacers: Racer[] = gamePlayers.map(gp => ({
      id: gp.id, name: gp.name, avatar: gp.avatar,
      isBot: false, progress: 0, wpm: 0, accuracy: 100, finished: false, finishTime: 0,
    }))
    setRacers(newRacers)
    setQuote(text)
    setTypedChars('')
    setErrors(0)
    setTotalKeystrokes(0)
    setElapsed(0)
    setGamePhase('countdown')
    setCountdown(3)
  }, [isHost, wordCount, onlinePlayers, themeChoice])

  // ── COUNTDOWN EFFECT ──
  useEffect(() => {
    if (gamePhase !== 'countdown') return
    let c = 3
    const interval = setInterval(() => {
      c--
      if (c > 0) { setCountdown(c) }
      else if (c === 0) { setCountdown(0) }
      else {
        clearInterval(interval)
        setGamePhase('racing')
        setStartTime(Date.now())
        setTimeout(() => inputRef.current?.focus(), 50)
      }
    }, 800)
    return () => clearInterval(interval)
  }, [gamePhase])

  // ── INIT RACERS (offline) ──
  const initRacers = useCallback((mode: PlayerMode) => {
    const you: Racer = {
      id: 'you', name: 'You', avatar: myCar,
      isBot: false, progress: 0, wpm: 0, accuracy: 100, finished: false, finishTime: 0,
    }
    const bots: Racer[] = []
    for (let i = 0; i < mode - 1; i++) {
      const profile = BOT_PROFILES[i]
      bots.push({
        id: `bot-${i}`, name: profile.name, avatar: profile.avatar,
        isBot: true, progress: 0, wpm: 0, accuracy: 90 + Math.random() * 9,
        finished: false, finishTime: 0,
      })
    }
    return [you, ...bots]
  }, [])

  // ── START OFFLINE GAME ──
  const startOfflineGame = useCallback(() => {
    if (themeChoice === 'random') setActiveTheme(pickRandomTheme())
    const q = generateText(wordCount)
    setQuote(q)
    setTypedChars('')
    setErrors(0)
    setTotalKeystrokes(0)
    setElapsed(0)
    setGamePhase('countdown')
    setCountdown(3)
    setRacers(initRacers(playerMode))
  }, [playerMode, wordCount, themeChoice, initRacers])

  // ── TIMER ──
  useEffect(() => {
    if (gamePhase === 'racing') {
      timerRef.current = setInterval(() => {
        setElapsed((Date.now() - startTime) / 1000)
      }, 100)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [gamePhase, startTime])

  // ── BROADCAST OWN PROGRESS (online) ──
  useEffect(() => {
    if (gamePhase !== 'racing' || gameMode !== 'online' || !channelRef.current) return
    const myId = myIdRef.current
    broadcastRef.current = setInterval(() => {
      channelRef.current?.send({
        type: 'broadcast', event: 'racer-progress',
        payload: { id: myId, progress, wpm, accuracy, finished: false, finishTime: 0 },
      })
    }, 200)
    return () => { if (broadcastRef.current) clearInterval(broadcastRef.current) }
  }, [gamePhase, gameMode, progress, wpm, accuracy])

  // ── BOT SIMULATION (offline only) ──
  useEffect(() => {
    if (gamePhase !== 'racing' || gameMode !== 'offline') {
      if (botIntervalRef.current) clearInterval(botIntervalRef.current)
      return
    }
    botIntervalRef.current = setInterval(() => {
      setRacers(prev => prev.map(r => {
        if (!r.isBot || r.finished) return r
        const profile = BOT_PROFILES.find((_, i) => r.id === `bot-${i}`) || BOT_PROFILES[0]
        const targetWpm = profile.baseWpm + (Math.random() - 0.5) * profile.variance
        const charsPerSecond = (targetWpm * 5) / 60
        const progressIncrement = (charsPerSecond * 0.1) / quote.length
        const newProgress = Math.min(r.progress + progressIncrement, 1)
        const newWpm = Math.round(targetWpm + (Math.random() - 0.5) * 5)
        const finished = newProgress >= 1
        return { ...r, progress: newProgress, wpm: newWpm, finished,
          finishTime: finished && !r.finished ? Date.now() : r.finishTime }
      }))
    }, 100)
    return () => { if (botIntervalRef.current) clearInterval(botIntervalRef.current) }
  }, [gamePhase, gameMode, quote.length])

  // ── UPDATE YOUR RACER ──
  const myId = gameMode === 'online' ? myIdRef.current : 'you'
  useEffect(() => {
    setRacers(prev => prev.map(r =>
      r.id === myId ? { ...r, progress, wpm, accuracy } : r
    ))
  }, [progress, wpm, accuracy, myId])

  // ── CHECK GAME END ──
  useEffect(() => {
    if (gamePhase === 'racing' && typedChars.length === quote.length && quote.length > 0) {
      setGamePhase('finished')
      if (timerRef.current) clearInterval(timerRef.current)
      if (botIntervalRef.current) clearInterval(botIntervalRef.current)
      if (broadcastRef.current) clearInterval(broadcastRef.current)
      const finishTime = Date.now()
      setRacers(prev => prev.map(r =>
        r.id === myId ? { ...r, finished: true, finishTime, progress: 1 } : r
      ))
      // Broadcast final state
      if (gameMode === 'online' && channelRef.current) {
        channelRef.current.send({
          type: 'broadcast', event: 'racer-progress',
          payload: { id: myIdRef.current, progress: 1, wpm, accuracy, finished: true, finishTime },
        })
      }
    }
  }, [typedChars.length, quote.length, gamePhase, myId, gameMode, wpm, accuracy])

  // ── STRICT MODE ──
  const getCurrentWordBounds = useCallback((pos: number) => {
    let wordStart = 0
    for (let i = pos - 1; i >= 0; i--) { if (quote[i] === ' ') { wordStart = i + 1; break } }
    let wordEnd = quote.length
    for (let i = pos; i < quote.length; i++) { if (quote[i] === ' ') { wordEnd = i; break } }
    return { wordStart, wordEnd }
  }, [quote])

  // ── TYPING HANDLER ──
  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (gamePhase !== 'racing') return
    const val = e.target.value
    if (val.length > quote.length) return

    if (strictMode && val.length > typedChars.length) {
      for (let i = typedChars.length; i < val.length; i++) {
        if (quote[i] === ' ') {
          const { wordStart } = getCurrentWordBounds(i)
          for (let j = wordStart; j < i; j++) { if (val[j] !== quote[j]) return }
        }
        if (val[i] !== quote[i] && i < val.length - 1) return
      }
    }

    if (val.length > typedChars.length) {
      const newCharsCount = val.length - typedChars.length
      setTotalKeystrokes(prev => prev + newCharsCount)
      for (let i = typedChars.length; i < val.length; i++) {
        if (val[i] !== quote[i]) {
          setErrors(prev => prev + 1)
        } else {
          const textEl = document.querySelector('.tr-text-display')
          if (textEl) {
            const charEls = textEl.querySelectorAll('.tr-char')
            if (charEls[i]) {
              const charRect = charEls[i].getBoundingClientRect()
              spawnBurst(charRect.left + charRect.width / 2, charRect.top + charRect.height / 2, '#00ff87')
            }
          }
        }
      }
    }
    setTypedChars(val)
  }, [gamePhase, quote, typedChars.length, strictMode, getCurrentWordBounds, spawnBurst])

  const handlePaste = useCallback((e: React.ClipboardEvent) => { e.preventDefault() }, [])

  // ── RENDER TEXT ──
  const renderedText = useMemo(() => {
    if (!quote) return null
    return quote.split('').map((char, i) => {
      let cls = 'tr-char ghost'
      if (i < typedChars.length) {
        cls = typedChars[i] === char ? 'tr-char correct' : 'tr-char incorrect'
      } else if (i === typedChars.length) {
        cls = 'tr-char current'
      }
      return (
        <span key={i} className={cls}>
          {i === typedChars.length && <span className="tr-cursor" />}
          {char}
        </span>
      )
    })
  }, [quote, typedChars])

  // ── LEADERBOARD ──
  const leaderboard = useMemo(() => {
    return [...racers].sort((a, b) => {
      if (a.finished && !b.finished) return -1
      if (!a.finished && b.finished) return 1
      if (a.finished && b.finished) return a.finishTime - b.finishTime
      return b.progress - a.progress
    })
  }, [racers])

  const hasError = typedChars.length > 0 && typedChars[typedChars.length - 1] !== quote[typedChars.length - 1]
  const fxClass = fxMode === 'neon' ? 'fx-neon' : fxMode === 'minimal' ? 'fx-minimal' : ''
  const dataTheme = activeTheme === 'neon' ? undefined : activeTheme

  // ── LEAVE ONLINE ROOM ──
  const leaveRoom = useCallback(() => {
    cleanupChannel()
    setLobbyPhase('none')
    setOnlinePlayers([])
    setRoomCode('')
    setGamePhase('idle')
    setSearchParams({}, { replace: true })
  }, [cleanupChannel, setSearchParams])

  // ── RESTART ──
  const handleRestart = useCallback(() => {
    if (gameMode === 'online') {
      if (isHost) startOnlineRace()
      // Non-host: wait for host to restart
    } else {
      startOfflineGame()
    }
  }, [gameMode, isHost, startOnlineRace, startOfflineGame])

  const handleBackToIdle = useCallback(() => {
    cleanupChannel()
    setGamePhase('idle')
    setLobbyPhase('none')
    setOnlinePlayers([])
    setRoomCode('')
    setSearchParams({}, { replace: true })
  }, [cleanupChannel, setSearchParams])

  // (joinCode declared above)

  return (
    <div className={`typeracer ${fxClass}`} data-theme={dataTheme}>
      {fxMode === 'particle' && <canvas ref={canvasRef} className="tr-particles-canvas" />}

      {/* ── HEADER ── */}
      <header className="tr-header">
        <div className="tr-header-left">
          <button className="tr-back-btn" onClick={() => navigate('/')}>&larr; Back</button>
          <span className="tr-title">TYPERACER</span>
          {gameMode === 'online' && roomCode && (
            <span className="tr-room-badge">Room: {roomCode}</span>
          )}
        </div>
        <div className="tr-header-right">
          {gameMode === 'offline' && (
            <div className="tr-selector">
              {([1, 2, 3, 4] as PlayerMode[]).map(m => (
                <button key={m} className={playerMode === m ? 'active' : ''}
                  onClick={() => { if (gamePhase === 'idle') setPlayerMode(m) }}>
                  {m === 1 ? 'Solo' : `${m}P`}
                </button>
              ))}
            </div>
          )}
          <span className="tr-fx-label">FX</span>
          <div className="tr-selector">
            {([['particle', 'Burst'], ['neon', 'Neon'], ['minimal', 'Min']] as [FxMode, string][]).map(([mode, label]) => (
              <button key={mode} className={fxMode === mode ? 'active' : ''} onClick={() => setFxMode(mode)}>
                {label}
              </button>
            ))}
          </div>
          <button className={`tr-music-btn ${musicOn ? 'active' : ''}`}
            onClick={() => setMusicOn(m => !m)} title={musicOn ? 'Mute music' : 'Play music'}>
            {musicOn ? '\u{1F50A}' : '\u{1F507}'}
          </button>
        </div>
      </header>

      {/* ── RACE TRACK ── */}
      <div className="tr-track-section">
        <div className="tr-track-title">Race Track</div>
        <div className="tr-track">
          {racers.map(racer => (
            <div key={racer.id}
              className={`tr-lane ${racer.id === myId ? 'is-you' : ''} ${racer.finished ? 'is-finished' : ''}`}>
              <div className="tr-lane-avatar">{racer.avatar}</div>
              <div className="tr-lane-info">
                <span className="tr-lane-name">{racer.name}</span>
                <span className="tr-lane-wpm">{racer.wpm} WPM</span>
              </div>
              <div className="tr-lane-bar-wrap">
                <div className="tr-lane-bar" style={{ width: `${Math.max(racer.progress * 100, 1)}%` }}>
                  <span className="tr-lane-bar-car">
                    {racer.finished ? '\u{1F3C1}' : '\u{1F3CE}\u{FE0F}'}
                  </span>
                </div>
                <span className="tr-lane-percent">{Math.round(racer.progress * 100)}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── TYPING AREA ── */}
      <div className="tr-typing-section">
        <div className={`tr-typing-card ${hasError ? 'has-error' : ''}`}>
          <div className="tr-text-display" onClick={() => inputRef.current?.focus()}>
            {gamePhase === 'idle' ? (
              <span className="tr-char ghost">Press START to begin the race...</span>
            ) : renderedText}
          </div>
          <input ref={inputRef} className="tr-typing-input" value={typedChars}
            onChange={handleInput} onPaste={handlePaste}
            autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
            disabled={gamePhase !== 'racing'} />
        </div>
      </div>

      {/* ── KEYBOARD TRAINER ── */}
      {(gamePhase === 'racing' || gamePhase === 'countdown') && (
        <KeyboardVisualizer nextChar={nextChar} showTrainer={showTrainer} />
      )}

      {/* ── STATS HUD ── */}
      <div className="tr-stats-hud">
        <div className="tr-stat-card">
          <span className="tr-stat-label">WPM</span>
          <span className="tr-stat-value wpm">{wpm}</span>
        </div>
        <div className="tr-stat-card">
          <span className="tr-stat-label">Accuracy</span>
          <span className="tr-stat-value accuracy">{accuracy}%</span>
        </div>
        <div className="tr-stat-card">
          <span className="tr-stat-label">Time</span>
          <span className="tr-stat-value time">{formatTime(elapsed)}</span>
        </div>
        <div className="tr-stat-card">
          <span className="tr-stat-label">Progress</span>
          <span className="tr-stat-value progress">{Math.round(progress * 100)}%</span>
        </div>
      </div>

      {/* ── IDLE START OVERLAY ── */}
      {gamePhase === 'idle' && lobbyPhase === 'none' && (
        <div className="tr-start-overlay">
          <div className="tr-start-card">
            <span className="tr-start-icon">{'\u{1F3CE}\u{FE0F}'}</span>
            <h1 className="tr-start-title">TYPERACER</h1>
            <p className="tr-start-sub">Race by typing faster than everyone else</p>
            <div className="tr-start-config">
              <div className="tr-start-row">
                <span className="tr-start-row-label">Mode</span>
                <div className="tr-selector">
                  <button className={gameMode === 'offline' ? 'active' : ''} onClick={() => setGameMode('offline')}>
                    Offline
                  </button>
                  <button className={gameMode === 'online' ? 'active' : ''} onClick={() => setGameMode('online')}>
                    Online
                  </button>
                </div>
              </div>
              <div className="tr-start-row">
                <span className="tr-start-row-label">Theme</span>
                <div className="tr-theme-picker">
                  <button className={`tr-theme-dot ${themeChoice === 'random' ? 'active' : ''}`}
                    data-dot="random" onClick={() => handleThemeChoice('random')} title="Random" />
                  {THEMES.map(t => (
                    <button key={t.id}
                      className={`tr-theme-dot ${themeChoice === t.id ? 'active' : ''}`}
                      data-dot={t.id} onClick={() => handleThemeChoice(t.id)} title={t.label} />
                  ))}
                </div>
              </div>
              {gameMode === 'offline' && (
                <div className="tr-start-row">
                  <span className="tr-start-row-label">Players</span>
                  <div className="tr-selector">
                    {([1, 2, 3, 4] as PlayerMode[]).map(m => (
                      <button key={m} className={playerMode === m ? 'active' : ''}
                        onClick={() => setPlayerMode(m)}>
                        {m === 1 ? 'Solo' : `${m}P`}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="tr-start-row">
                <span className="tr-start-row-label">Effects</span>
                <div className="tr-selector">
                  {([['particle', 'Burst'], ['neon', 'Neon'], ['minimal', 'Min']] as [FxMode, string][]).map(([mode, label]) => (
                    <button key={mode} className={fxMode === mode ? 'active' : ''}
                      onClick={() => setFxMode(mode)}>{label}</button>
                  ))}
                </div>
              </div>
              <div className="tr-start-row">
                <span className="tr-start-row-label">Words</span>
                <div className="tr-selector">
                  {WORD_COUNT_OPTIONS.map(n => (
                    <button key={n} className={wordCount === n ? 'active' : ''}
                      onClick={() => setWordCount(n)}>{n}</button>
                  ))}
                </div>
              </div>
              <div className="tr-start-row">
                <span className="tr-start-row-label">Strict</span>
                <button className={`tr-toggle ${strictMode ? 'active' : ''}`}
                  onClick={() => setStrictMode(s => !s)}>
                  <span className="tr-toggle-knob" />
                  <span className="tr-toggle-label">{strictMode ? 'ON' : 'OFF'}</span>
                </button>
              </div>
              <div className="tr-start-row">
                <span className="tr-start-row-label">Trainer</span>
                <button className={`tr-toggle ${showTrainer ? 'active' : ''}`}
                  onClick={() => setShowTrainer(s => !s)}>
                  <span className="tr-toggle-knob" />
                  <span className="tr-toggle-label">{showTrainer ? 'ON' : 'OFF'}</span>
                </button>
              </div>
              <div className="tr-start-row">
                <span className="tr-start-row-label">Music</span>
                <button className={`tr-toggle ${musicOn ? 'active' : ''}`}
                  onClick={() => setMusicOn(m => !m)}>
                  <span className="tr-toggle-knob" />
                  <span className="tr-toggle-label">{musicOn ? 'ON' : 'OFF'}</span>
                </button>
              </div>
            </div>
            {gameMode === 'offline' ? (
              <button className="tr-btn tr-btn-primary" onClick={startOfflineGame}>Start Race</button>
            ) : (
              <button className="tr-btn tr-btn-primary" onClick={() => setLobbyPhase('join')}>
                Play Online
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── ONLINE LOBBY ── */}
      {gamePhase === 'idle' && lobbyPhase === 'join' && (
        <div className="tr-start-overlay">
          <div className="tr-start-card">
            <h1 className="tr-start-title">{initialRoomRef.current ? 'JOIN RACE' : 'ONLINE RACE'}</h1>
            <p className="tr-start-sub">
              {initialRoomRef.current
                ? `You've been invited to room ${initialRoomRef.current.toUpperCase()}`
                : 'Create or join a room to race with friends'}
            </p>
            <div className="tr-start-config">
              <div className="tr-start-row">
                <span className="tr-start-row-label">Name</span>
                <input className="tr-lobby-input" placeholder="Your name..." value={playerName}
                  onChange={e => updateName(e.target.value)} maxLength={16} />
              </div>
              <div className="tr-start-row">
                <span className="tr-start-row-label">Car</span>
                <div className="tr-car-picker">
                  {CAR_OPTIONS.map(car => (
                    <button key={car} className={`tr-car-option ${myCar === car ? 'active' : ''}`}
                      onClick={() => updateCar(car)}>{car}</button>
                  ))}
                </div>
              </div>
              {initialRoomRef.current ? (
                <div className="tr-lobby-actions">
                  <button className="tr-btn tr-btn-primary" onClick={() => joinRoom(joinCode)}
                    disabled={!playerName.trim() || joinCode.length < 4}>
                    Join Room {joinCode}
                  </button>
                </div>
              ) : (
                <div className="tr-lobby-actions">
                  <button className="tr-btn tr-btn-primary" onClick={createRoom}
                    disabled={!playerName.trim()}>Create Room</button>
                  <div className="tr-lobby-join-row">
                    <input className="tr-lobby-input tr-lobby-code" placeholder="CODE"
                      value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
                      maxLength={6} />
                    <button className="tr-btn tr-btn-secondary" onClick={() => joinRoom(joinCode)}
                      disabled={!playerName.trim() || joinCode.length < 4}>Join</button>
                  </div>
                </div>
              )}
            </div>
            <button className="tr-btn tr-btn-secondary" onClick={() => { setLobbyPhase('none'); initialRoomRef.current = null }}>
              &larr; Back
            </button>
          </div>
        </div>
      )}

      {/* ── ONLINE WAITING ROOM ── */}
      {gamePhase === 'idle' && lobbyPhase === 'waiting' && (
        <div className="tr-start-overlay">
          <div className="tr-start-card">
            <h1 className="tr-start-title">WAITING ROOM</h1>
            <p className="tr-start-sub">
              Room Code: <strong className="tr-room-code-display">{roomCode}</strong>
            </p>
            <div className="tr-waiting-players">
              {onlinePlayers.map((p) => (
                <div key={p.id} className={`tr-waiting-player ${p.id === myIdRef.current ? 'is-you' : ''}`}>
                  <span className="tr-waiting-avatar">{p.avatar}</span>
                  <span className="tr-waiting-name">{p.name}</span>
                  {p.isHost && <span className="tr-waiting-host">HOST</span>}
                  {p.id === myIdRef.current && <span className="tr-waiting-you">YOU</span>}
                </div>
              ))}
              {onlinePlayers.length < 2 && (
                <p className="tr-waiting-hint">Waiting for players to join...</p>
              )}
            </div>
            <div className="tr-gameover-actions">
              {isHost && (
                <button className="tr-btn tr-btn-primary" onClick={startOnlineRace}
                  disabled={onlinePlayers.length < 2}>
                  Start Race ({onlinePlayers.length} players)
                </button>
              )}
              {!isHost && (
                <p className="tr-waiting-hint">Waiting for host to start...</p>
              )}
              <button className="tr-btn tr-btn-secondary" onClick={leaveRoom}>Leave</button>
            </div>
          </div>
        </div>
      )}

      {/* ── COUNTDOWN ── */}
      {gamePhase === 'countdown' && (
        <div className="tr-countdown-overlay">
          {countdown > 0 ? (
            <span key={countdown} className="tr-countdown-num">{countdown}</span>
          ) : (
            <span className="tr-countdown-go">GO!</span>
          )}
        </div>
      )}

      {/* ── GAME OVER ── */}
      {gamePhase === 'finished' && (
        <div className="tr-gameover-overlay">
          <div className="tr-gameover-card">
            <h1 className="tr-gameover-title">RACE COMPLETE</h1>
            <p className="tr-gameover-subtitle">
              {leaderboard[0]?.id === myId ? 'You won the race!' : `${leaderboard[0]?.name} wins!`}
            </p>
            <div className="tr-leaderboard">
              {leaderboard.map((racer, i) => (
                <div key={racer.id}
                  className={`tr-lb-row ${racer.id === myId ? 'is-you' : ''} ${i === 0 ? 'rank-1' : ''}`}>
                  <span className={`tr-lb-rank ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}`}>
                    #{i + 1}
                  </span>
                  <span className="tr-lb-avatar">{racer.avatar}</span>
                  <span className="tr-lb-name">{racer.name}</span>
                  <div className="tr-lb-stats">
                    <span className="tr-lb-wpm">{racer.wpm} WPM</span>
                    <span className="tr-lb-acc">{Math.round(racer.accuracy)}%</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="tr-gameover-actions">
              {(gameMode === 'offline' || isHost) && (
                <button className="tr-btn tr-btn-primary" onClick={handleRestart}>Race Again</button>
              )}
              {gameMode === 'online' && !isHost && (
                <p className="tr-waiting-hint">Waiting for host to restart...</p>
              )}
              <button className="tr-btn tr-btn-secondary" onClick={handleBackToIdle}>
                {gameMode === 'online' ? 'Leave Room' : 'Menu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
