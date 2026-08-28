# Spec: UI Redesign Cyber Futuristic

## Overview
Redesign completo da interface do AIMZY com tema cyber gaming futurista.

## Design Tokens

### Colors
```css
:root {
  --bg-primary: #030305;
  --bg-secondary: #070A12;
  --bg-card: #0B0F1A;
  --purple: #7C3AED;
  --purple-neon: #A855F7;
  --cyan: #00E5FF;
  --blue: #3B82F6;
  --text: #F8FAFC;
  --text-muted: #94A3B8;
}
```

## Components

### 1. Background Particles
- Canvas with floating particles
- Purple/cyan gradients
- Subtle glow effects
- Grid overlay
- Optimized performance

### 2. Hero Section
- Large AIMZY logo with glow
- Tagline: "Sua sensibilidade. Seu melhor desempenho."
- CTA buttons with glow
- Particle animation around hero

### 3. Logo Animation
- Purple glow
- Cyan accent
- Shine animation
- Fade entrance
- Subtle vertical movement

### 4. Custom Cursor
- Small luminous dot
- Follows mouse smoothly
- Glow effect
- Interactive element highlighting
- Disabled on mobile

### 5. Plan Cards
- Dark background with transparency
- Glassmorphism
- Thin borders
- Purple/cyan glow
- Hover effects (lift, scale, glow increase)
- Border shine animation

### 6. Generator Interface
- Dark inputs
- Purple borders
- Cyan accents
- Modern sliders
- Result cards with progress bars
- Loading animation

### 7. Navbar
- Glassmorphism
- Blur effect
- Subtle border
- Scroll effects
- Mobile hamburger menu

### 8. Animations
- Scroll animations (IntersectionObserver)
- Fade-in effects
- Microinteractions
- Loading states

### 9. Voice Welcome
- Female voice (PT-BR)
- Premium assistant style
- Futuristic sound effect
- Audio controls

## Performance
- CSS animations preferred
- requestAnimationFrame only when needed
- Limited particles
- Lazy loading
- prefers-reduced-motion support
