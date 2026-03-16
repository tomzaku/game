import { useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../supabase'
import { type Player } from '../game/types'
import AuditionLobby, { type AuditionConfig } from './AuditionLobby'
import AuditionOnlineGame from './AuditionOnlineGame'

type Screen =
  | { type: 'lobby' }
  | {
      type: 'game'
      channel: RealtimeChannel
      players: Player[]
      myId: string
      isHost: boolean
      roomCode: string
      config: AuditionConfig
    }

export default function AuditionApp() {
  const [searchParams] = useSearchParams()
  const [screen, setScreen] = useState<Screen>({ type: 'lobby' })

  const handleGameStart = useCallback(
    (channel: RealtimeChannel, players: Player[], myId: string, isHost: boolean, roomCode: string, config: AuditionConfig) => {
      setScreen({ type: 'game', channel, players, myId, isHost, roomCode, config })
    },
    [],
  )

  const handleLeave = useCallback(() => {
    setScreen((prev) => {
      if (prev.type !== 'lobby') supabase.removeChannel(prev.channel)
      return { type: 'lobby' }
    })
    localStorage.removeItem('audition-room-code')
    localStorage.removeItem('audition-is-host')
  }, [])

  if (screen.type === 'game') {
    return (
      <AuditionOnlineGame
        channel={screen.channel}
        players={screen.players}
        myId={screen.myId}
        isHost={screen.isHost}
        config={screen.config}
        onLeave={handleLeave}
      />
    )
  }

  return (
    <AuditionLobby
      onGameStart={handleGameStart}
      initialRoomCode={searchParams.get('room') || undefined}
    />
  )
}
