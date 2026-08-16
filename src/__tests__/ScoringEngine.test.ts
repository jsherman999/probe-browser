import { describe, it, expect } from 'vitest';
import { ScoringEngine } from '../game/ScoringEngine';

describe('ScoringEngine', () => {
  const engine = new ScoringEngine();

  it('scores position 0 as 5', () => {
    expect(engine.getPositionPoints(0)).toBe(5);
  });

  it('scores position 1 as 10', () => {
    expect(engine.getPositionPoints(1)).toBe(10);
  });

  it('scores position 2 as 15', () => {
    expect(engine.getPositionPoints(2)).toBe(15);
  });

  it('repeats the 5/10/15 pattern', () => {
    expect(engine.getPositionPoints(3)).toBe(5);
    expect(engine.getPositionPoints(4)).toBe(10);
    expect(engine.getPositionPoints(5)).toBe(15);
    expect(engine.getPositionPoints(6)).toBe(5);
  });

  it('sums multiple positions', () => {
    expect(engine.calculateScore([0, 1, 2])).toBe(30);
    expect(engine.calculateScore([0, 3])).toBe(10);
  });

  it('scores blank positions as 0', () => {
    expect(engine.calculateScore([0, 1], pos => pos === 1)).toBe(5);
  });
});
