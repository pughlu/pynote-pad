// src/ide/collaboration/yjs-provider.ts

import * as Y from 'yjs';
import { yCollab } from 'y-codemirror.next';
import { NotebookFormatConverter } from '../../notebook-format';
import { 
    ICollaborationProvider, 
    ICollaborativeDocument, 
    ICollaborativeArray, 
    ICollaborativeMap, 
    ICollaborativeText 
} from './types';

export class YjsTextAdapter implements ICollaborativeText {
    constructor(private ytext: Y.Text) {}
    toString() { return this.ytext.toString(); }
    getRaw() { return this.ytext; }
}

export class YjsMapAdapter implements ICollaborativeMap {
    constructor(private ymap: Y.Map<any>) {}
    get(key: string) { 
        const val = this.ymap.get(key);
        if (val instanceof Y.Text) return new YjsTextAdapter(val);
        // We only wrap text for now as it's what we expose
        return val;
    }
    set(key: string, value: any) { 
        if (value && (value as any).getRaw) {
            this.ymap.set(key, (value as any).getRaw());
        } else {
            this.ymap.set(key, value);
        }
    }
    keys() { return this.ymap.keys(); }
    entries() { return this.ymap.entries(); }
    getRaw() { return this.ymap; }
}

export class YjsArrayAdapter implements ICollaborativeArray {
    constructor(private yarray: Y.Array<any>) {}
    
    get length() { return this.yarray.length; }
    
    get(index: number) {
        const val = this.yarray.get(index);
        if (val instanceof Y.Map) return new YjsMapAdapter(val);
        return val;
    }
    
    insert(index: number, content: any[]) {
        const rawContent = content.map(item => (item && item.getRaw) ? item.getRaw() : item);
        this.yarray.insert(index, rawContent);
    }
    
    delete(index: number, length: number) {
        this.yarray.delete(index, length);
    }
    
    push(content: any[]) {
        const rawContent = content.map(item => (item && item.getRaw) ? item.getRaw() : item);
        this.yarray.push(rawContent);
    }
    
    toArray() {
        return this.yarray.toArray().map(val => {
            if (val instanceof Y.Map) return new YjsMapAdapter(val);
            return val;
        });
    }
    
    forEach(fn: (item: any) => void) {
        this.yarray.forEach((val) => {
            if (val instanceof Y.Map) {
                fn(new YjsMapAdapter(val));
            } else {
                fn(val);
            }
        });
    }
    
    getRaw() { return this.yarray; }
}

export class YjsDocumentAdapter implements ICollaborativeDocument {
    constructor(private ydoc: Y.Doc) {}
    
    getArray(name: string) {
        return new YjsArrayAdapter(this.ydoc.getArray(name));
    }
    
    transact(fn: () => void) {
        this.ydoc.transact(() => {
            fn();
        });
    }
    
    on(event: string, callback: (event: any, transaction: any) => void) {
        this.ydoc.on(event as any, callback);
    }
    
    getRaw() { return this.ydoc; }
}

export class YjsProvider implements ICollaborationProvider {
    createDocumentFromString(content: string): ICollaborativeDocument {
        const ydoc = new Y.Doc();
        const cellsArray = ydoc.getArray('cells');
        
        const jsonCells = NotebookFormatConverter.deserializeFromFlat(content) as any[];
        
        ydoc.transact(() => {
            for (const cell of jsonCells) {
                const ymap = new Y.Map();
                for (const key of Object.keys(cell)) {
                    if (key !== 'content') {
                        ymap.set(key, cell[key]);
                    }
                }
                const ytext = new Y.Text(cell.content || '');
                ymap.set('content', ytext);
                cellsArray.push([ymap]);
            }
        });
    
        return new YjsDocumentAdapter(ydoc);
    }

    serializeDocument(doc: ICollaborativeDocument, globalConfig?: any): string {
        const rawDoc = doc.getRaw() as Y.Doc;
        const cellsArray = rawDoc.getArray('cells');
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

    createEditorBinding(text: ICollaborativeText): any {
        const rawText = text.getRaw() as Y.Text;
        return yCollab(rawText, null);
    }

    createMap(): ICollaborativeMap {
        return new YjsMapAdapter(new Y.Map());
    }

    createText(content?: string): ICollaborativeText {
        return new YjsTextAdapter(new Y.Text(content || ''));
    }
}
