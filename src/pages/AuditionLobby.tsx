import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { type Player, MAX_PLAYERS, PLAYER_COLORS, PLAYER_COLOR_NAMES } from '../game/types'
import type { RealtimeChannel } from '@supabase/supabase-js'
import './AuditionGame.css'

type Difficulty = 'easy' | 'normal' | 'hard'

export interface AuditionConfig {
  difficulty: Difficulty
}

interface AuditionLobbyProps {
  onGameStart: (
    channel: RealtimeChannel,
    players: Player[],
    myId: string,
    isHost: boolean,
    roomCode: string,
    config: AuditionConfig,
  ) => void
  initialRoomCode?: string
}

function generateRoomCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

function generatePlayerId(): string {
  return crypto.randomUUID()
}

function getInviteLink(code: string): string {
  const url = new URL(window.location.href)
  url.searchParams.set('room', code)
  return url.toString()
}

export default function AuditionLobby({ onGameStart, initialRoomCode }: AuditionLobbyProps) {
  const navigate = useNavigate()
  const [screen, setScreen] = useState<'menu' | 'create' | 'join'>(
    initialRoomCode ? 'join' : 'menu',
  )
  const [playerName, setPlayerName] = useState(
    () => localStorage.getItem('audition-player-name') || '',
  )
  const [roomCode, setRoomCode] = useState(initialRoomCode || '')
  const [myId] = useState(() => generatePlayerId())
  const [players, setPlayers] = useState<Player[]>([])
  const [channel, setChannel] = useState<RealtimeChannel | null>(null)
  const [isHost, setIsHost] = useState(false)
  const [error, setError] = useState('')
  const [joining, setJoining] = useState(false)
  const [copied, setCopied] = useState(false)
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')

  const onGameStartRef = useRef(onGameStart)
  onGameStartRef.current = onGameStart
  const joinRoomRef = useRef<((code: string, hosting: boolean) => void) | null>(null)

  const joinRoom = useCallback(
    (code: string, hosting: boolean) => {
      if (!playerName.trim()) {
        setError('Enter your name')
        return
      }
      if (channel) return

      setJoining(true)
      setError('')
      const ch = supabase.channel(`audition-room-${code}`, {
        config: {
          broadcast: { self: false, ack: false },
          presence: { key: myId },
        },
      })

      ch.on('presence', { event: 'sync' }, () => {
        const presenceState = ch.presenceState()
        const playerList: Player[] = []
        for (const [, presences] of Object.entries(presenceState)) {
          const p = presences[0] as unknown as Player
          if (p?.id) playerList.push(p)
        }
        playerList.sort((a, b) => (a.isHost === b.isHost ? 0 : a.isHost ? -1 : 1))
        setPlayers(playerList)
      })

      ch.on('broadcast', { event: 'game-start' }, ({ payload }) => {
        const { players: gamePlayers, config: gameConfig } = (payload || {}) as {
          players?: Player[]
          config?: AuditionConfig
        }
        if (gamePlayers && gameConfig) {
          onGameStartRef.current(ch, gamePlayers, myId, hosting, code, gameConfig)
        }
      })

      ch.on('broadcast', { event: 'config-update' }, ({ payload }) => {
        const { difficulty: d } = payload as { difficulty: Difficulty }
        setDifficulty(d)
      })

      ch.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await ch.track({ id: myId, name: playerName.trim(), isHost: hosting })
          setJoining(false)
        }
      })

      setChannel(ch)
      setRoomCode(code)
      setIsHost(hosting)

      localStorage.setItem('audition-room-code', code)
      localStorage.setItem('audition-is-host', hosting ? '1' : '0')
      localStorage.setItem('audition-player-name', playerName.trim())

      const url = new URL(window.location.href)
      url.searchParams.set('room', code)
      window.history.replaceState({}, '', url.toString())
    },
    [myId, playerName, channel],
  )

  joinRoomRef.current = joinRoom

  // Auto-rejoin on refresh
  useEffect(() => {
    const code = initialRoomCode || localStorage.getItem('audition-room-code')
    const name = localStorage.getItem('audition-player-name')
    if (code && name && !channel) {
      const wasHost = localStorage.getItem('audition-is-host') === '1'
      const timer = setTimeout(() => {
        if (joinRoomRef.current) {
          setScreen('create')
          joinRoomRef.current(code, wasHost)
        }
      }, 100)
      return () => clearTimeout(timer)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = () => {
    const code = generateRoomCode()
    setRoomCode(code)
    joinRoom(code, true)
    setScreen('create')
  }

  const handleJoin = () => {
    if (!roomCode.trim()) {
      setError('Enter a room code')
      return
    }
    joinRoom(roomCode.trim().toUpperCase(), false)
  }

  const handleDifficultyChange = (d: Difficulty) => {
    setDifficulty(d)
    channel?.send({ type: 'broadcast', event: 'config-update', payload: { difficulty: d } })
  }

  const handleStart = () => {
    if (!channel || players.length < 2) return
    const config: AuditionConfig = { difficulty }
    channel.send({
      type: 'broadcast',
      event: 'game-start',
      payload: { players, config },
    })
    onGameStart(channel, players, myId, true, roomCode, config)
  }

  const handleCopyLink = () => {
    navigator.clipboard.writeText(getInviteLink(roomCode))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const saveName = (v: string) => {
    setPlayerName(v)
    localStorage.setItem('audition-player-name', v)
  }

  // Menu
  if (screen === 'menu') {
    return (
      <div className="audition-root">
        <div className="audition-bg-grid" />
        <button className="audition-back-btn" onClick={() => navigate('/')}>← Back</button>
        <div className="audition-setup">
          <h1 className="audition-title">Audition</h1>
          <p className="audition-subtitle">Online Rhythm Battle</p>
          <div className="audition-player-select">
            <input
              type="text"
              placeholder="Your name"
              value={playerName}
              onChange={(e) => saveName(e.target.value)}
              maxLength={12}
              className="audition-name-input"
            />
            <button className="audition-start-btn" onClick={handleCreate}>Create Room</button>
            <button className="audition-diff-btn active" onClick={() => setScreen('join')} style={{ width: '100%', maxWidth: 300 }}>
              Join Room
            </button>
          </div>
          {error && <p style={{ color: '#ff2255', marginTop: 12 }}>{error}</p>}
        </div>
      </div>
    )
  }

  // Join screen
  if (screen === 'join' && !channel) {
    return (
      <div className="audition-root">
        <div className="audition-bg-grid" />
        <button className="audition-back-btn" onClick={() => { setScreen('menu'); setRoomCode('') }}>← Back</button>
        <div className="audition-setup">
          <h1 className="audition-title">Join Room</h1>
          <div className="audition-player-select">
            <input
              type="text"
              placeholder="Your name"
              value={playerName}
              onChange={(e) => saveName(e.target.value)}
              maxLength={12}
              className="audition-name-input"
            />
            <input
              type="text"
              placeholder="Room code"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              maxLength={6}
              className="audition-name-input"
            />
            <button className="audition-start-btn" onClick={handleJoin} disabled={joining}>
              {joining ? 'Joining...' : 'Join'}
            </button>
          </div>
          {error && <p style={{ color: '#ff2255', marginTop: 12 }}>{error}</p>}
        </div>
      </div>
    )
  }

  // Waiting room
  return (
    <div className="audition-root">
      <div className="audition-bg-grid" />
      <button className="audition-back-btn" onClick={() => navigate('/')}>← Back</button>
      <div className="audition-setup">
        <h1 className="audition-title">Room Ready</h1>
        <p className="audition-subtitle" style={{ marginBottom: 24 }}>
          {roomCode} · {players.length}/{MAX_PLAYERS} players
          <button
            className="audition-diff-btn"
            style={{ marginLeft: 12, padding: '4px 12px', fontSize: 10, letterSpacing: 1 }}
            onClick={handleCopyLink}
          >
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </p>

        <div className="audition-players-area" style={{ flexDirection: 'column', gap: 8, width: '100%', maxWidth: 360 }}>
          {players.map((p, i) => (
            <div key={p.id} className="audition-player-panel" style={{
              '--player-color': PLAYER_COLORS[i],
              flexDirection: 'row',
              justifyContent: 'space-between',
              minWidth: 0,
              padding: '10px 16px',
            } as React.CSSProperties}>
              <span style={{ color: PLAYER_COLORS[i], fontFamily: "'Orbitron', sans-serif", fontSize: 13, fontWeight: 600 }}>
                {p.name} {p.isHost && '(Host)'} {p.id === myId && '(You)'}
              </span>
              <span style={{ color: '#4a5070', fontSize: 12 }}>{PLAYER_COLOR_NAMES[i]}</span>
            </div>
          ))}
          {Array.from({ length: MAX_PLAYERS - players.length }).map((_, i) => (
            <div key={`empty-${i}`} className="audition-player-panel" style={{
              flexDirection: 'row', minWidth: 0, padding: '10px 16px', opacity: 0.3,
            }}>
              <span style={{ color: '#4a5070', fontSize: 13 }}>Waiting...</span>
            </div>
          ))}
        </div>

        {isHost && (
          <>
            <label style={{ marginTop: 20, fontFamily: "'Orbitron', sans-serif", fontSize: 12, letterSpacing: 3, color: '#4a5070', textTransform: 'uppercase' as const }}>
              Difficulty
            </label>
            <div className="audition-difficulty">
              {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
                <button
                  key={d}
                  className={`audition-diff-btn ${difficulty === d ? 'active' : ''}`}
                  onClick={() => handleDifficultyChange(d)}
                >
                  {d}
                </button>
              ))}
            </div>
          </>
        )}
        {!isHost && (
          <p style={{ color: '#4a5070', fontSize: 13, marginTop: 16 }}>
            Difficulty: <span style={{ color: '#ff00aa' }}>{difficulty.toUpperCase()}</span>
          </p>
        )}

        {isHost ? (
          <button
            className="audition-start-btn"
            onClick={handleStart}
            disabled={players.length < 2}
            style={{ marginTop: 20 }}
          >
            {players.length < 2 ? 'Need 2+ Players' : 'Start'}
          </button>
        ) : (
          <p style={{ color: '#4a5070', marginTop: 20, fontSize: 13 }}>Waiting for host to start...</p>
        )}
      </div>
    </div>
  )
}
