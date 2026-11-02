// A select and a menu, live, and with ?open (`open`) the same two held open for screenshots. The
// live menu ends in the editor's Theme row, which recolours this page too: every component here,
// in every theme.
import { useState } from 'react';
import { Button } from '../../../../shared/ui/kit/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../../shared/ui/kit/dropdown-menu.tsx';
import { Icon } from '../../../../shared/ui/kit/icon.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../shared/ui/kit/select.tsx';
import { ThemeMenu } from '../../../../shared/ui/theme-menu.tsx';
import { Cell, Output, Row } from '../cell.tsx';

const METHODS = ['ANY', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((value) => ({
  value,
  label: value === 'ANY' ? 'Any method' : value,
}));

export function SelectSection({ open }: { open: boolean }) {
  const [method, setMethod] = useState('GET');
  const [action, setAction] = useState('');
  return (
    <Cell title="Select and menu" note="arrows move, Enter chooses, Esc closes">
      <Row label="Live: a select and a menu" className="flex items-center gap-3">
        <div className="w-[150px]">
          <Select
            items={METHODS}
            value={method}
            onValueChange={(next) => setMethod(next as string)}
          >
            <SelectTrigger aria-label="HTTP method" data-testid="kit-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METHODS.map((item) => (
                <SelectItem
                  key={item.value}
                  value={item.value}
                  data-testid={`kit-select-${item.value}`}
                >
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="border border-border"
                aria-label="More actions"
                data-testid="kit-menu"
              />
            }
          >
            <Icon name="more" size={18} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setAction('Duplicate')}>
              <Icon name="copy" /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setAction('Export')}>
              <Icon name="export" /> Export this rule
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setAction('Delete')}
              data-testid="kit-menu-delete"
            >
              <Icon name="close" /> Delete
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <ThemeMenu />
          </DropdownMenuContent>
        </DropdownMenu>
        <Output testid="kit-picked">
          {method} · {action ? `ran ${action}` : 'no menu item run yet'}
        </Output>
      </Row>
      {open && <OpenPopups />}
    </Cell>
  );
}

// The select and the menu held open, for screenshots (?open), with room below for their lists.
function OpenPopups() {
  return (
    <Row
      label="Held open: a select, and a menu with Delete highlighted"
      className="flex h-[250px] items-start gap-[70px]"
    >
      <div className="w-[150px]">
        <Select items={METHODS} defaultValue="GET" open modal={false}>
          <SelectTrigger aria-label="HTTP method">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {METHODS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DropdownMenu open modal={false}>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="border border-border bg-pressed text-foreground"
              aria-label="More actions"
            />
          }
        >
          <Icon name="more" size={18} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem>
            <Icon name="copy" /> Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Icon name="export" /> Export this rule
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            className="bg-foreground text-inverse [&_[data-slot=icon]]:text-inverse"
          >
            <Icon name="close" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </Row>
  );
}
