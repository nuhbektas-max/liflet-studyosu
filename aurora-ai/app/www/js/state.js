// AURORA - beş durumlu davranış durum makinesi (şartname 5.1, 5.3).
// Unity sürümündeki RobotStateMachine.cs ile aynı kurallar. Tarayıcıya ve Node'a bağımlı değildir.

export const States = Object.freeze({
  IDLE: 'idle',
  LISTENING: 'listening',
  THINKING: 'thinking',
  SPEAKING: 'speaking',
  ERROR: 'error',
});

export const StateLabels = Object.freeze({
  idle: 'Bekliyor',
  listening: 'Dinliyor',
  thinking: 'Düşünüyor',
  speaking: 'Konuşuyor',
  error: 'Hata',
});

const ALLOWED = {
  idle: ['listening', 'thinking', 'speaking'],
  listening: ['thinking', 'idle'],
  thinking: ['speaking', 'idle'],
  speaking: ['idle', 'listening', 'thinking'],
  error: ['idle'],
};

export function isAllowed(from, to) {
  if (from === to) return false;
  if (to === States.ERROR) return true;
  return (ALLOWED[from] || []).includes(to);
}

/** Gözlenen girdilerden olması gereken durum (öncelik sırası önemli). */
export function desiredState(s) {
  if (s.error) return States.ERROR;
  if (s.microphoneOpen && s.userSpeaking) return States.LISTENING;
  if (s.characterSpeaking) return States.SPEAKING;
  if (s.awaitingResponse) return States.THINKING;
  if (s.microphoneOpen) return States.LISTENING;
  return States.IDLE;
}

export class RobotStateMachine {
  constructor({ minimumErrorSeconds = 3, now = 0 } = {}) {
    this.minimumErrorSeconds = minimumErrorSeconds;
    this.current = States.IDLE;
    this.previous = States.IDLE;
    this.enteredAt = now;
    this.errorMessage = null;
    this.listeners = [];
  }

  onChange(fn) { this.listeners.push(fn); }

  update(signals, now) {
    const target = desiredState(signals);
    if (this.current === States.ERROR) {
      if (target === States.ERROR) { this.errorMessage = signals.error; return this.current; }
      if (now - this.enteredAt < this.minimumErrorSeconds) return this.current;
    }
    if (target === States.ERROR) this.errorMessage = signals.error;
    if (target === this.current) return this.current;
    if (isAllowed(this.current, target)) {
      this._enter(target, now);
    } else {
      this._enter(States.IDLE, now);
      if (isAllowed(States.IDLE, target)) this._enter(target, now);
    }
    return this.current;
  }

  _enter(next, now) {
    if (next === this.current) return;
    this.previous = this.current;
    this.current = next;
    this.enteredAt = now;
    if (next !== States.ERROR) this.errorMessage = null;
    for (const fn of this.listeners) fn(this.previous, this.current);
  }
}
