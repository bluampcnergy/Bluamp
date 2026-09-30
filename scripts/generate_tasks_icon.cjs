const fs = require('fs');
const path = require('path');
const { createCanvas } = (() => {
  try {
    return require('canvas');
  } catch (e) {
    return { createCanvas: null };
  }
})();

// Create clean SVG for Tasks Icon with transparent background
const tasksSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <!-- Transparent background -->
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <!-- Clipboard Outline -->
    <rect x="80" y="96" width="352" height="368" rx="48" fill="#18181B" stroke="#8EBF45" stroke-width="24"/>
    
    <!-- Top Clip -->
    <rect x="184" y="48" width="144" height="64" rx="20" fill="#27272A" stroke="#8EBF45" stroke-width="20"/>
    <circle cx="256" cy="80" r="14" fill="#8EBF45"/>
    
    <!-- Checklist Item 1 (Checked) -->
    <path d="M144 200 L180 236 L248 168" stroke="#8EBF45" stroke-width="26"/>
    <line x1="280" y1="200" x2="384" y2="200" stroke="#FFFFFF" stroke-width="22"/>
    
    <!-- Checklist Item 2 (Checked) -->
    <path d="M144 304 L180 340 L248 272" stroke="#8EBF45" stroke-width="26"/>
    <line x1="280" y1="304" x2="384" y2="304" stroke="#FFFFFF" stroke-width="22"/>
    
    <!-- Checklist Item 3 (Line) -->
    <circle cx="160" cy="400" r="16" stroke="#8EBF45" stroke-width="20"/>
    <line x1="216" y1="400" x2="384" y2="400" stroke="#A1A1AA" stroke-width="22"/>
  </g>
</svg>`;

// Also a pure transparent tasks icon with glowing accents
const tasksSvgNoBg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <!-- Clipboard Card -->
    <rect x="72" y="80" width="368" height="384" rx="56" fill="#0D0D0D" stroke="#8EBF45" stroke-width="28"/>
    
    <!-- Clip Top Header -->
    <path d="M176 80 V56 C176 42.745 186.745 32 200 32 H312 C325.255 32 336 42.745 336 56 V80" fill="#1A1A1A" stroke="#8EBF45" stroke-width="24"/>
    <circle cx="256" cy="60" r="12" fill="#8EBF45"/>
    
    <!-- Checkmark 1 -->
    <path d="M136 196 L180 240 L256 160" stroke="#8EBF45" stroke-width="30"/>
    <line x1="288" y1="196" x2="392" y2="196" stroke="#FFFFFF" stroke-width="24"/>
    
    <!-- Checkmark 2 -->
    <path d="M136 300 L180 344 L256 264" stroke="#8EBF45" stroke-width="30"/>
    <line x1="288" y1="300" x2="392" y2="300" stroke="#FFFFFF" stroke-width="24"/>
    
    <!-- Line 3 -->
    <circle cx="158" cy="396" r="16" stroke="#8EBF45" stroke-width="22" fill="#0D0D0D"/>
    <line x1="216" y1="396" x2="392" y2="396" stroke="#A1A1AA" stroke-width="24"/>
  </g>
</svg>`;

function generateIcons() {
  const publicDir = path.join(__dirname, '..', 'public');
  const rootDir = path.join(__dirname, '..');

  fs.writeFileSync(path.join(publicDir, 'tasks-icon.svg'), tasksSvgNoBg);
  fs.writeFileSync(path.join(rootDir, 'tasks-icon.svg'), tasksSvgNoBg);

  console.log('Saved SVG icon.');
}

generateIcons();
