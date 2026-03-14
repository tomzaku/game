import {
  type GameState,
  type Snake,
  type Position,
  type Direction,
  GRID_SIZE,
  PLAYER_COLORS,
  SPAWN_POSITIONS,
  SPAWN_DIRECTIONS,
} from './types'

export function createInitialState(
  players: { id: string; name: string }[]
): GameState {
  const snakes: Snake[] = players.map((p, i) => ({
    id: p.id,
    name: p.name,
    body: [
      SPAWN_POSITIONS[i],
      {
        x: SPAWN_POSITIONS[i].x - (SPAWN_DIRECTIONS[i] === 'RIGHT' ? 1 : -1),
        y: SPAWN_POSITIONS[i].y,
      },
      {
        x: SPAWN_POSITIONS[i].x - (SPAWN_DIRECTIONS[i] === 'RIGHT' ? 2 : -2),
        y: SPAWN_POSITIONS[i].y,
      },
    ],
    direction: SPAWN_DIRECTIONS[i],
    alive: true,
    score: 0,
    color: PLAYER_COLORS[i],
  }))

  const fruits: Position[] = []
  const state: GameState = {
    snakes,
    fruits,
    timeLeft: 60,
    started: false,
    gameOver: false,
    gridSize: GRID_SIZE,
  }

  // Spawn initial fruits
  for (let i = 0; i < 3; i++) {
    spawnFruit(state)
  }

  return state
}

function spawnFruit(state: GameState): void {
  const occupied = new Set<string>()
  for (const snake of state.snakes) {
    for (const pos of snake.body) {
      occupied.add(`${pos.x},${pos.y}`)
    }
  }
  for (const fruit of state.fruits) {
    occupied.add(`${fruit.x},${fruit.y}`)
  }

  let attempts = 0
  while (attempts < 100) {
    const x = Math.floor(Math.random() * GRID_SIZE)
    const y = Math.floor(Math.random() * GRID_SIZE)
    if (!occupied.has(`${x},${y}`)) {
      state.fruits.push({ x, y })
      return
    }
    attempts++
  }
}

function getNextHead(snake: Snake): Position {
  const head = snake.body[0]
  switch (snake.direction) {
    case 'UP':
      return { x: head.x, y: head.y - 1 }
    case 'DOWN':
      return { x: head.x, y: head.y + 1 }
    case 'LEFT':
      return { x: head.x - 1, y: head.y }
    case 'RIGHT':
      return { x: head.x + 1, y: head.y }
  }
}

export function applyDirection(
  state: GameState,
  playerId: string,
  direction: Direction
): void {
  const snake = state.snakes.find((s) => s.id === playerId)
  if (!snake || !snake.alive) return

  // Prevent 180-degree turns
  const opposites: Record<Direction, Direction> = {
    UP: 'DOWN',
    DOWN: 'UP',
    LEFT: 'RIGHT',
    RIGHT: 'LEFT',
  }
  if (opposites[direction] === snake.direction) return

  snake.direction = direction
}

export function tick(state: GameState): GameState {
  if (state.gameOver) return state

  const aliveSnakes = state.snakes.filter((s) => s.alive)

  // Calculate next heads for all alive snakes
  const nextHeads = new Map<string, Position>()
  for (const snake of aliveSnakes) {
    nextHeads.set(snake.id, getNextHead(snake))
  }

  // Check wall collisions
  for (const snake of aliveSnakes) {
    const head = nextHeads.get(snake.id)!
    if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
      snake.alive = false
    }
  }

  // Check body collisions (against all snake bodies including own)
  for (const snake of aliveSnakes) {
    if (!snake.alive) continue
    const head = nextHeads.get(snake.id)!

    for (const other of state.snakes) {
      // Check against body (skip last segment as it will move away, unless it ate)
      const bodyToCheck = other.body
      for (const segment of bodyToCheck) {
        if (head.x === segment.x && head.y === segment.y) {
          snake.alive = false
          break
        }
      }
      if (!snake.alive) break
    }
  }

  // Check head-to-head collisions
  for (const snake of aliveSnakes) {
    if (!snake.alive) continue
    const head = nextHeads.get(snake.id)!

    for (const other of aliveSnakes) {
      if (other.id === snake.id || !other.alive) continue
      const otherHead = nextHeads.get(other.id)!
      if (head.x === otherHead.x && head.y === otherHead.y) {
        snake.alive = false
        other.alive = false
      }
    }
  }

  // Move alive snakes and check fruit consumption
  for (const snake of aliveSnakes) {
    if (!snake.alive) continue
    const head = nextHeads.get(snake.id)!

    // Check fruit
    const fruitIndex = state.fruits.findIndex(
      (f) => f.x === head.x && f.y === head.y
    )
    const ateFruit = fruitIndex !== -1

    // Move: add head
    snake.body.unshift(head)

    if (ateFruit) {
      snake.score += 10
      state.fruits.splice(fruitIndex, 1)
      spawnFruit(state)
    } else {
      // Remove tail
      snake.body.pop()
    }
  }

  // Check if game should end
  const stillAlive = state.snakes.filter((s) => s.alive)
  if (stillAlive.length <= (state.snakes.length === 1 ? 0 : 1)) {
    state.gameOver = true
  }

  return state
}

export function getWinner(state: GameState): Snake | null {
  // If one snake is alive, they win
  const alive = state.snakes.filter((s) => s.alive)
  if (alive.length === 1) return alive[0]

  // If time ran out or everyone died, highest score wins
  const sorted = [...state.snakes].sort((a, b) => {
    // Alive snakes first
    if (a.alive !== b.alive) return a.alive ? -1 : 1
    // Then by score
    if (b.score !== a.score) return b.score - a.score
    // Then by length
    return b.body.length - a.body.length
  })

  return sorted[0] || null
}
