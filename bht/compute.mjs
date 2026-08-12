import { monthlyWorkTypeCounts, buildDailyAssignment } from '../packages/input-core/dist/index.js'
import fs from 'fs'
const d = JSON.parse(fs.readFileSync('./extracted.json','utf8'))
const pad = n => String(n).padStart(2,'0')
const date = day => `2026-06-${pad(day)}`
// normalize position code to base workType (責/日B/日C/夜A/夜B/臨時/研)
const base = p => {
  const first = p.split('/')[0].trim()
  if (first.startsWith('責')) return '責'
  if (first.startsWith('日B')) return '日B'
  if (first.startsWith('日C')) return '日C'
  if (first.startsWith('夜A')) return '夜A'
  if (first.startsWith('夜B')) return '夜B'
  if (first.startsWith('臨')) return '臨時'
  if (first.includes('研')) return '研'
  return first
}
// Build ShiftGrid cells from real roster (staff x date x workType=position)
const cells = d.roster.map(e => ({ staffId: e.staff, date: date(e.day), workType: base(e.pos), source:'base' }))
const grid = { siteId: d.site.name, month:'2026-06', cells }
// [input-core] monthlyWorkTypeCounts: per-staff shift-type distribution over the month
const counts = monthlyWorkTypeCounts(grid)
// [input-core] buildDailyAssignment for day 6 (positions from headcount)
const positions = [
  { position:'責', requiredHeadcount:1 },
  { position:'日B', requiredHeadcount:1 },
  { position:'日C', requiredHeadcount:1 },
  { position:'夜A', requiredHeadcount:1 },
  { position:'夜B', requiredHeadcount:1 },
]
const day = 6
const dayCells = cells.filter(c => c.date === date(day))
const assignment = buildDailyAssignment(d.site.name, date(day), dayCells, positions)
// per-staff total working days
const workdays = Object.fromEntries(Object.entries(counts).map(([s,m])=>[s, Object.values(m).reduce((a,b)=>a+b,0)]))
fs.writeFileSync('computed.json', JSON.stringify({ counts, workdays, assignmentDay6: assignment }, null, 1))
console.log('=== input-core computed on REAL BHT roster ===')
console.log('staff shift-type distribution (sample):')
for (const s of d.staff.slice(0,5)) console.log(' ', s, JSON.stringify(counts[s]||{}))
console.log('total working days per staff:', JSON.stringify(workdays))
console.log('Day-6 配置 (buildDailyAssignment):')
console.log('  cells:', assignment.cells.map(c=>`${c.position}:${c.staffId??'欠員'}`).join(' | '))
console.log('  vacancies:', JSON.stringify(assignment.vacancies))
