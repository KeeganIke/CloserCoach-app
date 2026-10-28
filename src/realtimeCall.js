// Connects the browser mic and speaker to an OpenAI Realtime session over WebRTC.

export async function startCall({ tokenUrl, accessCode, offer, onTranscript, onAudioBlocked }) {
  if (!tokenUrl) throw new Error("The call backend isn't deployed yet.")

  // Browsers (Safari especially) only allow sound that starts during a click. The
  // owner's audio arrives seconds later, so the player is created and started here,
  // before the first await, while the Start call click still counts.
  const audio = new Audio()
  audio.autoplay = true
  audio.play().catch(() => {})

  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessCode, offer }),
  })
  const tokenData = await tokenRes.json().catch(() => ({}))
  if (!tokenRes.ok) throw new Error(tokenData.error || 'Could not start the call')

  const mic = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  })

  // The owner can't be interrupted (interrupt_response false), so the mic is switched
  // off while their voice plays. Otherwise laptop speakers leak into the mic and the
  // owner hears itself as the rep. It comes back on just after they finish.
  const micTrack = mic.getTracks()[0]
  let micTimer
  const micOnAfter = (ms) => {
    clearTimeout(micTimer)
    micTimer = setTimeout(() => (micTrack.enabled = true), ms)
  }

  const pc = new RTCPeerConnection()
  pc.ontrack = (e) => {
    audio.srcObject = e.streams[0]
    // If the browser still blocks it, let the page offer a button that retries play().
    audio.play().catch(() => onAudioBlocked?.(() => audio.play()))
  }
  pc.addTrack(micTrack)

  // Transcript lines in call order, keyed by conversation item id.
  const lines = []
  const upsert = (id, role, update) => {
    let line = lines.find((l) => l.id === id)
    if (!line) {
      // A rep line is "pending" from the moment they stop talking until their words are
      // transcribed, so the page can hold its place instead of inserting it late.
      line = { id, role, text: '', pending: role === 'user' }
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
        upsert(ev.item_id, 'user', (l) => {
          l.text = ev.transcript.trim()
          l.pending = false
        })
        break
      case 'conversation.item.input_audio_transcription.failed':
        upsert(ev.item_id, 'user', (l) => (l.pending = false))
        break
      case 'response.output_audio_transcript.delta':
        upsert(ev.item_id, 'assistant', (l) => (l.text += ev.delta))
        break
      case 'response.output_audio_transcript.done':
        upsert(ev.item_id, 'assistant', (l) => (l.text = ev.transcript))
        break
      case 'output_audio_buffer.started':
        micTrack.enabled = false
        micOnAfter(30000) // never leave the rep muted if the stop event goes missing
        break
      case 'output_audio_buffer.stopped':
      case 'output_audio_buffer.cleared':
        micOnAfter(400)
        break
      case 'error':
        console.error('Realtime error', ev.error)
        break
    }
  }

  const sdpOffer = await pc.createOffer()
  await pc.setLocalDescription(sdpOffer)
  const sdpRes = await fetch('https://api.openai.com/v1/realtime/calls', {
    method: 'POST',
    body: sdpOffer.sdp,
    headers: { Authorization: `Bearer ${tokenData.token}`, 'Content-Type': 'application/sdp' },
  })
  if (!sdpRes.ok) {
    mic.getTracks().forEach((t) => t.stop())
    pc.close()
    throw new Error('Could not connect the call')
  }
  await pc.setRemoteDescription({ type: 'answer', sdp: await sdpRes.text() })

  const hangup = () => {
    clearTimeout(micTimer)
    dc.close()
    pc.close()
    mic.getTracks().forEach((t) => t.stop())
    audio.srcObject = null
    return lines.map((l) => ({ ...l }))
  }

  // hidden is sealed by the backend; only the report function can read it.
  return { persona: tokenData.persona, hidden: tokenData.hidden, hangup }
}
