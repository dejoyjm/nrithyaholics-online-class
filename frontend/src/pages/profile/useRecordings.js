import { useState, useEffect } from 'react'

export default function useRecordings(bookings, supabase) {
  const [recordingsBySessionId, setRecordingsBySessionId] = useState({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!bookings || bookings.length === 0) return
    const sessionIds = bookings.map(b => b.session_id).filter(Boolean)
    if (sessionIds.length === 0) return
    setLoading(true)
    supabase
      .from('recordings')
      .select('id, session_id, duration_seconds, r2_url')
      .in('session_id', sessionIds)
      .then(({ data }) => {
        const map = {}
        ;(data ?? []).forEach(r => { map[r.session_id] = r })
        setRecordingsBySessionId(map)
        setLoading(false)
      })
  }, [bookings, supabase])

  return { recordingsBySessionId, loading }
}
