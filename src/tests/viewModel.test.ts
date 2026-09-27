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
});

describe('local data load failure', () => {
  function makeFailingRepository(load: () => EnergyDocument) {
    return { load, save: vi.fn() };
  }

  it('enters the error phase (not the loading phase) when local data cannot be read', () => {
    const failing = makeFailingRepository(() => { throw new Error('storage blocked'); });
    const broken = new EnergyLensViewModel(failing);
    broken.initialize();
    const state = broken.getState();
    expect(state.loadPhase).toBe('error');
    expect(state.document).toBeNull();
    expect(state.notice?.kind).toBe('error');
    expect(state.notice?.text).toContain('读取失败');
  });

  it('never writes data while the error screen is shown', () => {
    const failing = makeFailingRepository(() => { throw new Error('storage blocked'); });
    const broken = new EnergyLensViewModel(failing);
    broken.initialize();
    broken.addDevice();
    broken.updateDevice('device-aircon', { watts: 900 });
    broken.updateSettings({ daysPerMonth: 31 });
    broken.removeDevice('device-aircon');
    broken.duplicateActive();
    broken.selectScenario('scenario-home');
    broken.complete();
    expect(failing.save).not.toHaveBeenCalled();
    expect(broken.getState().loadPhase).toBe('error');
  });

  it('retries without a page refresh and returns straight to the ready interface', () => {
    const healthy = { data: structuredClone({ version: 1 as const, scenarios: [structuredClone(exampleScenario)], activeScenarioId: exampleScenario.id }), save: vi.fn() };
    const load = vi.fn()
      .mockImplementationOnce(() => { throw new Error('temporary'); })
      .mockImplementationOnce(() => healthy.data);
    const retrying = new EnergyLensViewModel(makeFailingRepository(load));
    retrying.initialize();
    expect(retrying.getState().loadPhase).toBe('error');
    retrying.retryLoad();
    expect(load).toHaveBeenCalledTimes(2);
    const state = retrying.getState();
    expect(state.loadPhase).toBe('ready');
    expect(state.status).toBe('ready');
    expect(state.document?.activeScenarioId).toBe(exampleScenario.id);
    expect(retrying.activeSummary).not.toBeNull();
  });

  it('stays on the error screen when a retry also fails, and keeps data untouched', () => {
    const failing = makeFailingRepository(() => { throw new Error('still blocked'); });
    const broken = new EnergyLensViewModel(failing);
    broken.initialize();
    broken.retryLoad();
    expect(broken.getState().loadPhase).toBe('error');
    expect(failing.save).not.toHaveBeenCalled();
  });
});
