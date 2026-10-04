import { describe, expect, it } from 'vitest';
import { angularDistance, angularSpread, centralAngle, nearestView, viewAt, wrapDeg } from './views';

describe('angle helpers', () => {
  it('wraps angles to 0–360 and measures the short way round', () => {
    expect(wrapDeg(-30)).toBe(330);
    expect(wrapDeg(725)).toBe(5);
    expect(angularDistance(350, 10)).toBe(20);
    expect(angularDistance(90, 270)).toBe(180);
  });

  it('finds the central angle and spread across 0°', () => {
    expect(centralAngle([355, 2, 5])).toBe(2);
    expect(angularSpread([355, 2, 5])).toBe(10);
    expect(centralAngle([])).toBeNull();
  });
});

describe('viewAt', () => {
  it('assigns angles inside a view window to that view', () => {
    expect(viewAt(0, 15)).toBe('front');
    expect(viewAt(350, 15)).toBe('front');
    expect(viewAt(44, 15)).toBe('front-left');
    expect(viewAt(93, 15)).toBe('left');
    expect(viewAt(181, 15)).toBe('back');
    expect(viewAt(262, 15)).toBe('right');
  });

  it('returns null between windows (intermediate angles)', () => {
    expect(viewAt(22, 15)).toBeNull();
    expect(viewAt(68, 15)).toBeNull();
  });

  it('names the nearest view for any angle', () => {
    expect(nearestView(22).id).toBe('front');
    expect(nearestView(24).id).toBe('front-left');
  });
});
