import { useEffect, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { type Player, MAX_PLAYERS, PLAYER_COLORS, PLAYER_COLOR_NAMES, BOT_NAMES } from '../game/types'

interface WaitingRoomProps {
  channel: RealtimeChannel
  players: Player[]
  myId: string
  isHost: boolean
  roomCode: string
  onStart: (players: Player[]) => void
  onLeave: () => void
}

function getInviteLink(code: string): string {
  const url = new URL(window.location.href)
  url.searchParams.set('room', code)
  return url.toString()
}

export default function WaitingRoom({
  channel,
  players: initialPlayers,
  myId,
  isHost,
  roomCode,
  onStart,
  onLeave,
}: WaitingRoomProps) {
  const [players, setPlayers] = useState<Player[]>(initialPlayers)
  const [copied, setCopied] = useState(false)

  // Keep player list updated via presence
  useEffect(() => {
    const syncPlayers = () => {
      const presenceState = channel.presenceState()
      const playerList: Player[] = []
      for (const [, presences] of Object.entries(presenceState)) {
        const p = presences[0] as unknown as Player
        if (p?.id) playerList.push(p)
      }
      playerList.sort((a, b) => (a.isHost === b.isHost ? 0 : a.isHost ? -1 : 1))
      if (playerList.length > 0) {
        // Preserve bots when syncing presence (bots aren't in presence state)
        setPlayers((prev) => {
          const bots = prev.filter((p) => p.isBot)
          return [...playerList, ...bots]
        })
      }
    }

    channel.on('presence', { event: 'sync' }, syncPlayers)
    syncPlayers()

    // Listen for bot updates from host
    channel.on('broadcast', { event: 'bot-added' }, ({ payload }) => {
      setPlayers((prev) => [...prev, payload as Player])
    })
    channel.on('broadcast', { event: 'bot-removed' }, ({ payload }) => {
      const { botId } = payload as { botId: string }
      setPlayers((prev) => prev.filter((p) => p.id !== botId))
    })
  }, [channel])

  // Listen for host starting the game
  useEffect(() => {
    channel.on('broadcast', { event: 'game-start' }, ({ payload }) => {
      const { players: gamePlayers } = payload as { players: Player[] }
      if (gamePlayers) setPlayers(gamePlayers)
      onStart(gamePlayers || players)
    })
  }, [channel, onStart])

  const handleAddBot = () => {
    if (players.length >= MAX_PLAYERS) return
    const botCount = players.filter((p) => p.isBot).length
    const bot: Player = {
      id: `bot-${Date.now()}`,
      name: BOT_NAMES[botCount] || `Bot ${botCount + 1}`,
      isHost: false,
      isBot: true,
    }
    const updated = [...players, bot]
    setPlayers(updated)
    channel.send({
      type: 'broadcast',
      event: 'bot-added',
      payload: bot,
    })
  }

  const handleRemoveBot = (botId: string) => {
    const updated = players.filter((p) => p.id !== botId)
    setPlayers(updated)
    channel.send({
      type: 'broadcast',
      event: 'bot-removed',
      payload: { botId },
    })
  }

  const handleStart = () => {
    if (!isHost || players.length < 2) return
    channel.send({
      type: 'broadcast',
      event: 'game-start',
      payload: { players },
    })
    onStart(players)
  }

  const handleCopyLink = () => {
    navigator.clipboard.writeText(getInviteLink(roomCode))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="lobby">
      <div className="lobby-header">
        <h1>Waiting Room</h1>
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
      <a className="leave-link" onClick={onLeave}>
        Leave Room
      </a>
    </div>
  )
}
