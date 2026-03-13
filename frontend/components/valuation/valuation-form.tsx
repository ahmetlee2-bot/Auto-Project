import type { ReactNode } from "react";
import type { ValuationFormState } from "../../lib/valuation";
import { cityOptions, fuelOptions, sourceOptions, transmissionOptions, type FuelOption, type SourceKey, type TransmissionOption } from "../../lib/valuation";

type ValuationFormProps = {
  form: ValuationFormState;
  isLoading: boolean;
  onFieldChange: <K extends keyof ValuationFormState>(field: K, value: ValuationFormState[K]) => void;
  onSourceChange: (source: SourceKey) => void;
  onAnalyze: () => void;
  onSample: () => void;
};

export function ValuationForm({
  form,
  isLoading,
  onFieldChange,
  onSourceChange,
  onAnalyze,
  onSample,
}: ValuationFormProps) {
  return (
    <section className="panelCard glassCard">
      <div className="panelHeader">
        <div>
          <p className="sectionEyebrow">Vehicle intake</p>
          <h2>Arac bilgisi ve source secimi</h2>
        </div>
        <button className="ghostButton" type="button" onClick={onSample}>
          Sample
        </button>
      </div>

      <div className="sourceSwitch" role="radiogroup" aria-label="Source selection">
        {sourceOptions.map((option) => {
          const active = form.source === option.key;
          return (
            <button
              key={option.key}
              className={active ? "sourcePill active" : "sourcePill"}
              type="button"
              onClick={() => onSourceChange(option.key)}
            >
              <strong>{option.label}</strong>
              <span>{option.hint}</span>
            </button>
          );
        })}
      </div>

      <div className="valuationFormGrid">
        <Field label="Brand">
          <input value={form.brand} onChange={(event) => onFieldChange("brand", event.target.value)} />
        </Field>
        <Field label="Model">
          <input value={form.model} onChange={(event) => onFieldChange("model", event.target.value)} />
        </Field>
        <Field label="Year">
          <input
            type="number"
            value={form.year}
            onChange={(event) => onFieldChange("year", Number(event.target.value) || 0)}
          />
        </Field>
        <Field label="KM">
          <input
            type="number"
            value={form.km}
            onChange={(event) => onFieldChange("km", Number(event.target.value) || 0)}
          />
        </Field>
        <Field label="Fuel">
          <select value={form.fuel} onChange={(event) => onFieldChange("fuel", event.target.value as FuelOption)}>
            {fuelOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Transmission">
          <select
            value={form.transmission}
            onChange={(event) => onFieldChange("transmission", event.target.value as TransmissionOption)}
          >
            {transmissionOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>
        <Field label="City">
          <select value={form.city} onChange={(event) => onFieldChange("city", event.target.value)}>
            {cityOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Asking price">
          <input
            type="number"
            value={form.askingPrice}
            onChange={(event) => onFieldChange("askingPrice", Number(event.target.value) || 0)}
          />
        </Field>
        <Field label="Listing text" full>
          <textarea
            value={form.rawText}
            onChange={(event) => onFieldChange("rawText", event.target.value)}
            placeholder="Ilan aciklamasini buraya birak. Backend operator analizi bunu kullanir."
          />
        </Field>
        <Field label="Listing URL" full>
          <input
            value={form.url}
            onChange={(event) => onFieldChange("url", event.target.value)}
            placeholder="https://..."
          />
        </Field>
      </div>

      <div className="panelFooter">
        <p>Local valuation anlik guncellenir. Canli operator signal icin backend analyze tetiklenir.</p>
        <button className="primaryButton" type="button" onClick={onAnalyze} disabled={isLoading}>
          {isLoading ? "Operator analiz calisiyor..." : "Operator analizi calistir"}
        </button>
      </div>
    </section>
  );
}

type FieldProps = {
  label: string;
  full?: boolean;
  children: ReactNode;
};

function Field({ label, full = false, children }: FieldProps) {
  return (
    <label className={full ? "field full" : "field"}>
      <span>{label}</span>
      {children}
    </label>
  );
}
