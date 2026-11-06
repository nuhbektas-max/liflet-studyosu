import type { Slot, SlotContent, YaziStili } from '../model/types';

export const VARSAYILAN_STIL: YaziStili = { aile: 'Sans', punto: 10, satirAraligi: 1.25, hiza: 'sol' };

export const stilBul = (a: Slot, c?: SlotContent): YaziStili => ({ ...VARSAYILAN_STIL, ...a.yazi, ...c?.yazi });
