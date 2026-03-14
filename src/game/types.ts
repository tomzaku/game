export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'

export interface Position {
  x: number
  y: number
}

export interface Snake {
  id: string
  name: string
  body: Position[]
  direction: Direction
  alive: boolean
  score: number
  color: string
}

export interface GameState {
  snakes: Snake[]
  fruits: Position[]
  timeLeft: number
  started: boolean
  gameOver: boolean
  gridSize: number
}

export interface Player {
  id: string
  name: string
  isHost: boolean
  isBot?: boolean
}

export const GRID_SIZE = 30
export const TICK_RATE = 150 // ms between game ticks
export const GAME_DURATION = 60 // seconds
export const MAX_PLAYERS = 4

export const PLAYER_COLORS = ['#22c55e', '#3b82f6', '#f97316', '#a855f7']
export const PLAYER_COLOR_NAMES = ['Green', 'Blue', 'Orange', 'Purple']

export const SPAWN_POSITIONS: Position[] = [
  { x: 3, y: 3 },
  { x: 26, y: 26 },
  { x: 26, y: 3 },
  { x: 3, y: 26 },
]

export const SPAWN_DIRECTIONS: Direction[] = ['RIGHT', 'LEFT', 'RIGHT', 'LEFT']

export const BOT_NAMES = ['Bot Alpha', 'Bot Beta', 'Bot Gamma']
