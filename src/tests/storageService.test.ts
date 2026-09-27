// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { exampleScenario } from '../domain';
import { LocalEnergyRepository } from '../repository';

describe('local persistence recovery', () => {
  beforeEach(() => localStorage.clear());

  it('falls back to the example scenario only when nothing is stored yet', () => {
    const fresh = new LocalEnergyRepository().load();
    expect(fresh.activeScenarioId).toBe(exampleScenario.id);
    expect(fresh.scenarios[0].devices.length).toBeGreaterThan(0);
  });

  it('surfaces damaged saved JSON as a read failure instead of silently replacing it', () => {
    localStorage.setItem('energy-lens.document.v1', JSON.stringify({ version: 1, scenarios: [null], activeScenarioId: 'missing' }));
    expect(() => new LocalEnergyRepository().load()).toThrow();
  });

  it('surfaces unparseable stored content as a read failure', () => {
    localStorage.setItem('energy-lens.document.v1', '{not-json');
    expect(() => new LocalEnergyRepository().load()).toThrow();
  });
});
