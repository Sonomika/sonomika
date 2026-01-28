import { MIDIMapping } from '../store/types';

const DEFAULT_KEYS_FOR_20_COLUMNS = [
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '0',
  'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p',
];

/**
 * Default "key -> column" mapping for a new set.
 *
 * This matches the user's saved mapping format (type "key", modifiers false),
 * mapping:
 * - 1..0 => columns 1..10
 * - q..p => columns 11..20
 */
export function createDefaultKeyToColumnMappings(): MIDIMapping[] {
  return DEFAULT_KEYS_FOR_20_COLUMNS.map((key, i) => ({
    type: 'key',
    key,
    ctrl: false,
    shift: false,
    alt: false,
    meta: false,
    enabled: true,
    target: { type: 'column', index: i + 1 },
  }));
}

