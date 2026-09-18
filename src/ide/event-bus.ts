// src/ide/event-bus.ts
// Pragmatic Programmer: Decoupled & Orthogonal Event Dispatcher

import { IDEEvents } from './types';

type EventKey = keyof IDEEvents;
type Callback<K extends EventKey> = (data: IDEEvents[K]) => void;

export class EventBus {
    private listeners = new Map<EventKey, Set<Function>>();

    /**
     * Subscribe to an event. Returns an unsubscribe function.
     */
    on<K extends EventKey>(event: K, callback: Callback<K>): () => void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(callback);
        return () => this.off(event, callback);
    }

    /**
     * Unsubscribe from an event.
     */
    off<K extends EventKey>(event: K, callback: Callback<K>): void {
        const set = this.listeners.get(event);
        if (set) {
            set.delete(callback);
            if (set.size === 0) {
                this.listeners.delete(event);
            }
        }
    }

    /**
     * Emit an event with type-checked payload.
     */
    emit<K extends EventKey>(event: K, data?: IDEEvents[K]): void {
        const set = this.listeners.get(event);
        if (set) {
            // Clone set to prevent issues if handlers modify listeners during loop
            Array.from(set).forEach(cb => {
                try {
                    cb(data);
                } catch (err) {
                    console.error(`[EventBus] Error in handler for event "${event}":`, err);
                }
            });
        }
    }
}
