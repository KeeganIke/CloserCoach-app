// One way to show a change everywhere in the app: an arrow, the size, and a unit,
// e.g. "↑ 8 pts", "↓ 3", "Same".
export function changeText(change, unit = ' pts') {
  if (change == null) return null
  if (change === 0) return 'Same'
  const n = Math.abs(change)
  return `${change > 0 ? '↑' : '↓'} ${n}${n === 1 && unit === ' pts' ? ' pt' : unit}`
}

export const changeTone = (change) => (change > 0 ? 'up' : change < 0 ? 'down' : 'flat')
