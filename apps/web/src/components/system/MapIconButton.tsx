import type { ComponentProps, ReactNode } from "react";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { cn } from "../../lib/utils";

type MapIconButtonProps = Omit<ComponentProps<typeof Button>, "children" | "size"> & {
  icon: ReactNode;
  label: string;
  selected?: boolean;
};

export function MapIconButton({ className, icon, label, selected, ...props }: MapIconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          {...props}
          variant="outline"
          size="icon-lg"
          aria-label={label}
          aria-pressed={selected}
          data-selected={selected || undefined}
          className={cn("size-11 rounded-full", className)}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent sideOffset={8}>{label}</TooltipContent>
    </Tooltip>
  );
}
