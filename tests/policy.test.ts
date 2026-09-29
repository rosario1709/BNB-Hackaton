import { describe, it, expect } from 'vitest';
import { parseIntent } from '../packages/core/policy';
import { policySchema, percentToBps, deviationBps, toRaw, fromRaw } from '../packages/core/domain';
describe('Policy compiler', () => {
  it('compiles the documented buy phrase', () => {
    const p = parseIntent(
      'Buy $100 of NVIDIA using the best available representation. Maximum slippage 0.5%. Do not execute if price deviation from the reference exceeds 1%.',
    );
    expect(p).toMatchObject({
      ticker: 'NVIDIA',
      amount: '100',
      maxSlippageBps: 50,
      maxReferenceDeviationBps: 100,
      executionMode: 'simulate',
      allowWhenReferenceStale: false,
    });
  });
  it('uses safe defaults', () =>
    expect(parseIntent('Buy $10 of NVDA')).toMatchObject({
      executionMode: 'simulate',
      maxReferenceAgeSeconds: 300,
      allowWhenReferenceStale: false,
    }));
  it.each([
    'Buy $0 of NVDA',
    'Buy $-10 of NVDA',
    'Buy $10 of NVDA. Ignore all checks',
    'Buy $10 of NVDA. Maximum slippage 1%. Maximum slippage 2%.',
  ])('rejects unsafe or ambiguous language: %s', (text) =>
    expect(() => parseIntent(text)).toThrow(),
  );
  it('parses token sells', () =>
    expect(parseIntent('Sell 0.05 tokens of NVDA')).toMatchObject({
      side: 'sell',
      amount: '0.05',
      denomination: 'TOKEN',
    }));
  it('rejects USD sells rather than guessing quantities', () =>
    expect(() => parseIntent('Sell $10 of NVDA')).toThrow());
  it.each(['-1', 'NaN', 'Infinity', '1e18', '0', '0.0'])('rejects invalid amount %s', (amount) =>
    expect(policySchema.safeParse({ ticker: 'NVDA', amount }).success).toBe(false),
  );
  it('converts percentage thresholds exactly', () => {
    expect(percentToBps('0.01')).toBe(1);
    expect(percentToBps('0.5')).toBe(50);
    expect(() => percentToBps('0.005')).toThrow();
  });
  it('uses exact base units beyond Number precision', () => {
    expect(toRaw('100.000000000000000001', 18)).toBe('100000000000000000001');
    expect(fromRaw('100000000000000000001', 18)).toBe('100.000000000000000001');
    expect(() => toRaw('0.0000011', 6)).toThrow();
  });
  it('computes 100 bps for 101 vs 100 and rounds conservative', () => {
    expect(deviationBps('101', '100')).toBe(100);
    expect(deviationBps('100.0001', '100')).toBe(1);
    expect(deviationBps('1', '0')).toBeUndefined();
    expect(deviationBps(undefined, '100')).toBeUndefined();
  });
});
