import { ChevronDown, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type FilterId = string | number;

interface FilterOption {
  id: FilterId;
  label: string;
  country?: string;
  slug?: string | null;
  parentId?: FilterId | null;
  destinationType?: string;
  isOlympic?: boolean;
  sortOrder?: number | null;
}

interface FilterBarProps {
  competitors: FilterOption[];
  destinations: FilterOption[];
  selectedCompetitors: FilterId[];
  selectedDestinations: FilterId[];
  onCompetitorsChange: (next: FilterId[]) => void;
  onDestinationsChange: (next: FilterId[]) => void;
  competitorAnnotations?: Partial<Record<string, string>>;
}

export function FilterBar({
  competitors,
  destinations,
  selectedCompetitors,
  selectedDestinations,
  onCompetitorsChange,
  onDestinationsChange,
  competitorAnnotations = {},
}: FilterBarProps) {
  const toggle = (list: FilterId[], id: FilterId) =>
    list.includes(id) ? list.filter((item) => item !== id) : [...list, id];

  const selectedCompetitorOptions = competitors.filter((option) =>
    selectedCompetitors.includes(option.id),
  );
  const selectedDestinationOptions = destinations.filter((option) =>
    selectedDestinations.includes(option.id),
  );
  const greeceDestination = destinations.find((option) => option.slug === "greece" || option.label === "Greece");
  const greekDestinations = destinations.filter(
    (option) => greeceDestination && String(option.parentId ?? "") === String(greeceDestination.id),
  );
  const olympicDestinations = destinations.filter(
    (option) => option.isOlympic && !option.parentId,
  );
  const otherDestinations = destinations.filter(
    (option) => !option.isOlympic && !option.parentId,
  );
  const allCompetitorsSelected =
    competitors.length > 0 && selectedCompetitors.length === competitors.length;
  const allOlympicDestinationsSelected =
    olympicDestinations.length > 0 &&
    olympicDestinations.every((option) => selectedDestinations.includes(option.id));
  const allOtherDestinationsSelected =
    otherDestinations.length > 0 &&
    otherDestinations.every((option) => selectedDestinations.includes(option.id));
  const allGreekDestinationsSelected =
    greekDestinations.length > 0 &&
    greekDestinations.every((option) => selectedDestinations.includes(option.id));

  const toggleDestinationGroup = (options: FilterOption[], allSelected: boolean) => {
    const optionIds = new Set(options.map((option) => option.id));
    if (allSelected) {
      return selectedDestinations.filter((id) => !optionIds.has(id));
    }

    const next = [...selectedDestinations];
    options.forEach((option) => {
      if (!next.includes(option.id)) {
        next.push(option.id);
      }
    });
    return next;
  };

  const renderDestinationDropdown = (
    label: string,
    allLabel: string,
    options: FilterOption[],
    allSelected: boolean,
  ) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" className="h-11 rounded-full px-5 text-sm font-medium">
          {label} <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-80 w-72 overflow-y-auto overflow-x-hidden"
      >
        <DropdownMenuCheckboxItem
          checked={allSelected}
          onCheckedChange={() =>
            onDestinationsChange(toggleDestinationGroup(options, allSelected))
          }
        >
          {allLabel}
        </DropdownMenuCheckboxItem>
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.id}
            checked={selectedDestinations.includes(option.id)}
            onCheckedChange={() =>
              onDestinationsChange(toggle(selectedDestinations, option.id))
            }
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="rounded-lg border bg-card shadow-card">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" className="h-11 rounded-full px-5 text-sm font-medium">
              Competitors <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="max-h-80 w-64 overflow-y-auto overflow-x-hidden"
          >
            <DropdownMenuCheckboxItem
              checked={allCompetitorsSelected}
              onCheckedChange={() =>
                onCompetitorsChange(
                  allCompetitorsSelected ? [] : competitors.map((option) => option.id),
                )
              }
            >
              All
            </DropdownMenuCheckboxItem>
            {competitors.map((option) => (
              <DropdownMenuCheckboxItem
                key={option.id}
                checked={selectedCompetitors.includes(option.id)}
                onCheckedChange={() =>
                  onCompetitorsChange(toggle(selectedCompetitors, option.id))
                }
              >
                <div className="flex flex-col">
                  <span>{option.label}</span>
                  {competitorAnnotations[String(option.id)] ? (
                    <span className="text-xs text-muted-foreground">
                      {competitorAnnotations[String(option.id)]}
                    </span>
                  ) : null}
                </div>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {renderDestinationDropdown(
          "Olympic destinations",
          "All Olympic destinations",
          olympicDestinations,
          allOlympicDestinationsSelected,
        )}

        {greekDestinations.length > 0
          ? renderDestinationDropdown(
              "Greek destinations",
              "All Greek destinations",
              greekDestinations,
              allGreekDestinationsSelected,
            )
          : null}

        {renderDestinationDropdown(
          "Other monitored destinations",
          "All other monitored destinations",
          otherDestinations,
          allOtherDestinationsSelected,
        )}
      </div>

      <div className="border-t px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {selectedCompetitorOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() =>
                onCompetitorsChange(selectedCompetitors.filter((id) => id !== option.id))
              }
              className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-sm text-foreground shadow-sm"
            >
              {option.label}
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
          {selectedDestinationOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() =>
                onDestinationsChange(selectedDestinations.filter((id) => id !== option.id))
              }
              className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-sm text-foreground shadow-sm"
            >
              {option.label}
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
          {selectedCompetitorOptions.length === 0 && selectedDestinationOptions.length === 0 ? (
            <span className="text-sm text-muted-foreground">No filters selected</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
