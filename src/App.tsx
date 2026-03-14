import { useState, useCallback } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { type Player, type GameConfig } from './game/types'
import Lobby from './components/Lobby'
import WaitingRoom from './components/WaitingRoom'
import GameScreen from './components/GameScreen'
import './App.css'

type RoomInfo = {
  channel: RealtimeChannel
  players: Player[]
  myId: string
  isHost: boolean
  roomCode: string
  config: GameConfig
}

type Screen =
  | { type: 'lobby' }
  | { type: 'waiting' } & RoomInfo
  | { type: 'game' } & RoomInfo

function App() {
  const [screen, setScreen] = useState<Screen>({ type: 'lobby' })

  const handleGameStart = useCallback(
    (channel: RealtimeChannel, players: Player[], myId: string, isHost: boolean, roomCode: string, config: GameConfig) => {
      setScreen({ type: 'game', channel, players, myId, isHost, roomCode, config })
    },
    []
  )

  const handleBackToRoom = useCallback(() => {
    if (screen.type === 'game') {
      setScreen({ ...screen, type: 'waiting' })
    }
  }, [screen])

  const handleStartFromRoom = useCallback((players: Player[], config: GameConfig) => {
    if (screen.type === 'waiting') {
      setScreen({ ...screen, type: 'game', players, config })
    }
  }, [screen])

  const handleLeave = useCallback(() => {
    if (screen.type !== 'lobby') {
      supabase.removeChannel(screen.channel)
    }
    setScreen({ type: 'lobby' })
  }, [screen])

  if (screen.type === 'game') {
    return (
      <GameScreen
        channel={screen.channel}
        players={screen.players}
        myId={screen.myId}
        isHost={screen.isHost}
        config={screen.config}
        onBackToRoom={handleBackToRoom}
        onLeave={handleLeave}
      />
    )
  }

  if (screen.type === 'waiting') {
    return (
      <WaitingRoom
        channel={screen.channel}
        players={screen.players}
        myId={screen.myId}
        isHost={screen.isHost}
        roomCode={screen.roomCode}
        onStart={handleStartFromRoom}
        onLeave={handleLeave}
      />
    )
  }

  return <Lobby onGameStart={handleGameStart} initialRoomCode={new URLSearchParams(window.location.search).get('room') || undefined} />
}

export default App
