const FORMAT_MESSAGES = {
    invalidMetadata: "PyNote Parser: Invalid JSON metadata ->",
    invalidConfig: "PyNote Parser: Invalid global config JSON block"
};

class NotebookFormatConverter {
    /**
     * Converts a Native PyNote Object Array into a .pynote.py Flatfile string
     */
    static serializeToFlat(cells) {
        const serializedCells = cells.map(cell => {
            const data = typeof cell.toJSON === 'function' ? cell.toJSON() : cell;
            const type = data.type;
            
            const metaObj: any = { ...data.metadata };
            if (data.isLocked) metaObj.locked = true;
            else delete metaObj.locked;
            if (data.isHidden) metaObj.hidden = true;
            else delete metaObj.hidden;
            if (type === 'code') metaObj.lang = 'python';

            const metaStr = Object.keys(metaObj).length > 0 ? ` ${JSON.stringify(metaObj)}` : '';
            
            if (type === 'code') {
                return `# %% [code]${metaStr}\n${data.content || ''}`;
            } else {
                const cleanContent = (data.content || '').replace(/\n+$/, '');
                return `# %% [${type}]${metaStr}\n"""\n${cleanContent}\n"""`;
            }
        });
        
        // 1. Join cells with exactly one blank line (\n\n) as a structural spacer.
        // 2. Wrap the entire payload in boundary markers to prevent the browser's 
        //    <pre> innerText from stripping trailing newlines off the final cell.
        
        let headerStr = '# %% [pynote-start]\n';
        if (cells.globalConfig && Object.keys(cells.globalConfig).length > 0) {
            headerStr += `# %% [config]\n"""\n${JSON.stringify(cells.globalConfig, null, 2)}\n"""\n\n`;
        }
        
        return headerStr + serializedCells.join('\n\n') + '\n# %% [pynote-end]';
    }

    /**
     * Converts a .pynote.py Flatfile string into a Native PyNote Object Array
     */
    static deserializeFromFlat(payload, options = {}) {
        if (!payload) {
            return [{ type: 'code', content: '', isLocked: false, isEditing: false }];
        }
        
        // --- PROTECTIVE MARKER EXTRACTION ---
        let safePayload = payload;
        const startMarker = '# %% [pynote-start]\n'; // Note the explicit newline
        const endMarker = '\n# %% [pynote-end]';     // Note the explicit newline
        
        const startIndex = payload.indexOf(startMarker);
        const endIndex = payload.lastIndexOf(endMarker);

        // If the shell exists, slicing exactly between these indices perfectly isolates 
        // the original string, discarding the markers and their attachment newlines.
        if (startIndex > -1 && endIndex > -1 && endIndex > startIndex) {
            safePayload = payload.substring(startIndex + startMarker.length, endIndex);
        }

        if (!safePayload.includes('# %%')) {
            return [{ type: 'code', content: safePayload || '', isLocked: false, isEditing: false }];
        }
        
        const rawLines = safePayload.split(/\r?\n/);
        const cells: any = [];
        let globalConfig = null;
        let currentCell = null;
        
        for (let i = 0; i < rawLines.length; i++) {
            const line = rawLines[i];
            
            // Failsafe: Ignore any mangled legacy markers that survived the extraction
            if (line.includes('[pynote-start]') || line.includes('[pynote-end]')) {
                continue; 
            }

            const markerMatch = line.match(/^\s*#\s*%%(.*)$/);
            
            if (markerMatch) {
                if (currentCell) {
                    // Structural spacer pop
                    if (currentCell.lines.length > 0 && currentCell.lines[currentCell.lines.length - 1] === '') {
                        currentCell.lines.pop();
                    }
                    currentCell.content = currentCell.lines.join('\n');
                    cells.push(currentCell);
                }
                
                const metaRaw = markerMatch[1].trim();
                let type = 'code';
                let isLocked = false;
                let isHidden = false;
                
                const typeMatch = metaRaw.match(/\[([a-zA-Z]+)\]/);
                if (typeMatch) type = typeMatch[1];
                
                let parsedMeta = {};
                const jsonMatch = metaRaw.match(/({.*})/);
                if (jsonMatch) {
                    try {
                        const metaObj = JSON.parse(jsonMatch[1].replace(/'/g, '"'));
                        if (metaObj.locked) isLocked = true;
                        if (metaObj.hidden) isHidden = true;
                        parsedMeta = metaObj;
                    } catch (e) {
                        console.warn(FORMAT_MESSAGES.invalidMetadata, jsonMatch[1]);
                    }
                }

                const opts: any = options || {};
                if (opts.lockAllMarkdown && type === 'markdown') {
                    isLocked = true;
                }
                
                currentCell = { type, lines: [], isLocked, isHidden, isEditing: false, metadata: parsedMeta };
            } else {
                if (!currentCell) {
                    currentCell = { type: 'code', lines: [], isLocked: false, isHidden: false, isEditing: false };
                }
                currentCell.lines.push(line);
            }
        }
        
        if (currentCell) {
            currentCell.content = currentCell.lines.join('\n');
            cells.push(currentCell);
        }
        
        // --- The Cleanup Phase ---
        const finalCells: any = [];
        cells.forEach((c: any) => {
            if (c.type === 'markdown' || c.type === 'text' || c.type === 'config') {
                c.content = c.content.replace(/^\s*"""\s*\n?/, '').replace(/\n?\s*"""\s*$/, '');
                c.content = c.content.replace(/\n+$/, ''); 
            }
            
            if (c.type === 'config') {
                try {
                    globalConfig = JSON.parse(c.content);
                } catch (e) {
                    console.warn(FORMAT_MESSAGES.invalidConfig, e);
                }
            } else {
                delete c.lines; 
                finalCells.push(c);
            }
        });
        
        const result: any = finalCells.length ? finalCells : [{ type: 'code', content: safePayload }];
        if (globalConfig) result.globalConfig = globalConfig;
        
        return result;
    }
}

window.NotebookFormatConverter = NotebookFormatConverter;