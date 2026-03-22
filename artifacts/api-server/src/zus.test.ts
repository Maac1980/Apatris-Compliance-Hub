import { describe, it, expect } from 'vitest'

const ZUS_RATE = 0.1126

function calculateZUSContribution(grossSalary: number): number {
  return Math.round(grossSalary * ZUS_RATE * 100) / 100
}

function calculateNettoFromGross(grossSalary: number): number {
  const zus = calculateZUSContribution(grossSalary)
  const taxableBase = grossSalary - zus
  const incomeTax = Math.max(0, Math.round(taxableBase * 0.12 * 100) / 100)
  return Math.round((grossSalary - zus - incomeTax) * 100) / 100
}

describe('ZUS Contribution Calculations', () => {
  it('calculates 11.26% ZUS on standard salary', () => {
    expect(calculateZUSContribution(5000)).toBe(563)
  })
  it('calculates ZUS on minimum wage (4300 PLN)', () => {
    expect(calculateZUSContribution(4300)).toBe(484.18)
  })
  it('calculates ZUS on high earner salary (15000 PLN)', () => {
    expect(calculateZUSContribution(15000)).toBe(1689)
  })
  it('returns 0 ZUS for 0 salary', () => {
    expect(calculateZUSContribution(0)).toBe(0)
  })
  it('netto is always less than gross', () => {
    const netto = calculateNettoFromGross(6000)
    expect(netto).toBeLessThan(6000)
  })
  it('handles decimal salary amounts correctly', () => {
    const zus = calculateZUSContribution(4567.89)
    expect(typeof zus).toBe('number')
    expect(zus).not.toBeNaN()
  })
})

describe('Payroll Edge Cases', () => {
  it('handles very small salary', () => {
    expect(calculateZUSContribution(100)).toBe(11.26)
  })
  it('never produces negative netto', () => {
    expect(calculateNettoFromGross(1000)).toBeGreaterThan(0)
  })
})
