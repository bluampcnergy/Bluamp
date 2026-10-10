// Visual SVG Cursor & Click Ripple Overlay for Playwright Screen Recording
(function() {
  if (document.getElementById('playwright-custom-cursor')) return;

  const style = document.createElement('style');
  style.id = 'playwright-cursor-styles';
  style.textContent = `
    #playwright-custom-cursor {
      position: fixed;
      top: 0;
      left: 0;
      width: 24px;
      height: 24px;
      pointer-events: none;
      z-index: 99999999;
      transform: translate3d(-100px, -100px, 0);
      transition: transform 0.04s ease-out;
      will-change: transform;
      filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.45));
    }
    .playwright-click-ripple {
      position: fixed;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: 3px solid rgba(142, 191, 69, 0.95);
      background: radial-gradient(circle, rgba(142, 191, 69, 0.4) 0%, rgba(142, 191, 69, 0) 70%);
      pointer-events: none;
      z-index: 99999998;
      transform: translate(-50%, -50%) scale(0.2);
      animation: playwright-ripple-anim 0.65s cubic-bezier(0.1, 0.8, 0.3, 1) forwards;
    }
    @keyframes playwright-ripple-anim {
      0% {
        transform: translate(-50%, -50%) scale(0.2);
        opacity: 1;
      }
      100% {
        transform: translate(-50%, -50%) scale(1.6);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);

  // SVG Mouse Cursor
  const cursor = document.createElement('div');
  cursor.id = 'playwright-custom-cursor';
  cursor.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 3L11.5 21L14.8 13.8L22 10.5L4 3Z" fill="#0D0D0D" stroke="#FFFFFF" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="11" cy="11" r="2.5" fill="#8EBF45" />
    </svg>
  `;
  document.body.appendChild(cursor);

  // Move handler
  window.addEventListener('mousemove', (e) => {
    cursor.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
  }, { capture: true, passive: true });

  // Click ripple handler
  window.addEventListener('mousedown', (e) => {
    const ripple = document.createElement('div');
    ripple.className = 'playwright-click-ripple';
    ripple.style.left = `${e.clientX}px`;
    ripple.style.top = `${e.clientY}px`;
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 700);
  }, { capture: true, passive: true });
})();
