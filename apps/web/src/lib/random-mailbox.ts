/**
 * Random temporary mailbox local-part generator (employee-style).
 */

const FIRST_NAMES = [
  "aaron", "adrian", "alex", "andrew", "anthony", "austin", "benjamin", "blake", "brandon", "brian",
  "caleb", "cameron", "charles", "chris", "daniel", "david", "dylan", "ethan", "evan", "gabriel",
  "george", "henry", "isaac", "jack", "jacob", "james", "jason", "jayden", "jeremy", "john",
  "jonathan", "joseph", "justin", "kevin", "leo", "liam", "logan", "lucas", "mason", "matthew",
  "michael", "nathan", "nicholas", "noah", "oliver", "owen", "patrick", "peter", "ryan", "samuel",
  "sean", "sebastian", "steven", "thomas", "timothy", "tyler", "victor", "william", "zachary", "nolan",
]

const LAST_NAMES = [
  "anderson", "bailey", "bennett", "brooks", "brown", "campbell", "carter", "clark", "coleman", "collins",
  "cooper", "cox", "davis", "diaz", "evans", "flores", "foster", "garcia", "gomez", "gonzalez",
  "gray", "green", "hall", "harris", "hayes", "henderson", "hill", "hughes", "jackson", "johnson",
  "jones", "kelly", "kim", "lee", "lewis", "long", "lopez", "martin", "martinez", "miller",
  "mitchell", "moore", "morales", "morgan", "morris", "murphy", "nelson", "nguyen", "parker", "patel",
  "perry", "peterson", "phillips", "price", "ramirez", "reed", "richardson", "rivera", "roberts", "robinson",
  "rodriguez", "rogers", "ross", "ruiz", "sanders", "scott", "simmons", "smith", "stewart", "taylor",
  "thomas", "thompson", "torres", "turner", "walker", "ward", "watson", "white", "williams", "wilson",
  "wood", "wright", "young", "allen", "adams", "king", "baker", "hernandez", "powell", "russell",
]

const PATTERNS: Array<(firstName: string, lastName: string) => string> = [
  (f, l) => `${f}.${l}`,
  (f, l) => `${f}_${l}`,
  (f, l) => `${f}-${l}`,
  (f, l) => `${f}${l}`,
  (f, l) => `${f.slice(0, 1)}${l}`,
  (f, l) => `${f.slice(0, 1)}.${l}`,
  (f, l) => `${f}${l.slice(0, 1)}`,
  (f, l) => `${f}.${l.slice(0, 1)}`,
  (f, l) => `${l}.${f}`,
  (f, l) => `${l}${f.slice(0, 1)}`,
]

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

export function normalizeLocalPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/[._-]{2,}/g, ".")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 64)
}

export function generateEmployeeLocalPart(): string {
  const firstName = pick(FIRST_NAMES)
  const lastName = pick(LAST_NAMES)
  const pattern = pick(PATTERNS)
  let localPart = pattern(firstName, lastName)

  if (Math.random() < 0.45) {
    const suffixStrategy = Math.random()
    if (suffixStrategy < 0.5) {
      localPart += `${Math.floor(Math.random() * 90) + 10}`
    } else if (suffixStrategy < 0.8) {
      const shortYear = new Date().getFullYear().toString().slice(-2)
      localPart += `${shortYear}${Math.floor(Math.random() * 10)}`
    } else {
      localPart += `${Math.floor(Math.random() * 900) + 100}`
    }
  }

  return normalizeLocalPart(localPart)
}

export function buildRandomAddress(domain: string): string {
  const local = generateEmployeeLocalPart() || `user${Date.now().toString(36)}`
  return `${local}@${domain.toLowerCase()}`
}
