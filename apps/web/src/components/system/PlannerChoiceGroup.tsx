import * as React from "react";
import { Check } from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

type PlannerChoiceGroupProps = Omit<
  React.ComponentProps<typeof ToggleGroup>,
  "type" | "variant" | "size" | "value" | "defaultValue" | "onValueChange"
> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
};

/**
 * The shared contract for one-of-many planner choices such as dates and
 * travel modes. It keeps the official shadcn ToggleGroup interaction while
 * adding the app's mobile touch target and a non-colour-only selected mark.
 */
export function PlannerChoiceGroup({ className, ...props }: PlannerChoiceGroupProps) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="lg"
      className={cn("max-w-full", className)}
      {...props}
    />
  );
}

export function PlannerChoiceItem({ className, children, ...props }: React.ComponentProps<typeof ToggleGroupItem>) {
  return (
    <ToggleGroupItem
      className={cn(
        "group/planner-choice min-h-11 appearance-none gap-1.5 px-3 text-foreground data-[state=on]:font-semibold data-[state=on]:text-foreground",
        className,
      )}
      {...props}
    >
      <Check
        aria-hidden="true"
        className="size-3.5 opacity-0 transition-opacity group-data-[state=on]/planner-choice:opacity-100"
      />
      {children}
    </ToggleGroupItem>
  );
}
