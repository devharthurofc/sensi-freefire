'use strict';

/* Scroll Animations */

class ScrollAnimations {
  constructor() {
    this.elements = [];
    this.observer = null;
    
    this.init();
  }
  
  init() {
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          
          // Trigger staggered animations for children
          const children = entry.target.querySelectorAll('[data-animate-child]');
          children.forEach((child, index) => {
            setTimeout(() => {
              child.classList.add('visible');
            }, index * 100);
          });
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    });
    
    this.observe();
  }
  
  observe() {
    // Observe all elements with data-animate attribute
    document.querySelectorAll('[data-animate]').forEach(el => {
      this.observer.observe(el);
    });
  }
  
  // Re-observe after dynamic content changes
  refresh() {
    this.observer.disconnect();
    this.observe();
  }
}

/* Smooth Scroll */

class SmoothScroll {
  constructor() {
    this.init();
  }
  
  init() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.querySelector(anchor.getAttribute('href'));
        if (target) {
          target.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }
      });
    });
  }
}

/* Parallax Effects */

class ParallaxEffects {
  constructor() {
    this.elements = [];
    this.init();
  }
  
  init() {
    document.querySelectorAll('[data-parallax]').forEach(el => {
      this.elements.push({
        el,
        speed: parseFloat(el.dataset.parallax) || 0.5
      });
    });
    
    if (this.elements.length > 0) {
      window.addEventListener('scroll', () => this.update());
    }
  }
  
  update() {
    const scrollY = window.scrollY;
    
    this.elements.forEach(({ el, speed }) => {
      const offset = scrollY * speed;
      el.style.transform = `translateY(${offset}px)`;
    });
  }
}

/* Counter Animation */

class CounterAnimation {
  constructor() {
    this.counters = [];
    this.observer = null;
    
    this.init();
  }
  
  init() {
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          this.animate(entry.target);
        }
      });
    }, { threshold: 0.5 });
    
    document.querySelectorAll('[data-count]').forEach(el => {
      this.observer.observe(el);
    });
  }
  
  animate(el) {
    const target = parseInt(el.dataset.count);
    const duration = parseInt(el.dataset.duration) || 2000;
    const start = 0;
    const increment = target / (duration / 16);
    let current = start;
    
    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        el.textContent = target.toLocaleString();
        clearInterval(timer);
      } else {
        el.textContent = Math.floor(current).toLocaleString();
      }
    }, 16);
  }
}

/* Text Reveal */

class TextReveal {
  constructor() {
    this.init();
  }
  
  init() {
    document.querySelectorAll('[data-reveal]').forEach(el => {
      const text = el.textContent;
      el.innerHTML = '';
      
      text.split('').forEach((char, index) => {
        const span = document.createElement('span');
        span.textContent = char === ' ' ? '\u00A0' : char;
        span.style.animationDelay = `${index * 0.03}s`;
        span.className = 'reveal-char';
        el.appendChild(span);
      });
    });
    
    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      .reveal-char {
        display: inline-block;
        opacity: 0;
        transform: translateY(20px);
        animation: revealChar 0.5s ease forwards;
      }
      
      @keyframes revealChar {
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `;
    document.head.appendChild(style);
  }
}

/* Initialize all animations when DOM is ready */
let scrollAnimations, smoothScroll, parallaxEffects, counterAnimation, textReveal;

function initAnimations() {
  scrollAnimations = new ScrollAnimations();
  smoothScroll = new SmoothScroll();
  parallaxEffects = new ParallaxEffects();
  counterAnimation = new CounterAnimation();
  textReveal = new TextReveal();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAnimations);
} else {
  initAnimations();
}

// Export for external use
window.AIMZYAnimations = {
  refresh: () => scrollAnimations?.refresh()
};
