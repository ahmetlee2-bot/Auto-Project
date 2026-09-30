import type { ReactNode } from "react";
import type { ValuationFormState } from "../../lib/valuation";
import {
  cityOptions,
  fuelOptions,
  sourceOptions,
  transmissionOptions,
  type FuelOption,
  type SourceKey,
  type TransmissionOption,
} from "../../lib/valuation";

type ValuationFormProps = {
  form: ValuationFormState;
  isLoading: boolean;
  onFieldChange: <K extends keyof ValuationFormState>(
    field: K,
    value: ValuationFormState[K],
  ) => void;
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
          <p className="sectionEyebrow">Fahrzeugdaten</p>
          <h2>Fahrzeug und Datenquelle</h2>
        </div>
        <button className="ghostButton" type="button" onClick={onSample}>
          Beispieldaten laden
        </button>
      </div>

      <div
        className="sourceSwitch"
        role="radiogroup"
        aria-label="Datenquelle auswählen"
      >
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
        <Field label="Marke">
          <input
            value={form.brand}
            onChange={(event) => onFieldChange("brand", event.target.value)}
          />
        </Field>
        <Field label="Modell">
          <input
            value={form.model}
            onChange={(event) => onFieldChange("model", event.target.value)}
          />
        </Field>
        <Field label="Baujahr">
          <input
            type="number"
            value={form.year}
            onChange={(event) =>
              onFieldChange("year", Number(event.target.value) || 0)
            }
          />
        </Field>
        <Field label="Kilometerstand">
          <input
            type="number"
            value={form.km}
            onChange={(event) =>
              onFieldChange("km", Number(event.target.value) || 0)
            }
          />
        </Field>
        <Field label="Kraftstoff">
          <select
            value={form.fuel}
            onChange={(event) =>
              onFieldChange("fuel", event.target.value as FuelOption)
            }
          >
            {fuelOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Getriebe">
          <select
            value={form.transmission}
            onChange={(event) =>
              onFieldChange(
                "transmission",
                event.target.value as TransmissionOption,
              )
            }
          >
            {transmissionOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Stadt">
          <select
            value={form.city}
            onChange={(event) => onFieldChange("city", event.target.value)}
          >
            {cityOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Angebotspreis">
          <input
            type="number"
            value={form.askingPrice}
            onChange={(event) =>
              onFieldChange("askingPrice", Number(event.target.value) || 0)
            }
          />
        </Field>
        <Field label="Inseratstext" full>
          <textarea
            value={form.rawText}
            onChange={(event) => onFieldChange("rawText", event.target.value)}
            placeholder="Füge hier den Text des Inserats ein. Er wird für die Serveranalyse verwendet."
          />
        </Field>
        <Field label="Inserat-URL" full>
          <input
            value={form.url}
            onChange={(event) => onFieldChange("url", event.target.value)}
            placeholder="https://..."
          />
        </Field>
      </div>

      <div className="panelFooter">
        <p>
          Die lokale Schätzung wird sofort aktualisiert. Für eine Serveranalyse
          klicke auf „Fahrzeug analysieren“.
        </p>
        <button
          className="primaryButton"
          type="button"
          onClick={onAnalyze}
          disabled={isLoading}
        >
          {isLoading ? "Analyse läuft …" : "Fahrzeug analysieren"}
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
