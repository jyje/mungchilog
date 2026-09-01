import { useEffect, useRef, useState } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { Input } from "./ui/input";

export type PlaceSelection = {
  name: string;
  placeId: string;
  lat: number;
  lng: number;
  category?: string;
};

/**
 * Free-text spot-name input backed by the New Places API's Autocomplete
 * (google.maps.places.AutocompleteSuggestion) when it's available, so a
 * spot created from the web form gets a real placeId/lat/lng - the same
 * data /import already carries - instead of staying an unlocatable pin.
 *
 * Degrades to a plain text field whenever the "places" library hasn't
 * loaded (no API key) or a lookup fails (e.g. the server/web key hasn't
 * had Places API (New) unblocked yet, see docs/google-maps-setup.md):
 * onChange still fires so the trip stays fully usable by typed name alone.
 */
export function PlaceAutocompleteInput({
  value,
  onChange,
  onSelect,
  placeholder,
  autoFocus = true,
}: {
  value: string;
  onChange: (text: string) => void;
  onSelect: (place: PlaceSelection) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const placesLib = useMapsLibrary("places");
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const sessionToken = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!placesLib) return;
    sessionToken.current = new placesLib.AutocompleteSessionToken();
  }, [placesLib]);

  useEffect(() => {
    if (!placesLib || !value.trim()) {
      setSuggestions([]);
      return;
    }
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: value,
        sessionToken: sessionToken.current ?? undefined,
      })
        .then(({ suggestions: results }) => {
          setSuggestions(results ?? []);
          setOpen((results ?? []).length > 0);
        })
        .catch(() => {
          // Places API (New) may still be blocked for this key - fall back
          // to plain free-text entry rather than surfacing an API error.
          setSuggestions([]);
        });
    }, 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [placesLib, value]);

  async function pick(suggestion: google.maps.places.AutocompleteSuggestion) {
    const prediction = suggestion.placePrediction;
    if (!prediction) return;
    try {
      const { place } = await prediction.toPlace().fetchFields({
        fields: ["displayName", "location", "primaryTypeDisplayName"],
      });
      onSelect({
        name: place.displayName ?? prediction.text.text,
        placeId: prediction.placeId,
        lat: place.location?.lat() ?? 0,
        lng: place.location?.lng() ?? 0,
        category: place.primaryTypeDisplayName ?? undefined,
      });
    } catch {
      // Details fetch failed - still record the placeId/name from the
      // prediction itself so the spot isn't left worse off than free text.
      onSelect({ name: prediction.text.text, placeId: prediction.placeId, lat: 0, lng: 0 });
    }
    setOpen(false);
    setSuggestions([]);
    sessionToken.current = placesLib ? new placesLib.AutocompleteSessionToken() : null;
  }

  return (
    <div className="place-autocomplete">
      <Input
        className="min-h-11"
        type="text"
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && suggestions.length > 0 && (
        <ul className="place-suggestions">
          {suggestions.map((s, i) => (
            <li key={s.placePrediction?.placeId ?? i} onMouseDown={() => pick(s)}>
              {s.placePrediction?.text.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
