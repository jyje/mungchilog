import { ChevronDown } from "lucide-react";
import { Button } from "../ui/button";
import { ButtonGroup } from "../ui/button-group";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";

type DateAddSplitButtonProps = {
  onAddDay: () => void;
  onOpenDateAdd: () => void;
};

/** Shared split-button treatment for the default and custom date actions. */
export function DateAddSplitButton({ onAddDay, onOpenDateAdd }: DateAddSplitButtonProps) {
  return (
    <ButtonGroup role="group" aria-label="날짜 추가">
      <Button type="button" variant="outline" onClick={onAddDay}>
        + 날짜
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="특정 날짜 추가"
          >
            <ChevronDown aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="date-add-split-menu">
          <DropdownMenuItem onSelect={onOpenDateAdd}>특정 날짜 선택</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  );
}
