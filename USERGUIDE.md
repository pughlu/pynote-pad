# PyNote User Guide

Welcome to PyNote! This guide explains how to use the PyNote Standalone IDE, author `.pynote.py` notebooks, and configure the widget for deployment in educational environments.

## 1. The PyNote Format (`.pynote.py`)
Unlike standard Jupyter Notebooks (`.ipynb`) which use JSON, PyNote notebooks are saved as valid, executable Python scripts. This allows you to write, run, and test your code in any standard Python IDE (like VSCode or PyCharm) before distributing it.

PyNote separates blocks of content using structural comments:
- `# %% [code]`: Defines an executable Python block.
- `# %% [markdown]`: Defines a rich-text markdown block (must be wrapped in `"""`).
- `# %% [config]`: Defines global UI and runtime constraints for the notebook.

### Example Notebook
```python
# %% [config]
"""
{
  "questionMode": true,
  "lockKernel": true,
  "kernelType": "skulpt"
}
"""

# %% [markdown]
"""
## Programming Exercise 1
Write a function that returns the sum of two numbers.
"""

# %% [code]
def add(a, b):
    # Your code here
    pass

print(add(2, 3))
```

---

## 2. Global Configuration & UI Constraints
You can customize the layout, restrict what students can do, and select the runtime kernel by applying configurations. Configurations can be set in two ways:

### Method A: At the File Level (`[config]` block)
You can embed constraints directly into the `.pynote.py` file. This guarantees that whenever someone loads the file, the notebook dictates its own configuration.
```python
# %% [config]
"""
{
  "questionMode": true,
  "lockKernel": true,
  "kernelType": "skulpt",
  "disableDelete": true
}
"""
```

### Method B: At the Widget Level (HTML Attributes)
If you are embedding the widget using the `<pynote>` tag, you can pass configurations via `data-*` attributes. 
*(Note: Widget-level settings take strict precedence over file-level settings to prevent students from overriding instructor constraints).*

```html
<pynote 
    data-kernel-type="pyodide" 
    data-question-mode="true" 
    data-show-top-bar="false">
# %% [code]
print("Loaded via widget")
</pynote>
```

### Complete List of Available Settings

#### Core Settings
| JSON Key (File) | HTML Attribute (Widget) | Type | Default | Description |
|---|---|---|---|---|
| `kernelType` | `data-kernel-type` | `string` | `"skulpt"` | Sets the runtime. Options: `"skulpt"` (fast, basic) or `"pyodide"` (heavy, full CPython with numpy/pandas). |
| `autocompleteMode` | `data-autocomplete-mode` | `string` | `"custom"` | CodeMirror autocomplete behavior. |
| `showTopBar` | `data-show-top-bar` | `boolean` | `true` | Toggles the visibility of the notebook header (Restart / Run All buttons). |
| `showShareButton` | `data-show-share-button` | `boolean` | `false` | Shows a "Share" button in the widget to copy a compressed URL. |

#### Constraint & Security Settings
| JSON Key (File) | HTML Attribute (Widget) | Type | Default | Description |
|---|---|---|---|---|
| `questionMode` | `data-question-mode` | `boolean` | `true` | **Macro Setting**: Automatically turns on `disableInsertAll`, `lockAllMarkdown`, and disables cell movement. Perfect for quizzes. |
| `isReadOnly` | `data-read-only` | `boolean` | `false` | **Global Lock**: Makes the entire notebook completely read-only. No execution, editing, or deletion allowed. |
| `lockKernel` | `data-lock-kernel` | `boolean` | `false` | Hides the kernel dropdown to prevent the user from changing the runtime. |
| `disableInsertAll`| `data-disable-insert-all` | `boolean` | `false` | Removes all "Add Cell" buttons from the UI. |
| `disableDelete` | `data-disable-delete` | `boolean` | `false` | Prevents the user from deleting any existing cells. |
| `lockAllMarkdown` | `data-lock-markdown` | `boolean` | `false` | Locks all markdown cells so they cannot be double-clicked or edited. |

---

## 3. The Standalone IDE
You can access the built-in PyNote IDE by opening `ide.html` in your browser. This is an authoring tool designed to help instructors build and test notebooks quickly.

**Key Features of the IDE:**
- **Drag & Drop**: Drop any `.ipynb` or `.pynote.py` file into the left sidebar to load it instantly.
- **Visual Editor vs Raw Mode**: Use the "View" menu to toggle between the interactive notebook interface and the raw flatfile (`.pynote.py`) text editor.
- **Real-time Config Panel**: Use the right-hand panel to toggle `questionMode`, kernels, and locks. As you toggle these, the `# %% [config]` block is automatically updated in the Raw mode.
- **One-Click Sharing**: Use `File -> Copy Shareable Link`. The IDE compresses your entire notebook into a highly compressed, URL-safe payload that you can paste to a colleague. When they open the link, the notebook reconstructs itself instantly.

---

## 4. Embedding in an LMS (Moodle)
If you are deploying PyNote inside a Learning Management System like Moodle, you can use the `pynote-mdl-quiz.js` script. 

1. Write your starter code/markdown inside a Moodle question text box.
2. Wrap your content in a `<pynote>` tag:
   ```html
   <pynote data-question-mode="true" data-kernel-type="pyodide">
   # %% [markdown]
   """ Solve the puzzle below """
   # %% [code]
   print("Hello")
   </pynote>
   ```
3. When the page loads, the widget manager will dynamically inject the PyNote interface, extract the starter code, and link the student's edits back to the hidden Moodle textarea for automatic grading and submission.
