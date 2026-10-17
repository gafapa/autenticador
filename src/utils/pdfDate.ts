export function parsePdfDate(raw: unknown): Date | undefined {
  if (!raw) return undefined
  if (raw instanceof Date) return Number.isFinite(raw.getTime()) ? raw : undefined
  if (typeof raw !== 'string') return undefined

  const match = raw.match(
    /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:([Zz])|([+-])(\d{2})'?(\d{2})'?)?$/
  )

  if (match) {
    const year = Number(match[1])
    const month = Number(match[2] ?? '01') - 1
    const day = Number(match[3] ?? '01')
    const hour = Number(match[4] ?? '00')
    const minute = Number(match[5] ?? '00')
    const second = Number(match[6] ?? '00')
    const zulu = match[7]
    const offsetSign = match[8]
    const offsetHour = Number(match[9] ?? '00')
    const offsetMinute = Number(match[10] ?? '00')
    if (month < 0 || month > 11 || day < 1 || day > 31 || hour > 23 || minute > 59 ||
      second > 59 || offsetHour > 23 || offsetMinute > 59) return undefined
    const utcDate = new Date(0)
    utcDate.setUTCFullYear(year, month, day)
    utcDate.setUTCHours(hour, minute, second, 0)
    if (utcDate.getUTCMonth() !== month || utcDate.getUTCDate() !== day) return undefined

    if (zulu) {
      return utcDate
    }

    if (offsetSign) {
      const offsetMinutes =
        (offsetHour * 60 + offsetMinute) * (offsetSign === '+' ? 1 : -1)
      const utcMillis =
        utcDate.getTime() - offsetMinutes * 60_000
      return new Date(utcMillis)
    }

    const localDate = new Date(0)
    localDate.setFullYear(year, month, day)
    localDate.setHours(hour, minute, second, 0)
    return localDate
  }

  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? undefined : date
}
