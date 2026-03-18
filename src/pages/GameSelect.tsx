import { useNavigate } from 'react-router-dom'
import './GameSelect.css'

const games = [
  {
    id: 'snake',
    title: 'Snake',
    description: 'Classic multiplayer snake. Eat fruits, grab power-ups, and outlast your friends!',
    emoji: '\ud83d\udc0d',
    color: '#22c55e',
    path: '/snake',
  },
  {
    id: 'audition',
    title: 'Audition',
    description: 'Rhythm battle! Hit arrows in time, build combos, and activate Fever mode to win!',
    emoji: '\ud83c\udfb5',
    color: '#00f0ff',
    path: '/audition',
  },
  {
    id: 'typeracer',
    title: 'TypeRacer',
    description: 'Race against AI bots by typing! Neon arcade vibes, live WPM stats, and particle effects.',
    emoji: '\u{1F3CE}\u{FE0F}',
    color: '#bf5af2',
    path: '/typeracer',
  },
]

export default function GameSelect() {
  const navigate = useNavigate()

  return (
    <div className="game-select">
      <div className="game-select-header">
        <h1>Game Arcade</h1>
        <p className="game-select-subtitle">Choose a game to play</p>
      </div>

      <div className="game-grid">
        {games.map((game) => (
          <button
            key={game.id}
            className="game-card"
            style={{ '--card-accent': game.color } as React.CSSProperties}
            onClick={() => navigate(game.path)}
          >
            <span className="game-card-emoji">{game.emoji}</span>
            <h2 className="game-card-title">{game.title}</h2>
            <p className="game-card-desc">{game.description}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
