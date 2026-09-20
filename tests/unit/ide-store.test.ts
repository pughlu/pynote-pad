import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IDEStore } from '../../src/ide/store';
import { EventBus } from '../../src/ide/event-bus';

describe('IDEStore', () => {
    let bus: EventBus;
    let store: IDEStore;
    let emitSpy: any;

    beforeEach(() => {
        bus = new EventBus();
        emitSpy = vi.spyOn(bus, 'emit');
        store = new IDEStore(bus);
    });

    it('should initialize with default state', () => {
        const state = store.getState();
        expect(state.activeFileName).toBe('untitled');
        expect(state.viewMode).toBe('visual');
        expect(state.files['untitled']).toBeDefined();
    });

    it('should create a new file and emit events', () => {
        const fileName = store.createFile('test_notebook');
        
        expect(fileName).toBe('test_notebook');
        expect(store.files[fileName]).toBeDefined();
        expect(store.activeFileName).toBe(fileName);
        
        expect(emitSpy).toHaveBeenCalledWith('file:created', { fileName });
        expect(emitSpy).toHaveBeenCalledWith('file:selected', { fileName });
    });

    it('should handle duplicate file names on creation', () => {
        store.createFile('test');
        const duplicateName = store.createFile('test');
        
        expect(duplicateName).toBe('test (1)');
        expect(store.files['test (1)']).toBeDefined();
    });

    it('should update content and emit event', () => {
        const content = 'print("test")';
        store.updateContent(content, 'untitled');
        
        expect(store.activeContent).toBe(content);
        expect(emitSpy).toHaveBeenCalledWith('file:content-updated', { fileName: 'untitled', content });
    });

    it('should rename a file successfully', () => {
        const success = store.renameFile('untitled', 'renamed_file');
        
        expect(success).toBe(true);
        expect(store.files['untitled']).toBeUndefined();
        expect(store.files['renamed_file']).toBeDefined();
        expect(store.activeFileName).toBe('renamed_file');
        
        expect(emitSpy).toHaveBeenCalledWith('file:renamed', { oldName: 'untitled', newName: 'renamed_file' });
    });

    it('should close a file and switch active file', () => {
        store.createFile('second_file');
        
        store.closeFile('second_file');
        
        expect(store.files['second_file']).toBeUndefined();
        expect(store.activeFileName).toBe('untitled');
        
        expect(emitSpy).toHaveBeenCalledWith('file:closed', { fileName: 'second_file' });
    });

    it('should update options and emit config events', () => {
        store.setOption('isReadOnly', true);
        
        expect(store.options.isReadOnly).toBe(true);
        expect(emitSpy).toHaveBeenCalledWith('config:option-updated', { key: 'isReadOnly', value: true });
        expect(emitSpy).toHaveBeenCalledWith('config:changed', { options: store.options });
    });
});
