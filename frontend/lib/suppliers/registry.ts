import "server-only";
import type { SupplierAdapter } from "./types";
import { amazonAdapter } from "./amazonAdapter";
import { joybuyAdapter } from "./joybuyAdapter";

export class SupplierRegistry {
  constructor(private readonly adapters: SupplierAdapter[]) {}
  resolve(input: string): SupplierAdapter {
    const adapter = this.adapters.find((candidate) => candidate.canHandle(input));
    if (!adapter) throw new Error("Unterstützte Quelle nicht erkannt. Bitte Amazon.de oder Joybuy.de verwenden.");
    return adapter;
  }
}
export const supplierRegistry = new SupplierRegistry([amazonAdapter, joybuyAdapter]);
