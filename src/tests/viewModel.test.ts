import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exampleScenario } from '../domain';
import type { EnergyDocument } from '../types';
import { EnergyLensViewModel } from '../viewModel';
import type { EnergyRepository } from '../repository';

function makeRepository(): EnergyRepository & { data: EnergyDocument; save: ReturnType<typeof vi.fn> } {
  const data: EnergyDocument = { version: 1, scenarios: [structuredClone(exampleScenario)], activeScenarioId: exampleScenario.id };
  return { data, load: () => data, save: vi.fn((next: EnergyDocument) => { data.scenarios = next.scenarios; data.activeScenarioId = next.activeScenarioId; }) };
}

describe('EnergyLensViewModel', () => {
  let repository: ReturnType<typeof makeRepository>;
  let vm: EnergyLensViewModel;
  beforeEach(() => { repository = makeRepository(); vm = new EnergyLensViewModel(repository); vm.initialize(); });

  it('initializes, persists edits, and recalculates results', () => {
    expect(vm.getState().status).toBe('ready');
    const before = vm.activeSummary?.total.monthlyKwh;
    vm.updateDevice('device-aircon', { dailyHours: 2 });
    expect(vm.activeSummary?.total.monthlyKwh).toBeLessThan(before ?? Infinity);
    expect(repository.save).toHaveBeenCalled();
  });

  it('keeps invalid values out of the document and exposes an error notice', () => {
    vm.updateDevice('device-aircon', { watts: -50 });
    expect(vm.getState().status).toBe('error');
    expect(vm.getState().notice?.text).toBe('功率不能为负数');
    expect(vm.activeScenario?.devices[0].watts).toBe(1200);
  });

  it('duplicates a scenario and can recover a saved document', () => {
    vm.duplicateActive();
    expect(vm.getState().document?.scenarios).toHaveLength(2);
    const recovered = new EnergyLensViewModel(repository);
    recovered.initialize();
    expect(recovered.getState().document?.scenarios).toHaveLength(2);
  });

  it('surfaces persistence failure as a recoverable error', () => {
    repository.save.mockImplementation(() => { throw new Error('quota'); });
    vm.addDevice();
    expect(vm.getState().status).toBe('error');
    expect(vm.getState().notice?.text).toContain('保存失败');
  });

  it('moves to a dedicated load-error state when the initial read fails', () => {
    const failing: EnergyRepository = { load: () => { throw new Error('denied'); }, save: vi.fn() };
    const broken = new EnergyLensViewModel(failing);
    expect(broken.getState().status).toBe('loading');
    broken.initialize();
    expect(broken.getState().status).toBe('load-error');
    expect(broken.getState().document).toBeNull();
    expect(broken.getState().notice?.kind).toBe('error');
  });

  it('recovers through retry without a page reload', () => {
    let attempts = 0;
    const flaky: EnergyRepository = {
      load: () => {
        attempts += 1;
        if (attempts === 1) throw new Error('transient');
        return { version: 1, scenarios: [structuredClone(exampleScenario)], activeScenarioId: exampleScenario.id };
      },
      save: vi.fn(),
    };
    const recovered = new EnergyLensViewModel(flaky);
    recovered.initialize();
    expect(recovered.getState().status).toBe('load-error');
    recovered.retry();
    expect(recovered.getState().status).toBe('ready');
    expect(recovered.activeScenario).not.toBeNull();
  });

  it('never writes to storage while loading or after a load failure', () => {
    const failing: EnergyRepository & { save: ReturnType<typeof vi.fn> } = { load: () => { throw new Error('denied'); }, save: vi.fn() };
    const broken = new EnergyLensViewModel(failing);
    broken.addDevice();
    broken.complete();
    broken.initialize();
    broken.addDevice();
    broken.updateSettings({ daysPerMonth: 10 });
    broken.duplicateActive();
    broken.selectScenario('scenario-home');
    broken.complete();
    expect(failing.save).not.toHaveBeenCalled();
    expect(broken.getState().status).toBe('load-error');
  });
});
