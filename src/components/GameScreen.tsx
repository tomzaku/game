import { useState, useEffect, useRef, useCallback } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { type GameState, type GameConfig, type Player, type Direction, TICK_RATE } from '../game/types'
import { createInitialState, applyDirection, tick } from '../game/engine'
import { computeBotDirection } from '../game/bot'
import GameCanvas from './GameCanvas'
import GameOver from './GameOver'

interface GameScreenProps {
  channel: RealtimeChannel
  players: Player[]
  myId: string
  isHost: boolean
  config: GameConfig
  onBackToRoom: () => void
  onLeave: () => void
}

export default function GameScreen({
  channel,
  players,
  myId,
  isHost,
  config,
  onBackToRoom,
  onLeave,
}: GameScreenProps) {
  const [gameState, setGameState] = useState<GameState>(() =>
    createInitialState(players, config)
  )
  const gameRef = useRef(gameState)
  gameRef.current = gameState

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Host: listen for direction changes from other players
  useEffect(() => {
    if (!isHost) {
      // Non-host: listen for state updates
      channel.on('broadcast', { event: 'game-state' }, ({ payload }) => {
        setGameState(payload as GameState)
      })
    } else {
      // Host: listen for direction changes
      channel.on('broadcast', { event: 'direction' }, ({ payload }) => {
        const { playerId, direction } = payload as {
          playerId: string
          direction: Direction
        }
        applyDirection(gameRef.current, playerId, direction)
      })
    }

    return () => {
      // Channel listeners are cleaned up when channel is removed
    }
  }, [channel, isHost])

  // Host: run game loop
  useEffect(() => {
    if (!isHost) return

    // Start game after a short delay
    const startTimeout = setTimeout(() => {
      setGameState((prev) => {
        const next = { ...prev, started: true }
        gameRef.current = next
        return next
      })

      // Game tick
      timerRef.current = setInterval(() => {
        const state = gameRef.current
        if (state.gameOver) {
          if (timerRef.current) clearInterval(timerRef.current)
          if (countdownRef.current) clearInterval(countdownRef.current)
          return
        }

        // Compute bot directions
        const botPlayers = players.filter((p) => p.isBot)
        for (const bot of botPlayers) {
          const dir = computeBotDirection(state, bot.id)
          if (dir) applyDirection(state, bot.id, dir)
        }

        const newState = tick({ ...state, snakes: state.snakes.map((s) => ({ ...s, body: [...s.body] })), fruits: [...state.fruits], freezeItems: [...state.freezeItems], reverseItems: [...state.reverseItems] })
        gameRef.current = newState
        setGameState(newState)

        // Broadcast to other players
        channel.send({
          type: 'broadcast',
          event: 'game-state',
          payload: newState,
        })
      }, TICK_RATE)

      // Countdown timer
      countdownRef.current = setInterval(() => {
        const state = gameRef.current
        if (state.gameOver || state.timeLeft <= 0) {
          if (countdownRef.current) clearInterval(countdownRef.current)
          if (state.timeLeft <= 0 && !state.gameOver) {
            const finalState = { ...state, gameOver: true }
            gameRef.current = finalState
            setGameState(finalState)
            channel.send({
              type: 'broadcast',
              event: 'game-state',
              payload: finalState,
            })
          }
          return
        }

        const updated = { ...state, timeLeft: state.timeLeft - 1 }
        gameRef.current = updated
        setGameState(updated)
      }, 1000)
    }, 1500) // 1.5s countdown before start

    return () => {
      clearTimeout(startTimeout)
      if (timerRef.current) clearInterval(timerRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [isHost, channel])

  // Listen for back-to-room event from host
  useEffect(() => {
    channel.on('broadcast', { event: 'back-to-room' }, () => {
      onBackToRoom()
    })
  }, [channel, onBackToRoom])

  const handleBackToRoom = useCallback(() => {
    if (isHost) {
      channel.send({
        type: 'broadcast',
        event: 'back-to-room',
        payload: {},
      })
    }
    onBackToRoom()
  }, [isHost, channel, onBackToRoom])

  // Send direction to host (or apply locally if host)
  const handleDirection = useCallback(
    (dir: Direction) => {
      if (isHost) {
        applyDirection(gameRef.current, myId, dir)
      } else {
        channel.send({
          type: 'broadcast',
          event: 'direction',
          payload: { playerId: myId, direction: dir },
        })
      }
    },
    [isHost, myId, channel]
  )

  const mySnake = gameState.snakes.find((s) => s.id === myId)

  return (
    <div className="game-screen">
      <div className="game-hud">
        <div className="hud-left">
          <div className="timer" data-urgent={gameState.timeLeft <= 10}>
            {Math.floor(gameState.timeLeft / 60)}:
            {String(gameState.timeLeft % 60).padStart(2, '0')}
          </div>
        </div>
        <div className="hud-center">
          {!gameState.started && <div className="get-ready">Get Ready...</div>}
        </div>
        <div className="hud-right">
          {gameState.snakes.map((s) => (
            <div
              key={s.id}
              className={`hud-player ${!s.alive ? 'dead' : ''}`}
            >
              <span className="hud-dot" style={{ background: s.color }} />
              <span className="hud-name">{s.name}</span>
              <span className="hud-score">{s.score}</span>
            </div>
          ))}
        </div>
      </div>

      <GameCanvas
        gameState={gameState}
        myId={myId}
        onDirection={handleDirection}
      />

      {mySnake && !mySnake.alive && !gameState.gameOver && (
        <div className="eliminated-banner">You were eliminated!</div>
      )}

      <div className="controls-hint desktop-only">
        Arrow keys or WASD to move
      </div>

      <div className="dpad mobile-only">
        <button className="dpad-btn dpad-up" onTouchStart={(e) => { e.preventDefault(); handleDirection('UP') }}>
          <svg viewBox="0 0 24 24" width="24" height="24"><path d="M12 4l-8 8h16z" fill="currentColor"/></svg>
        </button>
        <button className="dpad-btn dpad-left" onTouchStart={(e) => { e.preventDefault(); handleDirection('LEFT') }}>
          <svg viewBox="0 0 24 24" width="24" height="24"><path d="M4 12l8-8v16z" fill="currentColor"/></svg>
        </button>
        <button className="dpad-btn dpad-right" onTouchStart={(e) => { e.preventDefault(); handleDirection('RIGHT') }}>
          <svg viewBox="0 0 24 24" width="24" height="24"><path d="M20 12l-8-8v16z" fill="currentColor"/></svg>
        </button>
        <button className="dpad-btn dpad-down" onTouchStart={(e) => { e.preventDefault(); handleDirection('DOWN') }}>
          <svg viewBox="0 0 24 24" width="24" height="24"><path d="M12 20l8-8H4z" fill="currentColor"/></svg>
        </button>
      </div>

      {gameState.gameOver && (
        <GameOver
          gameState={gameState}
          myId={myId}
          isHost={isHost}
          onBackToRoom={handleBackToRoom}
          onLeave={onLeave}
        />
      )}
    </div>
  )
}
