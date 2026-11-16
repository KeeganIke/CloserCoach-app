// Sends the finished call's transcript to the coach-report function.

export async function fetchReport({ reportUrl, accessCode, persona, offer, hidden, lines }) {
  if (!reportUrl) throw new Error("The report backend isn't deployed yet.")
  const res = await fetch(reportUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accessCode,
      persona,
      offer,
      hidden,
      lines: lines.map(({ role, text }) => ({ role, text })),
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error || 'Could not grade the call'), { tooShort: !!data.tooShort })
  return data.report
}
