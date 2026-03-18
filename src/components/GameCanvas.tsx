import { useEffect, useRef, useCallback, useState } from 'react'
import nipplejs from 'nipplejs'
import type { GameState } from '../game/types'

interface GameCanvasProps {
  gameState: GameState
  myId: string
  onDirection: (dir: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT') => void
}

const GAP = 1

export default function GameCanvas({
  gameState,
  myId,
  onDirection,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const joystickRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [cellSize, setCellSize] = useState(18)

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

  // Dynamic cell size based on available space
  useEffect(() => {
    const update = () => {
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      // Use the smaller dimension, leave some padding for HUD
      const available = Math.min(rect.width, rect.height)
      const grid = gameState.gridSize
      const newCellSize = Math.floor((available - (grid + 1) * GAP) / grid)
      setCellSize(Math.max(8, Math.min(newCellSize, 40)))
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [gameState.gridSize])

  // Nipplejs joystick for mobile
  useEffect(() => {
    const zone = joystickRef.current
    if (!zone) return

    const manager = nipplejs.create({
      zone,
      mode: 'static',
      position: { left: '50%', top: '50%' },
      color: '#22c55e',
      size: 120,
      restOpacity: 0.75,
    })

    let lastDir: string | null = null
    manager.on('dir', (_evt, data) => {
      const dir = data.direction?.angle
      if (!dir || dir === lastDir) return
      lastDir = dir
      switch (dir) {
        case 'up': onDirection('UP'); break
        case 'down': onDirection('DOWN'); break
        case 'left': onDirection('LEFT'); break
        case 'right': onDirection('RIGHT'); break
      }
    })

    manager.on('end', () => { lastDir = null })

    return () => { manager.destroy() }
  }, [onDirection])

  // Render
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const size = gameState.gridSize * (cellSize + GAP) + GAP
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
          x * (cellSize + GAP) + GAP,
          y * (cellSize + GAP) + GAP,
          cellSize,
          cellSize
        )
      }
    }

    // Fruits
    for (const fruit of gameState.fruits) {
      const fx = fruit.x * (cellSize + GAP) + GAP
      const fy = fruit.y * (cellSize + GAP) + GAP
      ctx.fillStyle = '#ef4444'
      ctx.beginPath()
      ctx.arc(
        fx + cellSize / 2,
        fy + cellSize / 2,
        cellSize / 2 - 1,
        0,
        Math.PI * 2
      )
      ctx.fill()
      // Shine
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.beginPath()
      ctx.arc(
        fx + cellSize / 2 - 2,
        fy + cellSize / 2 - 2,
        3,
        0,
        Math.PI * 2
      )
      ctx.fill()
    }

    // Freeze items
    for (const fi of gameState.freezeItems) {
      const fx = fi.x * (cellSize + GAP) + GAP
      const fy = fi.y * (cellSize + GAP) + GAP
      const cx = fx + cellSize / 2
      const cy = fy + cellSize / 2

      // Icy blue glow
      ctx.fillStyle = 'rgba(56, 189, 248, 0.2)'
      ctx.beginPath()
      ctx.arc(cx, cy, cellSize / 2 + 2, 0, Math.PI * 2)
      ctx.fill()

      // Main crystal
      ctx.fillStyle = '#38bdf8'
      ctx.beginPath()
      ctx.arc(cx, cy, cellSize / 2 - 1, 0, Math.PI * 2)
      ctx.fill()

      // Snowflake cross pattern
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      const r = cellSize / 2 - 3
      for (let a = 0; a < 3; a++) {
        const angle = (a * Math.PI) / 3
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r)
        ctx.lineTo(cx - Math.cos(angle) * r, cy - Math.sin(angle) * r)
        ctx.stroke()
      }

      // Center shine
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.beginPath()
      ctx.arc(cx - 2, cy - 2, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }

    // Reverse items
    for (const ri of gameState.reverseItems) {
      const rx = ri.x * (cellSize + GAP) + GAP
      const ry = ri.y * (cellSize + GAP) + GAP
      const cx = rx + cellSize / 2
      const cy = ry + cellSize / 2

      // Yellow glow
      ctx.fillStyle = 'rgba(250, 204, 21, 0.2)'
      ctx.beginPath()
      ctx.arc(cx, cy, cellSize / 2 + 2, 0, Math.PI * 2)
      ctx.fill()

      // Main circle
      ctx.fillStyle = '#facc15'
      ctx.beginPath()
      ctx.arc(cx, cy, cellSize / 2 - 1, 0, Math.PI * 2)
      ctx.fill()

      // Reverse arrows (U-turn symbol)
      ctx.strokeStyle = '#1a1a2e'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(cx, cy, 4, Math.PI, 0, false)
      ctx.stroke()
      // Left arrowhead
      ctx.beginPath()
      ctx.moveTo(cx - 4, cy - 3)
      ctx.lineTo(cx - 4, cy + 2)
      ctx.lineTo(cx - 7, cy)
      ctx.closePath()
      ctx.fillStyle = '#1a1a2e'
      ctx.fill()
      // Right arrowhead
      ctx.beginPath()
      ctx.moveTo(cx + 4, cy - 3)
      ctx.lineTo(cx + 4, cy + 2)
      ctx.lineTo(cx + 7, cy)
      ctx.closePath()
      ctx.fill()
    }

    // Snakes
    for (const snake of gameState.snakes) {
      if (snake.body.length === 0) continue
      const isMe = snake.id === myId
      const isFrozen = snake.frozenTicks > 0
      const isReversed = snake.reversedTicks > 0
      const alpha = snake.alive ? 1 : 0.3

      for (let i = 0; i < snake.body.length; i++) {
        const seg = snake.body[i]
        const sx = seg.x * (cellSize + GAP) + GAP
        const sy = seg.y * (cellSize + GAP) + GAP

        ctx.globalAlpha = alpha
        ctx.fillStyle = isFrozen ? '#7dd3fc' : snake.color
        const radius = 4
        ctx.beginPath()
        ctx.roundRect(sx, sy, cellSize, cellSize, radius)
        ctx.fill()

        // Frozen ice overlay
        if (isFrozen && snake.alive) {
          ctx.globalAlpha = 0.35
          ctx.fillStyle = '#38bdf8'
          ctx.beginPath()
          ctx.roundRect(sx, sy, cellSize, cellSize, radius)
          ctx.fill()
          ctx.globalAlpha = alpha
        }

        // Reversed yellow overlay
        if (isReversed && snake.alive) {
          ctx.globalAlpha = 0.3
          ctx.fillStyle = '#facc15'
          ctx.beginPath()
          ctx.roundRect(sx, sy, cellSize, cellSize, radius)
          ctx.fill()
          ctx.globalAlpha = alpha
        }

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
              e2x = sx + cellSize - 4 - eyeSize
              e2y = sy + 4
              break
            case 'DOWN':
              e1x = sx + 4
              e1y = sy + cellSize - 4 - eyeSize
              e2x = sx + cellSize - 4 - eyeSize
              e2y = sy + cellSize - 4 - eyeSize
              break
            case 'LEFT':
              e1x = sx + 4
              e1y = sy + 4
              e2x = sx + 4
              e2y = sy + cellSize - 4 - eyeSize
              break
            case 'RIGHT':
              e1x = sx + cellSize - 4 - eyeSize
              e1y = sy + 4
              e2x = sx + cellSize - 4 - eyeSize
              e2y = sy + cellSize - 4 - eyeSize
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
            ctx.roundRect(sx, sy, cellSize, cellSize, radius)
            ctx.stroke()
          }
        }
      }
      ctx.globalAlpha = 1
    }
  }, [gameState, myId, cellSize])

  return (
    <div ref={containerRef} className="game-canvas-container">
      <canvas
        ref={canvasRef}
        className="game-canvas"
      />
      <div ref={joystickRef} className="joystick-zone mobile-only" />
    </div>
  )
}
