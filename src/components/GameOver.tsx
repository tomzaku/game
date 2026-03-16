import type { GameState } from '../game/types'
import { getWinner } from '../game/engine'

interface GameOverProps {
  gameState: GameState
  myId: string
  isHost: boolean
  onLeave: () => void
}

export default function GameOver({ gameState, myId, onLeave }: GameOverProps) {
  const winner = getWinner(gameState)
  const isWinner = winner?.id === myId
  const sorted = [...gameState.snakes].sort((a, b) => b.score - a.score)

  const handleRematch = () => {
    // Hard refresh — auto-rejoin picks up room from URL + localStorage
    window.location.reload()
  }

  return (
    <div className="game-over-overlay">
      <div className="game-over-card">
        <h1>{isWinner ? 'You Win!' : 'Game Over'}</h1>
        {winner && (
          <p className="winner-text">
            <span className="winner-dot" style={{ background: winner.color }} />
            {winner.name} wins!
          </p>
        )}
        <div className="scoreboard">
          <h2>Scoreboard</h2>
          {sorted.map((snake, i) => (
            <div
              key={snake.id}
              className={`score-row ${snake.id === myId ? 'me' : ''}`}
            >
              <span className="rank">#{i + 1}</span>
              <span className="score-dot" style={{ background: snake.color }} />
              <span className="score-name">{snake.name}</span>
              <span className="score-value">{snake.score}</span>
              <span className="score-length">({snake.body.length} long)</span>
              {!snake.alive && <span className="dead-badge">Dead</span>}
            </div>
          ))}
        </div>
        <div className="game-over-buttons">
          <button className="btn btn-primary" onClick={handleRematch}>
            Rematch
          </button>
          <a className="leave-link" onClick={onLeave}>
            Leave Room
          </a>
        </div>
      </div>
    </div>
  )
}
