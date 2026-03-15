import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../supabase'
import { type Player, type GameConfig, MAX_PLAYERS, PLAYER_COLORS, PLAYER_COLOR_NAMES, BOT_NAMES, DEFAULT_CONFIG } from '../game/types'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface LobbyProps {
  onGameStart: (
    channel: RealtimeChannel,
    players: Player[],
    myId: string,
    isHost: boolean,
    roomCode: string,
    config: GameConfig
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

export default function Lobby({ onGameStart, initialRoomCode }: LobbyProps) {
  const [screen, setScreen] = useState<'menu' | 'create' | 'join'>(
    initialRoomCode ? 'join' : 'menu'
  )
  const [playerName, setPlayerName] = useState(
    () => localStorage.getItem('snake-player-name') || ''
  )
  const [roomCode, setRoomCode] = useState(initialRoomCode || '')
  const [myId] = useState(() => generatePlayerId())
  const [players, setPlayers] = useState<Player[]>([])
  const [channel, setChannel] = useState<RealtimeChannel | null>(null)
  const [isHost, setIsHost] = useState(false)
  const [error, setError] = useState('')
  const [joining, setJoining] = useState(false)
  const [copied, setCopied] = useState(false)
  const [config, setConfig] = useState<GameConfig>(DEFAULT_CONFIG)

  // Ref so channel listener always calls the latest callback even after Lobby unmounts
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
      const ch = supabase.channel(`snake-room-${code}`, {
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
          if (p?.id) {
            playerList.push(p)
          }
        }
        playerList.sort((a, b) => (a.isHost === b.isHost ? 0 : a.isHost ? -1 : 1))
        setPlayers((prev) => {
          const bots = prev.filter((p) => p.isBot)
          return [...playerList, ...bots]
        })
      })

      // Guest receives these when host starts game or returns to room.
      // Uses refs so callbacks are always fresh even after Lobby unmounts.
      ch.on('broadcast', { event: 'game-start' }, ({ payload }) => {
        const { players: gamePlayers, config: gameConfig } = (payload || {}) as { players?: Player[]; config?: GameConfig }
        const finalConfig = gameConfig || DEFAULT_CONFIG
        if (gamePlayers) {
          onGameStartRef.current(ch, gamePlayers, myId, hosting, code, finalConfig)
        }
      })

      ch.on('broadcast', { event: 'bot-added' }, ({ payload }) => {
        setPlayers((prev) => [...prev, payload as Player])
      })
      ch.on('broadcast', { event: 'bot-removed' }, ({ payload }) => {
        const { botId } = payload as { botId: string }
        setPlayers((prev) => prev.filter((p) => p.id !== botId))
      })
      ch.on('broadcast', { event: 'config-update' }, ({ payload }) => {
        setConfig(payload as GameConfig)
      })

      ch.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await ch.track({
            id: myId,
            name: playerName.trim(),
            isHost: hosting,
          })
          setJoining(false)
        }
      })

      setChannel(ch)
      setRoomCode(code)
      setIsHost(hosting)

      // Persist for auto-rejoin on refresh
      localStorage.setItem('snake-room-code', code)
      localStorage.setItem('snake-is-host', hosting ? '1' : '0')

      const url = new URL(window.location.href)
      url.searchParams.set('room', code)
      window.history.replaceState({}, '', url.toString())
    },
    [myId, playerName, channel]
  )

  joinRoomRef.current = joinRoom

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

  const handleAddBot = () => {
    if (players.length >= MAX_PLAYERS) return
    const botCount = players.filter((p) => p.isBot).length
    const bot: Player = {
      id: `bot-${Date.now()}`,
      name: BOT_NAMES[botCount] || `Bot ${botCount + 1}`,
      isHost: false,
      isBot: true,
    }
    setPlayers((prev) => [...prev, bot])
    channel?.send({
      type: 'broadcast',
      event: 'bot-added',
      payload: bot,
    })
  }

  const handleRemoveBot = (botId: string) => {
    setPlayers((prev) => prev.filter((p) => p.id !== botId))
    channel?.send({
      type: 'broadcast',
      event: 'bot-removed',
      payload: { botId },
    })
  }

  const handleToggleWallPass = () => {
    const newConfig = { ...config, wallPass: !config.wallPass }
    setConfig(newConfig)
    channel?.send({
      type: 'broadcast',
      event: 'config-update',
      payload: newConfig,
    })
  }

  const handleStart = () => {
    if (!channel || players.length < 2) return
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

  // Auto-rejoin room on page refresh
  useEffect(() => {
    const code = initialRoomCode || localStorage.getItem('snake-room-code')
    const name = localStorage.getItem('snake-player-name')
    if (code && name && !channel) {
      const wasHost = localStorage.getItem('snake-is-host') === '1'
      const timer = setTimeout(() => {
        if (joinRoomRef.current) {
          setScreen('create')
          joinRoomRef.current(code, wasHost)
        }
      }, 100)
      return () => clearTimeout(timer)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (screen === 'menu') {
    return (
      <div className="lobby">
        <div className="lobby-header">
          <h1>Snake Arena</h1>
          <p className="subtitle">Multiplayer Snake Game</p>
        </div>
        <div className="lobby-form">
          <input
            type="text"
            placeholder="Your name"
            value={playerName}
            onChange={(e) => {
              setPlayerName(e.target.value)
              localStorage.setItem('snake-player-name', e.target.value)
            }}
            maxLength={12}
            className="input"
          />
          <button className="btn btn-primary" onClick={handleCreate}>
            Create Room
          </button>
          <button className="btn btn-secondary" onClick={() => setScreen('join')}>
            Join Room
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    )
  }

  if (screen === 'join' && !channel) {
    return (
      <div className="lobby">
        <div className="lobby-header">
          <h1>Join Room</h1>
        </div>
        <div className="lobby-form">
          <input
            type="text"
            placeholder="Your name"
            value={playerName}
            onChange={(e) => {
              setPlayerName(e.target.value)
              localStorage.setItem('snake-player-name', e.target.value)
            }}
            maxLength={12}
            className="input"
          />
          <input
            type="text"
            placeholder="Room code"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            maxLength={6}
            className="input"
          />
          <button className="btn btn-primary" onClick={handleJoin} disabled={joining}>
            {joining ? 'Joining...' : 'Join'}
          </button>
          <button className="btn btn-secondary" onClick={() => { setScreen('menu'); setRoomCode('') }}>
            Back
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    )
  }

  // Waiting room (after creating/joining)
  return (
    <div className="lobby">
      <div className="lobby-header">
        <h1>Room Ready</h1>
        <p className="room-code">
          Room ID: <span>{roomCode}</span>
          <button className="btn-copy" onClick={handleCopyLink}>
            {copied ? 'Copied!' : 'Copy Invite Link'}
          </button>
        </p>
        <p className="subtitle">
          {players.length}/{MAX_PLAYERS} players
        </p>
      </div>
      <div className="player-list">
        {players.map((p, i) => (
          <div key={p.id} className="player-card">
            <span
              className="player-dot"
              style={{ background: PLAYER_COLORS[i] }}
            />
            <span className="player-name">
              {p.name} {p.isHost && '(Host)'} {p.id === myId && '(You)'} {p.isBot && '(Bot)'}
            </span>
            <span className="player-color">{PLAYER_COLOR_NAMES[i]}</span>
            {isHost && p.isBot && (
              <button className="btn-remove-bot" onClick={() => handleRemoveBot(p.id)}>
                &times;
              </button>
            )}
          </div>
        ))}
        {Array.from({ length: MAX_PLAYERS - players.length }).map((_, i) => (
          <div key={`empty-${i}`} className="player-card empty">
            <span className="player-dot" />
            <span className="player-name">Waiting...</span>
          </div>
        ))}
      </div>
      <div className="game-config">
        <label className="config-toggle" onClick={isHost ? handleToggleWallPass : undefined}>
          <span className={`toggle-switch ${config.wallPass ? 'on' : ''}`}>
            <span className="toggle-knob" />
          </span>
          <span className="config-label">Wall Pass</span>
          {!isHost && <span className="config-hint">(host only)</span>}
        </label>
      </div>

      {isHost && players.length < MAX_PLAYERS && (
        <button className="btn btn-secondary" onClick={handleAddBot}>
          + Add Bot
        </button>
      )}
      {isHost ? (
        <button
          className="btn btn-primary"
          onClick={handleStart}
          disabled={players.length < 2}
        >
          {players.length < 2 ? 'Need at least 2 players' : 'Start Game'}
        </button>
      ) : (
        <p className="waiting-text">Waiting for host to start...</p>
      )}
    </div>
  )
}
