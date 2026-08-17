import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

/** Structured location selection used by the Lead Finder. */
export interface StructuredLocation {
  countryCode: string;
  countryName: string;
  stateCode: string;
  stateName: string;
  cityName: string;
  area: string;
}

export const emptyLocation: StructuredLocation = {
  countryCode: "",
  countryName: "",
  stateCode: "",
  stateName: "",
  cityName: "",
  area: "",
};

/**
 * Composes "Area, City, State, Country" while dropping empty parts.
 * Kept string-shaped so the existing provider `location` field stays
 * backward compatible with older free-text searches.
 */
export function composeLocation(loc: StructuredLocation): string {
  return [loc.area.trim(), loc.cityName, loc.stateName, loc.countryName]
    .map((p) => p.trim())
    .filter(Boolean)
    .join(", ");
}

export function validateLocation(
  loc: StructuredLocation,
  hasStates: boolean,
  hasCities: boolean,
): string | null {
  if (!loc.countryCode) return "Select a country.";
  if (hasStates && !loc.stateCode) return "Select a state or province.";
  if (hasCities && !loc.cityName) return "Select a city.";
  return null;
}

type Option = { value: string; label: string };

/** Lazily-loaded dataset (country-state-city) so the city list never ships in the initial bundle. */
type Csc = typeof import("country-state-city");
let cscPromise: Promise<Csc> | null = null;
const loadCsc = () => (cscPromise ??= import("country-state-city"));

function Combobox({
  id,
  value,
  options,
  placeholder,
  emptyText,
  disabled,
  loading,
  onChange,
}: {
  id: string;
  value: string;
  options: Option[];
  placeholder: string;
  emptyText: string;
  disabled?: boolean;
  loading?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || loading}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {loading ? "Loading…" : (selected?.label ?? placeholder)}
          </span>
          {loading ? (
            <Loader2 className="size-4 shrink-0 animate-spin opacity-60" />
          ) : (
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "size-4",
                      option.value === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function LocationPicker({
  value,
  onChange,
  onAvailabilityChange,
}: {
  value: StructuredLocation;
  onChange: (next: StructuredLocation) => void;
  onAvailabilityChange?: (availability: { hasStates: boolean; hasCities: boolean }) => void;
}) {
  const [csc, setCsc] = useState<Csc | null>(null);
  const [loadingCities, setLoadingCities] = useState(false);
  const [cities, setCities] = useState<Option[]>([]);

  useEffect(() => {
    let active = true;
    loadCsc().then((mod) => {
      if (active) setCsc(mod);
    });
    return () => {
      active = false;
    };
  }, []);

  const countries = useMemo<Option[]>(
    () =>
      csc
        ? csc.Country.getAllCountries().map((c) => ({ value: c.isoCode, label: c.name }))
        : [],
    [csc],
  );

  const states = useMemo<Option[]>(
    () =>
      csc && value.countryCode
        ? csc.State.getStatesOfCountry(value.countryCode).map((s) => ({
            value: s.isoCode,
            label: s.name,
          }))
        : [],
    [csc, value.countryCode],
  );

  useEffect(() => {
    if (!csc || !value.countryCode || (states.length > 0 && !value.stateCode)) {
      setCities([]);
      return;
    }
    setLoadingCities(true);
    const list = value.stateCode
      ? csc.City.getCitiesOfState(value.countryCode, value.stateCode)
      : csc.City.getCitiesOfCountry(value.countryCode) ?? [];
    const seen = new Set<string>();
    setCities(
      list
        .filter((c) => (seen.has(c.name) ? false : (seen.add(c.name), true)))
        .map((c) => ({ value: c.name, label: c.name })),
    );
    setLoadingCities(false);
  }, [csc, value.countryCode, value.stateCode, states.length]);

  const hasStates = states.length > 0;
  const hasCities = cities.length > 0;

  useEffect(() => {
    onAvailabilityChange?.({ hasStates, hasCities });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasStates, hasCities]);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-1.5">
        <Label htmlFor="country">Country</Label>
        <Combobox
          id="country"
          value={value.countryCode}
          options={countries}
          placeholder="Search country…"
          emptyText="No country found."
          loading={!csc}
          onChange={(code) =>
            onChange({
              ...emptyLocation,
              area: value.area,
              countryCode: code,
              countryName: countries.find((c) => c.value === code)?.label ?? "",
            })
          }
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="state">State / Province</Label>
        <Combobox
          id="state"
          value={value.stateCode}
          options={states}
          placeholder={hasStates ? "Search state…" : "Not applicable"}
          emptyText="No state found."
          disabled={!value.countryCode || !hasStates}
          onChange={(code) =>
            onChange({
              ...value,
              stateCode: code,
              stateName: states.find((s) => s.value === code)?.label ?? "",
              cityName: "",
            })
          }
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="city">City</Label>
        <Combobox
          id="city"
          value={value.cityName}
          options={cities}
          placeholder={
            !value.countryCode
              ? "Select a country first"
              : hasStates && !value.stateCode
                ? "Select a state first"
                : "Search city…"
          }
          emptyText="No city found."
          disabled={!value.countryCode || (hasStates && !value.stateCode)}
          loading={loadingCities}
          onChange={(city) => onChange({ ...value, cityName: city })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="area">Area / Locality (optional)</Label>
        <Input
          id="area"
          value={value.area}
          placeholder="e.g. Gota"
          onChange={(e) => onChange({ ...value, area: e.target.value })}
        />
      </div>
    </div>
  );
}
