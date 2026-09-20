import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../../src/ide/event-bus';
import { IDEEvents } from '../../src/ide/types';

describe('EventBus', () => {
    it('should register and invoke listeners', () => {
        const bus = new EventBus();
        const callback = vi.fn();
        
        bus.on('file:selected', callback);
        bus.emit('file:selected', { fileName: 'test.py' });
        
        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith({ fileName: 'test.py' });
    });

    it('should unsubscribe listeners correctly', () => {
        const bus = new EventBus();
        const callback = vi.fn();
        
        const unsubscribe = bus.on('view:changed', callback);
        unsubscribe();
        
        bus.emit('view:changed', { viewMode: 'visual' });
        
        expect(callback).not.toHaveBeenCalled();
    });

    it('should handle manual off correctly', () => {
        const bus = new EventBus();
        const callback = vi.fn();
        
        bus.on('cell:selection-changed', callback);
        bus.off('cell:selection-changed', callback);
        
        bus.emit('cell:selection-changed', { indices: [1] });
        
        expect(callback).not.toHaveBeenCalled();
    });

    it('should handle errors in callbacks without crashing', () => {
        const bus = new EventBus();
        const failingCallback = vi.fn(() => {
            throw new Error('Test error');
        });
        const workingCallback = vi.fn();
        
        // Suppress console.error for this test to keep test output clean
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        bus.on('config:changed', failingCallback);
        bus.on('config:changed', workingCallback);
        
        // This should not throw
        bus.emit('config:changed', { options: {} });
        
        expect(failingCallback).toHaveBeenCalledTimes(1);
        expect(workingCallback).toHaveBeenCalledTimes(1);
        expect(consoleSpy).toHaveBeenCalled();
        
        consoleSpy.mockRestore();
    });
});
