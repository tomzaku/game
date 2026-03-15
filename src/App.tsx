import { useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { type Player, type GameConfig } from './game/types'
import Lobby from './components/Lobby'
import GameScreen from './components/GameScreen'
import './App.css'

type Screen =
  | { type: 'lobby' }
  | {
      type: 'game'
      channel: RealtimeChannel
      players: Player[]
      myId: string
      isHost: boolean
      roomCode: string
      config: GameConfig
    }

function App() {
  const [searchParams] = useSearchParams()
  const [screen, setScreen] = useState<Screen>({ type: 'lobby' })

  const handleGameStart = useCallback(
    (channel: RealtimeChannel, players: Player[], myId: string, isHost: boolean, roomCode: string, config: GameConfig) => {
      setScreen({ type: 'game', channel, players, myId, isHost, roomCode, config })
    },
    []
  )

  const handleLeave = useCallback(() => {
    setScreen((prev) => {
      if (prev.type !== 'lobby') {
        supabase.removeChannel(prev.channel)
      }
      return { type: 'lobby' }
    })
    localStorage.removeItem('snake-room-code')
    localStorage.removeItem('snake-is-host')
  }, [])

  if (screen.type === 'game') {
    return (
      <GameScreen
        channel={screen.channel}
        players={screen.players}
        myId={screen.myId}
        isHost={screen.isHost}
        config={screen.config}
        onLeave={handleLeave}
      />
    )
  }

  return <Lobby onGameStart={handleGameStart} initialRoomCode={searchParams.get('room') || undefined} />
}

export default App
