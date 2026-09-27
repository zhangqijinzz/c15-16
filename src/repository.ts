import { exampleScenario } from './domain';
import { readDocument, writeDocument } from './services/storageService';
import type { EnergyDocument, EnergyScenario } from './types';

export interface EnergyRepository {
  load(): EnergyDocument;
  save(document: EnergyDocument): void;
}

export class LocalEnergyRepository implements EnergyRepository {
  load(): EnergyDocument {
    const saved = readDocument();
    if (!saved) {
      return { version: 1, scenarios: [exampleScenario], activeScenarioId: exampleScenario.id };
    }
    return saved;
  }

  save(document: EnergyDocument): void {
    writeDocument(document);
  }
}

export function findScenario(document: EnergyDocument, id: string): EnergyScenario | undefined {
  return document.scenarios.find((scenario) => scenario.id === id);
}
