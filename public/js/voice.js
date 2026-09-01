'use strict';

/* Voice Welcome - Full Black Premium */

class VoiceWelcome {
  constructor() {
    this.synth = window.speechSynthesis;
    this.isEnabled = localStorage.getItem('aimzy_voice_enabled') !== 'false';
    this.hasPlayed = false;
    this.audioUrl = '/audio/gojo-welcome.mp3';
    this.audio = null;

    this.init();
  }
  
  init() {
    // Check if speech synthesis is available
    if (!this.synth) {
      console.warn('[Voice] Speech synthesis not supported');
      return;
    }
    
    this.createControl();
    this.bindEvents();
  }
  
  createControl() {
    const control = document.createElement('div');
    control.className = 'voice-control';
    control.innerHTML = `
      <button class="voice-btn" id="voiceToggle" title="${this.isEnabled ? 'Desativar som' : 'Ativar som'}">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 5L6 9H2v6h4l5 4V5z"/>
          ${this.isEnabled ? 
            '<path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>' : 
            '<line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>'}
        </svg>
      </button>
    `;
    
    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      .voice-control {
        position: fixed;
        bottom: 20px;
        left: 20px;
        z-index: 1000;
      }
      
      .voice-btn {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        border: 1px solid #1A1A1A;
        background: #0A0A0A;
        color: #71717A;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.3s ease;
      }
      
      .voice-btn:hover {
        border-color: #303030;
        color: #FFFFFF;
      }
      
      .voice-btn.active {
        background: rgba(255, 255, 255, 0.1);
        border-color: #FFFFFF;
        color: #FFFFFF;
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(control);
  }
  
  bindEvents() {
    const btn = document.getElementById('voiceToggle');
    if (btn) {
      btn.addEventListener('click', () => this.toggle());
    }
  }
  
  toggle() {
    this.isEnabled = !this.isEnabled;
    localStorage.setItem('aimzy_voice_enabled', this.isEnabled);
    
    const btn = document.getElementById('voiceToggle');
    if (btn) {
      btn.classList.toggle('active', this.isEnabled);
      btn.title = this.isEnabled ? 'Desativar som' : 'Ativar som';
      
      // Update icon
      btn.innerHTML = this.isEnabled ?
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>' :
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
    }
  }
  
  speak(text, callback) {
    if (!this.synth || !this.isEnabled) {
      if (callback) callback();
      return;
    }

    // Cancel any ongoing speech
    this.synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = 0.75;
    utterance.pitch = 0.6;
    utterance.volume = 0.9;

    // Try to find a male Brazilian Portuguese voice
    const voices = this.synth.getVoices();
    const maleVoice = voices.find(v => v.lang === 'pt-BR' && (v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('ricardo') || v.name.toLowerCase().includes('antonio'))) ||
                      voices.find(v => v.lang === 'pt-BR') ||
                      voices.find(v => v.lang.startsWith('pt'));

    if (maleVoice) {
      utterance.voice = maleVoice;
    }

    utterance.onend = () => {
      if (callback) callback();
    };

    utterance.onerror = (e) => {
      console.warn('[Voice] Error:', e.error);
      if (callback) callback();
    };

    this.synth.speak(utterance);
  }

  playFileAudio(callback) {
    if (!this.isEnabled) {
      if (callback) callback();
      return;
    }

    try {
      this.synth?.cancel();

      if (this.audio) {
        this.audio.pause();
        this.audio.currentTime = 0;
      }

      const audio = new Audio(this.audioUrl);
      audio.preload = 'auto';
      audio.volume = 0.9;
      this.audio = audio;

      const done = () => {
        this.audio = null;
        if (callback) callback();
      };

      audio.onended = done;
      audio.onerror = () => {
        this.audio = null;
        console.warn('[Voice] Audio file unavailable, fallback to speech synthesis');
        this.speak('Seja bem-vindo à Aimzy.', callback);
      };

      audio.play().catch(() => {
        this.audio = null;
        this.speak('Seja bem-vindo à Aimzy.', callback);
      });
    } catch (e) {
      console.warn('[Voice] Audio file not supported:', e);
      this.speak('Seja bem-vindo à Aimzy.', callback);
    }
  }

  playWelcome(callback) {
    if (this.hasPlayed) {
      if (callback) callback();
      return;
    }

    this.hasPlayed = true;
    this.playFileAudio(callback);
  }

  // Play futuristic sound effect
  playSound() {
    if (!this.isEnabled) return;

    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();

      // Create a futuristic swoosh sound
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.3);

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (e) {
      // Audio context not available
    }
  }
}

// Initialize when DOM is ready
let voiceWelcome;

function initVoice() {
  voiceWelcome = new VoiceWelcome();
  
  // Load voices (they might not be available immediately)
  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initVoice);
} else {
  initVoice();
}

// Export for external use
window.AIMZYVoice = {
  playWelcome: () => voiceWelcome?.playWelcome(),
  speak: (text, cb) => voiceWelcome?.speak(text, cb),
  playSound: () => voiceWelcome?.playSound()
};
