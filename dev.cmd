@echo off
echo ===================================================
echo Starting Bluamp Plant OS Development Server...
echo URL: http://localhost:3000
echo ===================================================
"C:\Users\Admin\AppData\Roaming\Antigravity\bin\agy-node.cmd" "%~dp0node_modules\vite\bin\vite.js" --host 0.0.0.0 --port 3000
