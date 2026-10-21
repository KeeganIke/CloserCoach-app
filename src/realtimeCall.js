// Connects the browser mic and speaker to an OpenAI Realtime session over WebRTC.

export async function startCall({ tokenUrl, accessCode, onTranscript }) {
  if (!tokenUrl) throw new Error("The call backend isn't deployed yet.")
  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessCode }),
  })
  const tokenData = await tokenRes.json().catch(() => ({}))
  if (!tokenRes.ok) throw new Error(tokenData.error || 'Could not start the call')

  const mic = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  })

  const pc = new RTCPeerConnection()
  const audio = new Audio()
  audio.autoplay = true
  pc.ontrack = (e) => (audio.srcObject = e.streams[0])
  pc.addTrack(mic.getTracks()[0])

  // Transcript lines in call order, keyed by conversation item id.
  const lines = []
  const upsert = (id, role, update) => {
    let line = lines.find((l) => l.id === id)
    if (!line) {
      line = { id, role, text: '' }
      lines.push(line)
    }
    update(line)
    onTranscript(lines.map((l) => ({ ...l })))
  }

  const dc = pc.createDataChannel('oai-events')
  dc.onopen = () => {
    // The owner picks up the phone and speaks first.
    dc.send(JSON.stringify({ type: 'response.create' }))
  }
  dc.onmessage = (e) => {
    const ev = JSON.parse(e.data)
    switch (ev.type) {
      case 'conversation.item.added':
      case 'conversation.item.created':
        if (ev.item?.role === 'user' || ev.item?.role === 'assistant') {
          upsert(ev.item.id, ev.item.role, () => {})
        }
        break
      case 'conversation.item.input_audio_transcription.completed':
        upsert(ev.item_id, 'user', (l) => (l.text = ev.transcript.trim()))
        break
      case 'response.output_audio_transcript.delta':
        upsert(ev.item_id, 'assistant', (l) => (l.text += ev.delta))
        break
      case 'response.output_audio_transcript.done':
        upsert(ev.item_id, 'assistant', (l) => (l.text = ev.transcript))
        break
      case 'error':
        console.error('Realtime error', ev.error)
        break
    }
  }

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  const sdpRes = await fetch('https://api.openai.com/v1/realtime/calls', {
    method: 'POST',
    body: offer.sdp,
    headers: { Authorization: `Bearer ${tokenData.token}`, 'Content-Type': 'application/sdp' },
  })
  if (!sdpRes.ok) {
    mic.getTracks().forEach((t) => t.stop())
    pc.close()
    throw new Error('Could not connect the call')
  }
  await pc.setRemoteDescription({ type: 'answer', sdp: await sdpRes.text() })

  const hangup = () => {
    dc.close()
    pc.close()
    mic.getTracks().forEach((t) => t.stop())
    audio.srcObject = null
    return lines.map((l) => ({ ...l }))
  }

  return { persona: tokenData.persona, hangup }
}
