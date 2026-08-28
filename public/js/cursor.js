'use strict';

/* Custom Cursor - Full Black Premium */

class CustomCursor {
  constructor() {
    this.cursor = null;
    this.cursorGlow = null;
    this.mouseX = 0;
    this.mouseY = 0;
    this.cursorX = 0;
    this.cursorY = 0;
    this.isVisible = false;
    
    this.init();
  }
  
  init() {
    // Don't initialize on mobile
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      return;
    }
    
    this.createElements();
    this.bindEvents();
    this.animate();
  }
  
  createElements() {
    // Main cursor dot
    this.cursor = document.createElement('div');
    this.cursor.className = 'custom-cursor';
    this.cursor.innerHTML = '<div class="cursor-dot"></div>';
    document.body.appendChild(this.cursor);
    
    // Glow effect
    this.cursorGlow = document.createElement('div');
    this.cursorGlow.className = 'cursor-glow';
    document.body.appendChild(this.cursorGlow);
    
    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      .custom-cursor {
        position: fixed;
        width: 20px;
        height: 20px;
        pointer-events: none;
        z-index: 10000;
        mix-blend-mode: difference;
        transform: translate(-50%, -50%);
        transition: transform 0.1s ease;
      }
      
      .cursor-dot {
        width: 8px;
        height: 8px;
        background: #FFFFFF;
        border-radius: 50%;
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        box-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
      }
      
      .cursor-glow {
        position: fixed;
        width: 40px;
        height: 40px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 50%;
        pointer-events: none;
        z-index: 9999;
        transform: translate(-50%, -50%);
        transition: all 0.15s ease;
      }
      
      .custom-cursor.hovering .cursor-dot {
        transform: translate(-50%, -50%) scale(1.5);
        box-shadow: 0 0 15px rgba(255, 255, 255, 0.6);
      }
      
      .custom-cursor.hovering .cursor-glow {
        transform: translate(-50%, -50%) scale(1.5);
        border-color: rgba(255, 255, 255, 0.3);
      }
      
      @media (hover: none) {
        .custom-cursor,
        .cursor-glow {
          display: none !important;
        }
      }
    `;
    document.head.appendChild(style);
  }
  
  bindEvents() {
    document.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      
      if (!this.isVisible) {
        this.isVisible = true;
        this.cursor.style.opacity = '1';
        this.cursorGlow.style.opacity = '1';
      }
    });
    
    document.addEventListener('mouseleave', () => {
      this.isVisible = false;
      this.cursor.style.opacity = '0';
      this.cursorGlow.style.opacity = '0';
    });
    
    document.addEventListener('mouseenter', () => {
      this.isVisible = true;
      this.cursor.style.opacity = '1';
      this.cursorGlow.style.opacity = '1';
    });
    
    // Interactive elements hover
    const interactiveElements = 'a, button, input, select, textarea, [role="button"], .clickable';
    
    document.addEventListener('mouseover', (e) => {
      if (e.target.closest(interactiveElements)) {
        this.cursor.classList.add('hovering');
      }
    });
    
    document.addEventListener('mouseout', (e) => {
      if (e.target.closest(interactiveElements)) {
        this.cursor.classList.remove('hovering');
      }
    });
  }
  
  animate() {
    // Smooth cursor follow
    this.cursorX += (this.mouseX - this.cursorX) * 0.15;
    this.cursorY += (this.mouseY - this.cursorY) * 0.15;
    
    this.cursor.style.left = this.cursorX + 'px';
    this.cursor.style.top = this.cursorY + 'px';
    
    // Glow follows directly
    this.cursorGlow.style.left = this.mouseX + 'px';
    this.cursorGlow.style.top = this.mouseY + 'px';
    
    requestAnimationFrame(() => this.animate());
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new CustomCursor());
} else {
  new CustomCursor();
}
