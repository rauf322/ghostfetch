// Inputs: in their states, small, in a toolbar cell and as a title, a live one, and the hints under
// a field.
import { useState } from 'react';
import { CardHint } from '../../../../shared/ui/kit/card.tsx';
import { Icon } from '../../../../shared/ui/kit/icon.tsx';
import { Input } from '../../../../shared/ui/kit/input.tsx';
import { Cell, Output, Row } from '../cell.tsx';

export function InputSection() {
  const [url, setUrl] = useState('/api/user');
  return (
    <Cell title="Input">
      <Row label="Empty · filled · hover · focus" className="grid grid-cols-4 gap-2">
        <Input placeholder="/api/users" aria-label="Empty" />
        <Input defaultValue="/api/user" aria-label="Filled" />
        <Input defaultValue="/api/user" aria-label="Hover" className="border-[#444]" />
        <Input
          defaultValue="/api/user"
          aria-label="Focus"
          className="border-foreground"
        />
      </Row>
      <Row
        label="Small · in a cell · title"
        className="grid grid-cols-3 items-stretch gap-2"
      >
        <Input
          size="sm"
          placeholder="Paste a URL to test the pattern"
          aria-label="Test URL"
        />
        <div className="relative flex h-[42px] items-center border border-border">
          <span className="pointer-events-none absolute left-3.5 flex text-t30">
            <Icon name="search" size={14} />
          </span>
          <Input
            variant="bare"
            type="search"
            placeholder="Search rules"
            aria-label="Search rules"
            className="flex-1 pl-9"
          />
        </div>
        <div className="flex h-11 border border-border">
          <Input
            variant="bare"
            defaultValue="Logged-in admin user"
            aria-label="Rule name"
            className="flex-1 px-3.5 text-title font-medium text-white"
          />
        </div>
      </Row>
      <Row label="Live" className="flex items-center gap-3">
        <Input
          data-testid="kit-input"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          aria-label="URL pattern"
          className="w-[260px]"
        />
        <Output testid="kit-input-value">{url || 'empty'}</Output>
      </Row>
      <Row label="Hint · problem" className="flex flex-col gap-1">
        <CardHint>Matches when the full URL contains this text, e.g. /api/users</CardHint>
        <CardHint tone="bad">Invalid regular expression: missing )</CardHint>
      </Row>
    </Cell>
  );
}
