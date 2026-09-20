import * as Y from 'yjs';
import { NotebookFormatConverter } from '../notebook-format';

/**
 * Converts a raw .pynote.py string into a Y.Doc
 */
export function stringToYDoc(content: string): Y.Doc {
    const ydoc = new Y.Doc();
    const cellsArray = ydoc.getArray('cells');
    
    // Use the existing format converter to parse the string into JSON objects
    const jsonCells = NotebookFormatConverter.deserializeFromFlat(content) as any[];
    
    ydoc.transact(() => {
        for (const cell of jsonCells) {
            const ymap = new Y.Map();
            
            // Set metadata
            for (const key of Object.keys(cell)) {
                if (key !== 'content') {
                    ymap.set(key, cell[key]);
                }
            }
            
            // Set content as a Y.Text object for real-time collaborative editing
            const ytext = new Y.Text(cell.content || '');
            ymap.set('content', ytext);
            
            cellsArray.push([ymap]);
        }
    });

    return ydoc;
}

/**
 * Converts a Y.Doc back into a raw .pynote.py string
 */
export function ydocToString(ydoc: Y.Doc, globalConfig?: any): string {
    const cellsArray = ydoc.getArray('cells');
    const jsonCells: any[] = [];
    
    cellsArray.forEach((ymap: any) => {
        const jsonCell: any = {};
        for (const [key, value] of ymap.entries()) {
            if (key === 'content') {
                jsonCell[key] = (value as Y.Text).toString();
            } else {
                jsonCell[key] = value;
            }
        }
        jsonCells.push(jsonCell);
    });

    if (globalConfig) {
        (jsonCells as any).globalConfig = globalConfig;
    }

    return NotebookFormatConverter.serializeToFlat(jsonCells);
}
