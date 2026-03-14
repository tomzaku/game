import {
  type GameState,
  type GameConfig,
  type Snake,
  type Position,
  type Direction,
  GRID_SIZE,
  PLAYER_COLORS,
  SPAWN_POSITIONS,
  SPAWN_DIRECTIONS,
  FREEZE_DURATION_TICKS,
  FREEZE_SPAWN_INTERVAL,
  REVERSE_SPAWN_INTERVAL,
  REVERSE_DURATION_TICKS,
  DEFAULT_CONFIG,
} from './types'

export function createInitialState(
  players: { id: string; name: string }[],
  config: GameConfig = DEFAULT_CONFIG
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
    frozenTicks: 0,
    reversedTicks: 0,
  }))

  const fruits: Position[] = []
  const state: GameState = {
    snakes,
    fruits,
    freezeItems: [],
    freezeSpawnTimer: FREEZE_SPAWN_INTERVAL,
    reverseItems: [],
    reverseSpawnTimer: REVERSE_SPAWN_INTERVAL,
    timeLeft: 60,
    started: false,
    gameOver: false,
    gridSize: GRID_SIZE,
    config,
  }

  // Spawn initial fruits
  for (let i = 0; i < 3; i++) {
    spawnFruit(state)
  }

  return state
}

function getOccupied(state: GameState): Set<string> {
  const occupied = new Set<string>()
  for (const snake of state.snakes) {
    for (const pos of snake.body) {
      occupied.add(`${pos.x},${pos.y}`)
    }
  }
  for (const fruit of state.fruits) {
    occupied.add(`${fruit.x},${fruit.y}`)
  }
  for (const fi of state.freezeItems) {
    occupied.add(`${fi.x},${fi.y}`)
  }
  for (const ri of state.reverseItems) {
    occupied.add(`${ri.x},${ri.y}`)
  }
  return occupied
}

