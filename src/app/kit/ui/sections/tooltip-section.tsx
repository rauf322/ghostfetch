// Tooltips and key badges, live: rest the pointer on a control, or Tab to it. A tooltip with the
// key that does the same (⌘B on a Mac, Ctrl+B elsewhere), one in words only, one that says why a
// control is off, and at the row's right end the popup's pause button, whose tooltip test/kit.mjs
// keeps inside a 330 px window, as the popup is. A field's, which a click into the field doesn't
// open, though the field then has :focus-visible, and which a screen reader hears after the
// field's own description. Then key badges, and the editor's ⋯: a menu with a row's key and a
// row's detail, whose tooltip, its name already, describes nothing, and doesn't come back as the
// menu closes and gives the button focus back. The row's key is drawn and said by
// aria-keyshortcuts, its name staying its words.
import { Button } from '../../../../ui/kit/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuDetail,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '../../../../ui/kit/dropdown-menu.tsx';
import { Icon } from '../../../../ui/kit/icon.tsx';
import { Input } from '../../../../ui/kit/input.tsx';
import { Kbd, modKey, modKeyName } from '../../../../ui/kit/kbd.tsx';
import { Toggle } from '../../../../ui/kit/toggle.tsx';
import { Tooltip } from '../../../../ui/kit/tooltip.tsx';
import { Cell, Row } from '../cell.tsx';

export function TooltipSection() {
  return (
    <Cell title="Tooltip and key" note="rest the pointer on a control, or Tab to it">
      <Row
        label="With a key · words only · off, saying why · at the right end"
        className="flex items-center gap-2"
      >
        <Tooltip label="Hide the sidebar" keys={modKey('B')}>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Hide the sidebar"
            data-testid="kit-tooltip-key"
          >
            <Icon name="sidebar" size={18} />
          </Button>
        </Tooltip>
        <Tooltip label="Keep requests when the page reloads">
          <Toggle className="border-input" data-testid="kit-tooltip">
            Keep on reload
          </Toggle>
        </Tooltip>
        <Tooltip
          label="Turn on Agent access"
          reason="Paste your agent's pairing code first"
        >
          <Button size="sm" disabled data-testid="kit-tooltip-off">
            Turn on
          </Button>
        </Tooltip>
        <Tooltip label="Pause Ghostfetch: no rule answers anything until you resume">
          <button
            type="button"
            aria-label="Pause Ghostfetch"
            data-testid="kit-tooltip-edge"
            className="ml-auto flex size-[26px] items-center justify-center rounded-full border border-input text-t65 transition-colors hover:text-foreground"
          >
            <Icon name="pause" size={12} />
          </button>
        </Tooltip>
      </Row>
      <Row label="A field: Tab to it opens its tooltip, a click into it doesn't; its own description">
        <Tooltip label="Search by URL, method, status or rule name">
          <Input
            aria-label="Search requests"
            aria-describedby="kit-tooltip-field-hint"
            placeholder="URL, status or rule"
            data-testid="kit-tooltip-field"
            className="w-[260px]"
          />
        </Tooltip>
        <span id="kit-tooltip-field-hint" className="text-meta text-t40">
          Narrows the list as you type.
        </span>
      </Row>
      <Row
        label="Key badges: the search field's · a key's name · this platform's ⌘ or Ctrl"
        className="flex items-center gap-2"
      >
        <Kbd>/</Kbd>
        <Kbd>Enter</Kbd>
        <Kbd>{modKey('B')}</Kbd>
      </Row>
      <Row
        label="The editor's ⋯: a row's key, a row's detail"
        className="flex items-center gap-2"
      >
        <DropdownMenu>
          <Tooltip label="More">
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="border border-border"
                  aria-label="More"
                  data-testid="kit-menu-slots"
                />
              }
            >
              <Icon name="more" size={18} />
            </DropdownMenuTrigger>
          </Tooltip>
          <DropdownMenuContent align="start">
            <DropdownMenuItem aria-keyshortcuts={modKeyName('B')}>
              <Icon name="sidebar" /> Hide the sidebar
              <DropdownMenuShortcut>{modKey('B')}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Icon name="theme" /> Theme
              <DropdownMenuDetail>Ghostfetch</DropdownMenuDetail>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Row>
    </Cell>
  );
}
