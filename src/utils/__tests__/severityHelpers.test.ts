import { describe, it, expect } from 'vitest';
import { SEVERITY_ORDER, getSeverityBadgeClass } from '../severityHelpers';

describe('SEVERITY_ORDER', () => {
  it('ranks CRITICAL highest (lowest number)', () => {
    expect(SEVERITY_ORDER['CRITICAL']).toBe(0);
    expect(SEVERITY_ORDER['critical']).toBe(0);
  });

  it('ranks info lowest', () => {
    expect(SEVERITY_ORDER['info']).toBe(4);
  });

  it('maps HIGH to 1', () => {
    expect(SEVERITY_ORDER['HIGH']).toBe(1);
  });

  it('maps MEDIUM and warning to 2', () => {
    expect(SEVERITY_ORDER['MEDIUM']).toBe(2);
    expect(SEVERITY_ORDER['warning']).toBe(2);
  });
});

describe('getSeverityBadgeClass', () => {
  it('returns red for CRITICAL', () => {
    expect(getSeverityBadgeClass('CRITICAL')).toContain('red');
  });

  it('returns orange for HIGH', () => {
    expect(getSeverityBadgeClass('HIGH')).toContain('orange');
  });

  it('returns yellow for MEDIUM or WARNING', () => {
    expect(getSeverityBadgeClass('MEDIUM')).toContain('yellow');
    expect(getSeverityBadgeClass('WARNING')).toContain('yellow');
  });

  it('returns blue for LOW/unknown', () => {
    expect(getSeverityBadgeClass('LOW')).toContain('blue');
    expect(getSeverityBadgeClass('info')).toContain('blue');
  });
});
