import { olcerOlustur } from './olcer';
import type { Olcer } from './duzen';

let p: Promise<Olcer> | null = null;
/** Yazı ölçer bir kez oluşturulur ve ekranlar arasında paylaşılır. */
export const olcerAl = (): Promise<Olcer> => (p ??= olcerOlustur());
