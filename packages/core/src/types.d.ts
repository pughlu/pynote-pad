// Global Types for PyNote

declare const Sk: any;
declare const autosize: any;
declare const Sortable: any;
declare const marked: any;
declare const CodeMirror: any;
declare const cm6: any;

interface NotebookConfig {
    maxWidthChars?: number | string;
    widgetId?: string;
    isReadOnly?: boolean;
    questionMode?: boolean;
    defaultCellType?: string;
    kernelType?: string;
    kernelMode?: string;
    preloadMatplotlib?: boolean;
    maxOutputChars?: number;
    enableTracing?: boolean;
    maxRuntime?: number;
    disableInsertAll?: boolean;
    disableInsertTop?: boolean;
    disableDelete?: boolean;
    disableMove?: boolean;
    outputCurtailThresholdLines?: number;
    outputCurtailShowLines?: number;
    outputLineHeightPx?: number;
    autoClearOutputOnEdit?: boolean;
    showTopBar?: boolean;
    lockAllMarkdown?: boolean;
    lockKernel?: boolean;
    disableTypeChange?: boolean;
    layout?: string;
    autocompleteMode?: string;
    showExecutionNumbers?: boolean;
    collabProvider?: any;
}

interface CellData {
    id?: string;
    type: string;
    content: string;
    output?: string;
    isEditing?: boolean;
    isLocked?: boolean;
}

interface MathJaxConfig {
    typesetPromise?: (els: any[]) => Promise<void>;
}

interface Window {
    MathJaxHelper: any;
    MathJax: MathJaxConfig;
    BaseNotebookCell: any;
    NotebookCore: any;
    NotebookFormatConverter: any;
    notebookCore: any;
    triggerHostSync: (content: string) => void;
    MarkdownWidgetRegistry: any;
}

declare function sendHeight(): void;



