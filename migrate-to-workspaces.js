import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT = process.cwd();
const PACKAGES_DIR = path.join(ROOT, 'packages');
const CORE_DIR = path.join(PACKAGES_DIR, 'core');
const IDE_DIR = path.join(PACKAGES_DIR, 'ide');

console.log('🚀 Starting migration to NPM Workspaces...\n');

// 1. Safety check
try {
    const status = execSync('git status --porcelain').toString();
    if (status.trim() !== '') {
        console.warn('⚠️ WARNING: Your git working tree is not clean. It is highly recommended to commit your changes before running this script.');
        // Un-comment the line below to enforce a clean working tree
        // process.exit(1); 
    }
} catch (e) {
    console.log('Could not check git status, proceeding anyway...');
}

// 2. Create directories
console.log('📁 Creating packages directories...');
fs.mkdirSync(path.join(CORE_DIR, 'src'), { recursive: true });
fs.mkdirSync(path.join(IDE_DIR, 'src'), { recursive: true });

// 3. Move Source Files
console.log('📦 Moving source files...');
const srcFiles = fs.readdirSync(path.join(ROOT, 'src'));

for (const item of srcFiles) {
    const oldPath = path.join(ROOT, 'src', item);
    if (item === 'ide') {
        // Move the whole ide folder contents to packages/ide/src
        const ideFiles = fs.readdirSync(oldPath);
        for (const ideItem of ideFiles) {
            fs.renameSync(path.join(oldPath, ideItem), path.join(IDE_DIR, 'src', ideItem));
        }
        fs.rmdirSync(oldPath); // Remove now empty ide folder
    } else {
        // Everything else goes to core
        fs.renameSync(oldPath, path.join(CORE_DIR, 'src', item));
    }
}
// Remove old src folder
fs.rmdirSync(path.join(ROOT, 'src'));

// 4. Move root HTML files (optional, assuming ide.html goes to IDE, index.html stays root or goes to core)
if (fs.existsSync(path.join(ROOT, 'ide.html'))) {
    fs.renameSync(path.join(ROOT, 'ide.html'), path.join(IDE_DIR, 'index.html'));
}

// 5. Read original package.json
const rootPkgRaw = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8');
const rootPkg = JSON.parse(rootPkgRaw);

// 6. Create @pynote/core package.json
console.log('📝 Generating package.json for @pynote/core...');
const corePkg = {
    name: "@pynote/core",
    version: "1.0.0",
    type: "module",
    main: "src/index.ts", // You may need to create an index.ts exporting your public API
    dependencies: {
        "@codemirror/autocomplete": rootPkg.dependencies["@codemirror/autocomplete"],
        "@codemirror/commands": rootPkg.dependencies["@codemirror/commands"],
        "@codemirror/lang-markdown": rootPkg.dependencies["@codemirror/lang-markdown"],
        "@codemirror/lang-python": rootPkg.dependencies["@codemirror/lang-python"],
        "@codemirror/language": rootPkg.dependencies["@codemirror/language"],
        "@codemirror/lint": rootPkg.dependencies["@codemirror/lint"],
        "@codemirror/state": rootPkg.dependencies["@codemirror/state"],
        "@codemirror/view": rootPkg.dependencies["@codemirror/view"],
        "codemirror": rootPkg.dependencies["codemirror"],
        "y-codemirror.next": rootPkg.dependencies["y-codemirror.next"],
        "yjs": rootPkg.dependencies["yjs"]
    }
};
fs.writeFileSync(path.join(CORE_DIR, 'package.json'), JSON.stringify(corePkg, null, 2));

// 7. Create @pynote/ide package.json
console.log('📝 Generating package.json for @pynote/ide...');
const idePkg = {
    name: "@pynote/ide",
    version: "1.0.0",
    type: "module",
    dependencies: {
        "@pynote/core": "*", // Links locally!
        "@azure/msal-browser": rootPkg.dependencies["@azure/msal-browser"],
        "lms-widget-manager": rootPkg.dependencies["lms-widget-manager"]
    }
};
fs.writeFileSync(path.join(IDE_DIR, 'package.json'), JSON.stringify(idePkg, null, 2));

// 8. Update root package.json
console.log('📝 Updating root package.json for workspaces...');
const newRootPkg = {
    name: "pynote-monorepo",
    private: true,
    workspaces: [
        "packages/*"
    ],
    scripts: rootPkg.scripts,
    devDependencies: rootPkg.devDependencies,
    allowScripts: rootPkg.allowScripts
};
fs.writeFileSync(path.join(ROOT, 'package.json'), JSON.stringify(newRootPkg, null, 2));

// 9. Fix imports in IDE files (Basic Regex Replace)
console.log('🔄 Rewriting import paths in IDE package...');
function replaceImports(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            replaceImports(fullPath);
        } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.js')) {
            let content = fs.readFileSync(fullPath, 'utf-8');
            // Replaces import { ... } from '../../something' with '@pynote/core/something'
            // This regex covers `../` and `../../` that step out of the ide folder
            content = content.replace(/from\s+['"](?:\.\.\/)+([^'"]+)['"]/g, "from '@pynote/core/$1'");
            fs.writeFileSync(fullPath, content);
        }
    }
}
replaceImports(path.join(IDE_DIR, 'src'));

console.log('\n✅ Migration script finished!');
console.log('\n--- NEXT STEPS ---');
console.log('1. Run `npm install` from the root directory so NPM links the workspaces.');
console.log('2. You may need to create an `index.ts` file in `packages/core/src` exporting your public API.');
console.log('3. Adjust vite.config.ts and tsconfig.json as needed for the new paths.');
