// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readDocument } from '../services/storageService';
import { exampleScenario } from '../domain';
import { LocalEnergyRepository } from '../repository';

describe('local persistence recovery', () => {
  beforeEach(() => localStorage.clear());

  it('falls back to a valid example when saved JSON is damaged', () => {
    localStorage.setItem('energy-lens.document.v1', JSON.stringify({ version: 1, scenarios: [null], activeScenarioId: 'missing' }));
    const recovered = new LocalEnergyRepository().load();
    expect(recovered.activeScenarioId).toBe(exampleScenario.id);
    expect(recovered.scenarios[0].devices.length).toBeGreaterThan(0);
  });

  it('treats first run with no local data as the onboarding path (example document)', () => {
    const firstRun = new LocalEnergyRepository().load();
    expect(firstRun.scenarios).toHaveLength(1);
    expect(firstRun.activeScenarioId).toBe(exampleScenario.id);
  });

  it('propagates a storage access failure instead of mistaking it for empty local data', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('access denied'); });
    expect(() => readDocument()).toThrow('access denied');
    getItem.mockRestore();
  });
});
