@echo off
echo ===================================================
echo Building Bluamp Plant OS for Production...
echo ===================================================
"C:\Users\Admin\AppData\Roaming\Antigravity\bin\agy-node.cmd" "%~dp0node_modules\vite\bin\vite.js" build
