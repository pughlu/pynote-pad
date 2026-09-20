import { describe, it, expect } from 'vitest';
import { NotebookFormatConverter } from '../../src/notebook-format';

describe('NotebookFormatConverter', () => {
    it('should correctly deserialize a simple code cell', () => {
        const flatfile = `# %% [pynote-start]\n# %% [code]\nprint("Hello World")\n# %% [pynote-end]`;
        const result = NotebookFormatConverter.deserializeFromFlat(flatfile);
        
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('code');
        expect(result[0].content).toBe('print("Hello World")');
    });

    it('should correctly deserialize a markdown cell', () => {
        const flatfile = `# %% [pynote-start]\n# %% [markdown]\n"""\n# Title\nSome text\n"""\n# %% [pynote-end]`;
        const result = NotebookFormatConverter.deserializeFromFlat(flatfile);
        
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('markdown');
        expect(result[0].content).toBe('# Title\nSome text');
    });

    it('should correctly serialize a code cell', () => {
        const cells = [
            { type: 'code', content: 'print("Hello World")', isLocked: false, isEditable: true, isDeletable: true, isMoveable: true, isHidden: false }
        ];
        const result = NotebookFormatConverter.serializeToFlat(cells);
        
        expect(result).toContain('# %% [code]');
        expect(result).toContain('print("Hello World")');
    });

    it('should correctly serialize and deserialize configurations', () => {
        const cells = [
            { type: 'code', content: 'x = 1', isLocked: true, isEditable: false, isDeletable: false, isMoveable: false, isHidden: true }
        ];
        const flatfile = NotebookFormatConverter.serializeToFlat(cells);
        const deserialized = NotebookFormatConverter.deserializeFromFlat(flatfile);
        
        expect(deserialized[0].isLocked).toBe(true);
        expect(deserialized[0].isEditable).toBe(false);
        expect(deserialized[0].isDeletable).toBe(false);
        expect(deserialized[0].isMoveable).toBe(false);
        expect(deserialized[0].isHidden).toBe(true);
    });

    it('should never serialize ignoreCellLocks into globalConfig', () => {
        const cells: any = [
            { type: 'code', content: 'x = 1', isLocked: false, isEditable: false, isDeletable: false, isMoveable: false }
        ];
        cells.globalConfig = {
            isReadOnly: true,
            ignoreCellLocks: true,
            widgetId: 'test.py'
        };

        const flatfile = NotebookFormatConverter.serializeToFlat(cells);
        expect(flatfile).not.toContain('ignoreCellLocks');
        expect(flatfile).not.toContain('widgetId');

        const deserialized: any = NotebookFormatConverter.deserializeFromFlat(flatfile);
        expect(deserialized.globalConfig?.isReadOnly).toBe(true);
        expect(deserialized.globalConfig?.ignoreCellLocks).toBeUndefined();
        expect(deserialized[0].isEditable).toBe(false);
        expect(deserialized[0].isDeletable).toBe(false);
        expect(deserialized[0].isMoveable).toBe(false);
    });
});
