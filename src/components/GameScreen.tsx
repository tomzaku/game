import { useState, useEffect, useRef, useCallback } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { type GameState, type GameConfig, type Player, type Direction, TICK_RATE } from '../game/types'
import { createInitialState, applyDirection, tick } from '../game/engine'
import { computeBotDirection } from '../game/bot'
import { SnakeMusic } from '../game/music'
import GameCanvas from './GameCanvas'
import GameOver from './GameOver'

interface GameScreenProps {
  channel: RealtimeChannel
  players: Player[]
  myId: string
  isHost: boolean
  config: GameConfig
  onLeave: () => void
}

export default function GameScreen({
  channel,
  players,
  myId,
  isHost,
  config,
  onLeave,
}: GameScreenProps) {
  const [gameState, setGameState] = useState<GameState>(() =>
    createInitialState(players, config)
  )
  const gameRef = useRef(gameState)
  gameRef.current = gameState

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const musicRef = useRef<SnakeMusic | null>(null)
  const prevScoresRef = useRef<Record<string, number>>({})
  const prevAliveRef = useRef<Record<string, boolean>>({})
  const prevFreezeRef = useRef<number>(0)
  const gameOverSoundPlayed = useRef(false)
  const mountedRef = useRef(true)

  // Start music when game mounts, stop on unmount
  useEffect(() => {
    mountedRef.current = true
    const music = new SnakeMusic()
    music.start()
    musicRef.current = music

    const scores: Record<string, number> = {}
    const alive: Record<string, boolean> = {}
    for (const s of gameState.snakes) {
      scores[s.id] = s.score
      alive[s.id] = s.alive
    }
    prevScoresRef.current = scores
    prevAliveRef.current = alive
    prevFreezeRef.current = 0
    gameOverSoundPlayed.current = false

    return () => {
      mountedRef.current = false
      music.stop()
      musicRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Detect score changes, deaths, freeze pickups for SFX
  useEffect(() => {
    const music = musicRef.current
    if (!music) return

    if (gameState.gameOver && !gameOverSoundPlayed.current) {
      gameOverSoundPlayed.current = true
      music.playGameOver()
      return
    }

    for (const s of gameState.snakes) {
      if (s.score > (prevScoresRef.current[s.id] ?? 0)) music.playEat()
      if (!s.alive && (prevAliveRef.current[s.id] ?? true)) music.playDeath()
    }

    const totalFreezeNow = gameState.snakes.reduce((n, s) => n + (s.frozenTicks > 0 ? 1 : 0), 0)
    if (totalFreezeNow > prevFreezeRef.current) music.playFreeze()
    prevFreezeRef.current = totalFreezeNow

    const scores: Record<string, number> = {}
    const alive: Record<string, boolean> = {}
    for (const s of gameState.snakes) {
      scores[s.id] = s.score
      alive[s.id] = s.alive
    }
    prevScoresRef.current = scores
    prevAliveRef.current = alive
  }, [gameState])

  // Channel listeners — use mountedRef to ignore events after unmount
  useEffect(() => {
    if (!isHost) {
      channel.on('broadcast', { event: 'game-state' }, ({ payload }) => {
        if (!mountedRef.current) return
        setGameState(payload as GameState)
      })
    } else {
      channel.on('broadcast', { event: 'direction' }, ({ payload }) => {
        if (!mountedRef.current) return
        const { playerId, direction } = payload as {
          playerId: string
          direction: Direction
        }
        applyDirection(gameRef.current, playerId, direction)
      })
    }

  }, [channel, isHost])

  // Host: run game loop
  useEffect(() => {
    if (!isHost) return

    const startTimeout = setTimeout(() => {
      setGameState((prev) => {
        const next = { ...prev, started: true }
        gameRef.current = next
        return next
      })

      timerRef.current = setInterval(() => {
        const state = gameRef.current
        if (state.gameOver) {
          if (timerRef.current) clearInterval(timerRef.current)
          if (countdownRef.current) clearInterval(countdownRef.current)
          return
        }

        const botPlayers = players.filter((p) => p.isBot)
        for (const bot of botPlayers) {
          const dir = computeBotDirection(state, bot.id)
          if (dir) applyDirection(state, bot.id, dir)
        }

        const newState = tick({ ...state, snakes: state.snakes.map((s) => ({ ...s, body: [...s.body] })), fruits: [...state.fruits], freezeItems: [...state.freezeItems], reverseItems: [...state.reverseItems] })
        gameRef.current = newState
        setGameState(newState)

        channel.send({
          type: 'broadcast',
          event: 'game-state',
          payload: newState,
        })
      }, TICK_RATE)

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
    }, 1500)

    return () => {
      clearTimeout(startTimeout)
      if (timerRef.current) clearInterval(timerRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [isHost, channel])

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

      <div className="controls-hint mobile-only">
        Swipe to move
      </div>

      {gameState.gameOver && (
        <GameOver
          gameState={gameState}
          myId={myId}
          isHost={isHost}
          onLeave={onLeave}
        />
      )}
    </div>
  )
}
