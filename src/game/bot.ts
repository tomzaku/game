import { type GameState, type Direction, type Position, GRID_SIZE } from './types'

const DIRECTIONS: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT']
const OPPOSITES: Record<Direction, Direction> = {
  UP: 'DOWN',
  DOWN: 'UP',
  LEFT: 'RIGHT',
  RIGHT: 'LEFT',
}

function move(pos: Position, dir: Direction): Position {
  switch (dir) {
    case 'UP': return { x: pos.x, y: pos.y - 1 }
    case 'DOWN': return { x: pos.x, y: pos.y + 1 }
    case 'LEFT': return { x: pos.x - 1, y: pos.y }
    case 'RIGHT': return { x: pos.x + 1, y: pos.y }
  }
}

function isInBounds(pos: Position): boolean {
  return pos.x >= 0 && pos.x < GRID_SIZE && pos.y >= 0 && pos.y < GRID_SIZE
}

/**
 * BFS to find shortest path to the nearest fruit.
 * Returns the first direction to take, or null if no path found.
 */
function bfsToFruit(
  head: Position,
  currentDir: Direction,
  occupied: Set<string>,
  fruits: Position[]
): Direction | null {
  const fruitSet = new Set(fruits.map((f) => `${f.x},${f.y}`))
  const queue: { pos: Position; firstDir: Direction }[] = []
  const visited = new Set<string>()
  visited.add(`${head.x},${head.y}`)

  // Enqueue valid neighbors (respecting no 180-turn rule)
  for (const dir of DIRECTIONS) {
    if (dir === OPPOSITES[currentDir]) continue
    const next = move(head, dir)
    const key = `${next.x},${next.y}`
    if (!isInBounds(next) || occupied.has(key)) continue
    if (fruitSet.has(key)) return dir
    visited.add(key)
    queue.push({ pos: next, firstDir: dir })
  }

  // BFS
  let i = 0
  while (i < queue.length) {
    const { pos, firstDir } = queue[i++]

    for (const dir of DIRECTIONS) {
      const next = move(pos, dir)
      const key = `${next.x},${next.y}`
      if (!isInBounds(next) || visited.has(key) || occupied.has(key)) continue
      if (fruitSet.has(key)) return firstDir
      visited.add(key)
      queue.push({ pos: next, firstDir })
    }
  }

  return null
}

/**
 * Count reachable cells from a position using flood fill.
 * Used to avoid trapping ourselves in small spaces.
 */
function floodFillCount(start: Position, occupied: Set<string>): number {
  const visited = new Set<string>()
  const stack: Position[] = [start]
  visited.add(`${start.x},${start.y}`)
  let count = 0

  while (stack.length > 0) {
    const pos = stack.pop()!
    count++
    // Cap early - we only need a rough sense of space
    if (count > 50) return count

    for (const dir of DIRECTIONS) {
      const next = move(pos, dir)
      const key = `${next.x},${next.y}`
      if (isInBounds(next) && !visited.has(key) && !occupied.has(key)) {
        visited.add(key)
        stack.push(next)
      }
    }
  }

  return count
}

/**
 * Compute the best direction for a bot snake.
 */
export function computeBotDirection(state: GameState, botId: string): Direction | null {
  const snake = state.snakes.find((s) => s.id === botId)
  if (!snake || !snake.alive) return null

  const head = snake.body[0]
  const currentDir = snake.direction

  // Build occupied set from all snake bodies
  const occupied = new Set<string>()
  for (const s of state.snakes) {
    if (!s.alive) continue
    for (const seg of s.body) {
      occupied.add(`${seg.x},${seg.y}`)
    }
  }

  // Prioritize freeze items if available, otherwise go for fruit
  const targets = state.freezeItems.length > 0
    ? [...state.freezeItems, ...state.fruits]
    : state.fruits
  const bfsDir = bfsToFruit(head, currentDir, occupied, targets)

  // Get all safe directions (not wall, not body)
  const safeDirs = DIRECTIONS.filter((dir) => {
    if (dir === OPPOSITES[currentDir]) return false
    const next = move(head, dir)
    return isInBounds(next) && !occupied.has(`${next.x},${next.y}`)
  })

  if (safeDirs.length === 0) return null // doomed

  // If BFS found a path, check that direction doesn't lead to a tiny dead-end
  if (bfsDir && safeDirs.includes(bfsDir)) {
    const next = move(head, bfsDir)
    const space = floodFillCount(next, occupied)
    // Only follow BFS if we have enough room (at least our body length)
    if (space >= snake.body.length) return bfsDir
  }

  // Fallback: pick the safe direction with the most open space
  let bestDir = safeDirs[0]
  let bestSpace = 0
  for (const dir of safeDirs) {
    const next = move(head, dir)
    const space = floodFillCount(next, occupied)
    if (space > bestSpace) {
      bestSpace = space
      bestDir = dir
    }
  }

  return bestDir
}
