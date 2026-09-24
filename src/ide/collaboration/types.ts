// src/ide/collaboration/types.ts

/**
 * An abstraction over a collaborative text object (e.g. Y.Text)
 */
export interface ICollaborativeText {
    toString(): string;
    getRaw(): any; // Expose underlying mechanism for the provider's own binding logic
}

/**
 * An abstraction over a collaborative map object (e.g. Y.Map)
 */
export interface ICollaborativeMap {
    get(key: string): any;
    set(key: string, value: any): void;
    has(key: string): boolean;
    keys(): IterableIterator<string>;
    entries(): IterableIterator<[string, any]>;
    getRaw(): any;
}

/**
 * An abstraction over a collaborative array object (e.g. Y.Array)
 */
export interface ICollaborativeArray {
    length: number;
    get(index: number): any;
    insert(index: number, content: any[]): void;
    delete(index: number, length: number): void;
    push(content: any[]): void;
    toArray(): any[];
    forEach(fn: (item: any) => void): void;
    getRaw(): any;
}

/**
 * An abstraction over the document root (e.g. Y.Doc)
 */
export interface ICollaborativeDocument {
    getArray(name: string): ICollaborativeArray;
    transact(fn: () => void): void;
    on(event: string, callback: (event: any, transaction: any) => void): void;
    getRaw(): any;
}

/**
 * The Collaboration Provider interface
 * Abstracts away the specific CRDT library implementation (e.g. Yjs)
 */
export interface ICollaborationProvider {
    /**
     * Converts a raw .pynote.py flatfile string into a collaborative document
     */
    createDocumentFromString(content: string): ICollaborativeDocument;
    
    /**
     * Converts a collaborative document back to a raw .pynote.py flatfile string
     */
    serializeDocument(doc: ICollaborativeDocument, globalConfig?: any): string;

    /**
     * Returns a CodeMirror 6 extension that binds an editor to the given collaborative text
     */
    createEditorBinding(text: ICollaborativeText): any;

    /**
     * Factory methods for collaborative types within the context of this provider
     */
    createMap(): ICollaborativeMap;
    createText(content?: string): ICollaborativeText;
}