function spawnFruit(state: GameState): void {
  const occupied = getOccupied(state)
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

function spawnFreezeItem(state: GameState): void {
  const occupied = getOccupied(state)
  let attempts = 0
  while (attempts < 100) {
    const x = Math.floor(Math.random() * GRID_SIZE)
    const y = Math.floor(Math.random() * GRID_SIZE)
    if (!occupied.has(`${x},${y}`)) {
      state.freezeItems.push({ x, y })
      return
    }
    attempts++
  }
}

function spawnReverseItem(state: GameState): void {
  const occupied = getOccupied(state)
  let attempts = 0
  while (attempts < 100) {
    const x = Math.floor(Math.random() * GRID_SIZE)
    const y = Math.floor(Math.random() * GRID_SIZE)
    if (!occupied.has(`${x},${y}`)) {
      state.reverseItems.push({ x, y })
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

const OPPOSITES: Record<Direction, Direction> = {
  UP: 'DOWN',
  DOWN: 'UP',
  LEFT: 'RIGHT',
  RIGHT: 'LEFT',
}

export function applyDirection(
  state: GameState,
  playerId: string,
  direction: Direction
): void {
  const snake = state.snakes.find((s) => s.id === playerId)
  if (!snake || !snake.alive) return

  // If controls are reversed, flip the input direction
  if (snake.reversedTicks > 0) {
    direction = OPPOSITES[direction]
  }

  // Prevent 180-degree turns based on current direction
  if (OPPOSITES[direction] === snake.direction) return

  // Also prevent moving into the neck (handles rapid key changes between ticks)
  if (snake.body.length >= 2) {
    const head = snake.body[0]
    const neck = snake.body[1]
    const nextHead = {
      x: head.x + (direction === 'RIGHT' ? 1 : direction === 'LEFT' ? -1 : 0),
      y: head.y + (direction === 'DOWN' ? 1 : direction === 'UP' ? -1 : 0),
    }
    if (nextHead.x === neck.x && nextHead.y === neck.y) return
  }

  snake.direction = direction
}

export function tick(state: GameState): GameState {
  if (state.gameOver) return state

  // Decrement frozen and reversed ticks
  for (const snake of state.snakes) {
    if (snake.frozenTicks > 0) snake.frozenTicks--
    if (snake.reversedTicks > 0) snake.reversedTicks--
  }

  // Spawn freeze item every 20 seconds
  state.freezeSpawnTimer--
  if (state.freezeSpawnTimer <= 0) {
    spawnFreezeItem(state)
    state.freezeSpawnTimer = FREEZE_SPAWN_INTERVAL
  }

  // Spawn reverse item every 30 seconds
  state.reverseSpawnTimer--
  if (state.reverseSpawnTimer <= 0) {
    spawnReverseItem(state)
    state.reverseSpawnTimer = REVERSE_SPAWN_INTERVAL
  }

  const aliveSnakes = state.snakes.filter((s) => s.alive)
  // Separate moving snakes from frozen ones
  const movingSnakes = aliveSnakes.filter((s) => s.frozenTicks <= 0)
  const frozenSnakes = aliveSnakes.filter((s) => s.frozenTicks > 0)

  // Calculate next heads for moving snakes only
  const nextHeads = new Map<string, Position>()
  for (const snake of movingSnakes) {
    nextHeads.set(snake.id, getNextHead(snake))
  }

  // Handle wall collisions
  for (const snake of movingSnakes) {
    const head = nextHeads.get(snake.id)!
    if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
      if (state.config.wallPass) {
        // Wrap around to opposite side
        head.x = ((head.x % GRID_SIZE) + GRID_SIZE) % GRID_SIZE
        head.y = ((head.y % GRID_SIZE) + GRID_SIZE) % GRID_SIZE
      } else {
        snake.alive = false
      }
    }
  }

  // Check body collisions (against all snake bodies including frozen ones)
  for (const snake of movingSnakes) {
    if (!snake.alive) continue
    const head = nextHeads.get(snake.id)!

    for (const other of state.snakes) {
      const bodyToCheck = other.body
      for (const segment of bodyToCheck) {
        if (head.x === segment.x && head.y === segment.y) {
          // Moving into a frozen snake kills the frozen one instead
          if (frozenSnakes.includes(other) && other.id !== snake.id) {
            other.alive = false
          } else {
            snake.alive = false
          }
          break
        }
      }
      if (!snake.alive) break
    }
  }

  // Check head-to-head collisions (only between moving snakes)
  for (const snake of movingSnakes) {
    if (!snake.alive) continue
    const head = nextHeads.get(snake.id)!

    for (const other of movingSnakes) {
      if (other.id === snake.id || !other.alive) continue
      const otherHead = nextHeads.get(other.id)!
      if (head.x === otherHead.x && head.y === otherHead.y) {
        snake.alive = false
        other.alive = false
      }
    }
  }

  // Move alive moving snakes and check fruit/freeze consumption
  for (const snake of movingSnakes) {
    if (!snake.alive) continue
    const head = nextHeads.get(snake.id)!

    // Check fruit
    const fruitIndex = state.fruits.findIndex(
      (f) => f.x === head.x && f.y === head.y
    )
    const ateFruit = fruitIndex !== -1

    // Check freeze item
    const freezeIndex = state.freezeItems.findIndex(
      (f) => f.x === head.x && f.y === head.y
    )
    const ateFreezeItem = freezeIndex !== -1

    // Check reverse item
    const reverseIndex = state.reverseItems.findIndex(
      (f) => f.x === head.x && f.y === head.y
    )
    const ateReverseItem = reverseIndex !== -1

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

    // Apply freeze to all enemies
    if (ateFreezeItem) {
      state.freezeItems.splice(freezeIndex, 1)
      for (const other of state.snakes) {
        if (other.id !== snake.id && other.alive) {
          other.frozenTicks = FREEZE_DURATION_TICKS
        }
      }
    }

    // Reverse controls of all enemies for 5 seconds
    if (ateReverseItem) {
      state.reverseItems.splice(reverseIndex, 1)
      for (const other of state.snakes) {
        if (other.id !== snake.id && other.alive) {
          other.reversedTicks = REVERSE_DURATION_TICKS
        }
      }
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
