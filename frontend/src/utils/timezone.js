export function isIST() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone === 'Asia/Kolkata'
}

export function getUserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

export function getTimezoneCode() {
  return new Intl.DateTimeFormat('en', { timeZoneName: 'short' })
    .formatToParts(new Date())
    .find(p => p.type === 'timeZoneName')?.value || 'Local'
}

export function formatClassTime(utcDateStr, forceIST = false) {
  const tz = forceIST ? 'Asia/Kolkata'
    : Intl.DateTimeFormat().resolvedOptions().timeZone
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(utcDateStr))
}

export function formatTimeOnly(utcDateStr, forceIST = false) {
  const tz = forceIST ? 'Asia/Kolkata'
    : Intl.DateTimeFormat().resolvedOptions().timeZone
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(utcDateStr))
}

export function toISTPreview(localDateStr, localTimeStr, schedulingInIST) {
  // Given a date + hour as entered by choreographer,
  // show what it will be in IST.
  // schedulingInIST = true means input is already IST, no conversion needed.
  if (!localDateStr || localTimeStr === '' || localTimeStr === undefined) return null
  const localDT = new Date(`${localDateStr}T${String(localTimeStr).padStart(2, '0')}:00:00`)
  if (isNaN(localDT)) return null
  if (schedulingInIST) {
    // Already IST — just format it back
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit', minute: '2-digit', hour12: true,
    }).format(localDT)
  }
  // Convert browser local time → IST
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit', minute: '2-digit', hour12: true,
    day: 'numeric', month: 'short',
  }).format(localDT)
}
