// Making groups: a new one, the stored ones rebuilt from data that can't be trusted, a name no
// other group has, and which groups are off, for the page and the badge, which read the rules as
// they're stored.
import type { Untrusted } from '../../lib/index.ts';
import { isId } from './rule.ts';
import type { Group } from './types.ts';

// A group as it's kept: with its place among the order's top-level entries (order.ts).
export interface StoredGroup extends Group {
  at: number;
}

export const NEW_GROUP = 'New group';
const MAX_NAME = 100;

export function createGroup(name = NEW_GROUP): Group {
  const now = Date.now();
  return { id: crypto.randomUUID(), name, enabled: true, createdAt: now, updatedAt: now };
}

// A group's name as it's typed in: one line, without spaces at its ends, 100 characters at most.
// '' when there's nothing left of it.
export function groupName(text: string) {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
}

// Whether another group than `except` has the name, ignoring case.
export function nameTaken(name: string, groups: readonly Group[], except = '') {
  const key = name.toLowerCase();
  return groups.some((group) => group.id !== except && group.name.toLowerCase() === key);
}

// The name, or the first after it no group has: "New group 2" and "PR-1 copy 2" (`count`, for
// one made here), or "PR-1 (2)" (`brackets`, for one an import brings).
export function freeName(
  name: string,
  groups: readonly Group[],
  style: 'count' | 'brackets' = 'count',
) {
  if (!nameTaken(name, groups)) return name;
  for (let number = 2; ; number++) {
    const next = style === 'count' ? `${name} ${number}` : `${name} (${number})`;
    if (!nameTaken(next, groups)) return next;
  }
}

// The stored groups (or a rules file's), each rebuilt from known keys and types, as rules are
// (normalizeRules): each with an id and a name no other has, a repeated name taking a number as
// an import's does. A group's place (`at`) is its index among the top-level entries; one without
// goes last.
export function normalizeGroups(list: unknown): StoredGroup[] {
  const groups: StoredGroup[] = [];
  for (const raw of Array.isArray(list) ? (list as Untrusted[]) : []) {
    if (!raw || typeof raw !== 'object' || !isId(raw.id)) continue;
    if (groups.some((group) => group.id === raw.id)) continue;
    const base = createGroup();
    const name = groupName(typeof raw.name === 'string' ? raw.name : '') || NEW_GROUP;
    groups.push({
      id: raw.id,
      name: freeName(name, groups, 'brackets'),
      enabled: raw.enabled !== false,
      createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : base.createdAt,
      updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : base.updatedAt,
      at: Number.isFinite(raw.at)
        ? Math.max(0, Math.trunc(raw.at))
        : Number.MAX_SAFE_INTEGER,
    });
  }
  return groups;
}

// The ids of the groups that are off, from the groups as they're stored: the badge counts only the
// rules in none of them. A group with no `enabled` is on, as normalizeGroups() has it.
export function offGroups(list: unknown) {
  const off = new Set<string>();
  for (const raw of Array.isArray(list) ? (list as Untrusted[]) : [])
    if (raw && isId(raw.id) && raw.enabled === false) off.add(raw.id);
  return off;
}
