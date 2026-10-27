// Sends the finished call's transcript to the coach-report function.

export async function fetchReport({ reportUrl, accessCode, persona, level, offer, lines }) {
  if (!reportUrl) throw new Error("The report backend isn't deployed yet.")
  const res = await fetch(reportUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accessCode,
      persona,
      level,
      offer,
      lines: lines.map(({ role, text }) => ({ role, text })),
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Could not grade the call')
  return data.report
}
