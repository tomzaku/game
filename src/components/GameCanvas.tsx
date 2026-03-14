import { useEffect, useRef, useCallback } from 'react'
import type { GameState } from '../game/types'

interface GameCanvasProps {
  gameState: GameState
  myId: string
  onDirection: (dir: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT') => void
}

const CELL_SIZE = 18
const GAP = 1

export default function GameCanvas({
  gameState,
  myId,
  onDirection,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault()
          onDirection('UP')
          break
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault()
          onDirection('DOWN')
          break
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault()
          onDirection('LEFT')
          break
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault()
          onDirection('RIGHT')
          break
      }
    },
    [onDirection]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Touch controls
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    touchStart.current = { x: touch.clientX, y: touch.clientY }
  }, [])

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStart.current) return
      const touch = e.changedTouches[0]
      const dx = touch.clientX - touchStart.current.x
      const dy = touch.clientY - touchStart.current.y
      const absDx = Math.abs(dx)
      const absDy = Math.abs(dy)

      if (Math.max(absDx, absDy) < 20) return // too small

      if (absDx > absDy) {
        onDirection(dx > 0 ? 'RIGHT' : 'LEFT')
      } else {
        onDirection(dy > 0 ? 'DOWN' : 'UP')
      }
      touchStart.current = null
    },
    [onDirection]
  )

  // Render
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const size = gameState.gridSize * (CELL_SIZE + GAP) + GAP
    canvas.width = size
    canvas.height = size

    // Background
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, size, size)

    // Grid
    ctx.fillStyle = '#16213e'
    for (let x = 0; x < gameState.gridSize; x++) {
      for (let y = 0; y < gameState.gridSize; y++) {
        ctx.fillRect(
          x * (CELL_SIZE + GAP) + GAP,
          y * (CELL_SIZE + GAP) + GAP,
          CELL_SIZE,
          CELL_SIZE
        )
      }
    }

    // Fruits
    for (const fruit of gameState.fruits) {
      const fx = fruit.x * (CELL_SIZE + GAP) + GAP
      const fy = fruit.y * (CELL_SIZE + GAP) + GAP
      ctx.fillStyle = '#ef4444'
      ctx.beginPath()
      ctx.arc(
        fx + CELL_SIZE / 2,
        fy + CELL_SIZE / 2,
        CELL_SIZE / 2 - 1,
        0,
        Math.PI * 2
      )
      ctx.fill()
      // Shine
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.beginPath()
      ctx.arc(
        fx + CELL_SIZE / 2 - 2,
        fy + CELL_SIZE / 2 - 2,
        3,
        0,
        Math.PI * 2
      )
      ctx.fill()
    }

    // Snakes
    for (const snake of gameState.snakes) {
      if (snake.body.length === 0) continue
      const isMe = snake.id === myId
      const alpha = snake.alive ? 1 : 0.3

      for (let i = 0; i < snake.body.length; i++) {
        const seg = snake.body[i]
        const sx = seg.x * (CELL_SIZE + GAP) + GAP
        const sy = seg.y * (CELL_SIZE + GAP) + GAP

        ctx.globalAlpha = alpha
        ctx.fillStyle = snake.color
        const radius = 4
        ctx.beginPath()
        ctx.roundRect(sx, sy, CELL_SIZE, CELL_SIZE, radius)
        ctx.fill()

        // Head
        if (i === 0) {
          // Eyes
          ctx.globalAlpha = alpha
          ctx.fillStyle = '#fff'
          const eyeSize = 3
          let e1x: number, e1y: number, e2x: number, e2y: number
          switch (snake.direction) {
            case 'UP':
              e1x = sx + 4
              e1y = sy + 4
              e2x = sx + CELL_SIZE - 4 - eyeSize
              e2y = sy + 4
              break
            case 'DOWN':
              e1x = sx + 4
              e1y = sy + CELL_SIZE - 4 - eyeSize
              e2x = sx + CELL_SIZE - 4 - eyeSize
              e2y = sy + CELL_SIZE - 4 - eyeSize
              break
            case 'LEFT':
              e1x = sx + 4
              e1y = sy + 4
              e2x = sx + 4
              e2y = sy + CELL_SIZE - 4 - eyeSize
              break
            case 'RIGHT':
              e1x = sx + CELL_SIZE - 4 - eyeSize
              e1y = sy + 4
              e2x = sx + CELL_SIZE - 4 - eyeSize
              e2y = sy + CELL_SIZE - 4 - eyeSize
              break
          }
          ctx.beginPath()
          ctx.arc(e1x + eyeSize / 2, e1y + eyeSize / 2, eyeSize, 0, Math.PI * 2)
          ctx.fill()
          ctx.beginPath()
          ctx.arc(e2x + eyeSize / 2, e2y + eyeSize / 2, eyeSize, 0, Math.PI * 2)
          ctx.fill()

          // Outline for own snake
          if (isMe && snake.alive) {
            ctx.strokeStyle = '#fff'
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.roundRect(sx, sy, CELL_SIZE, CELL_SIZE, radius)
            ctx.stroke()
          }
        }
      }
      ctx.globalAlpha = 1
    }
  }, [gameState, myId])

  return (
    <canvas
      ref={canvasRef}
      className="game-canvas"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    />
  )
}
