// src/ide/types.ts
// Pragmatic Programmer: Design by Contract & Type-Safe Communication

export type ViewMode = 'visual' | 'preview' | 'flatfile' | 'jupyter';

export interface IDEOptions {
    showTopBar?: boolean;
    kernelType?: string;
    autocompleteMode?: string;
    showShareButton?: boolean;
    lockKernel?: boolean;
    questionMode?: boolean;
    isReadOnly?: boolean;
    disableInsertAll?: boolean;
    disableDelete?: boolean;
    disableMove?: boolean;
    lockAllMarkdown?: boolean;
    maxWidthChars?: number | string;
    [key: string]: any;
}

export interface CellConfig {
    isLocked?: boolean;
    isEditable?: boolean;
    isDeletable?: boolean;
    isMoveable?: boolean;
    isHidden?: boolean;
    metadata?: Record<string, any>;
}

export interface IDEState {
    files: Record<string, string>; // filename -> flatfile content
    activeFileName: string;
    viewMode: ViewMode;
    options: IDEOptions;
    selectedCellIndices: number[];
    selectedFiles: Set<string>;
}

export interface IDEEvents {
    // File Events
    'file:selected': { fileName: string };
    'file:created': { fileName: string };
    'file:closed': { fileName: string };
    'file:renamed': { oldName: string; newName: string };
    'file:imported': { fileName: string; content: string };
    'file:content-updated': { fileName: string; content: string };
    'files:changed': { files: Record<string, string>; activeFileName: string };
    'file:selection-toggled': { fileName: string; isSelected: boolean };

    // View Events
    'view:changed': { viewMode: ViewMode };

    // Configuration Events
    'config:changed': { options: IDEOptions };
    'config:option-updated': { key: string; value: any };

    // Cell Selection & Config
    'cell:selection-changed': { indices: number[] | readonly number[] };
    'cell:update-config': { indices: number[] | readonly number[]; config: CellConfig };
    'cell:update-config-request': {
        indices: number[] | readonly number[];
        config: CellConfig;
        callback?: (success: boolean) => void;
    };

    // Commands / Actions
    'action:new-file': void;
    'action:save-flat': void;
    'action:save-ipynb': void;
    'action:save-moodle': void;
    'action:share-link': void;
    'action:restart-kernel': void;
    'action:run-all': void;

    // Kernel & Status
    'kernel:status-changed': { isReady: boolean; text: string };
}

export interface IDEPanel {
    mount(container: HTMLElement): void;
    destroy?(): void;
}

declare global {
    interface Window {
        Split?: any;
    }
}
