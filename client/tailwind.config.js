/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#07080B',
        surface: {
          DEFAULT: '#0F1117',
          elevated: '#161922',
          card: '#12141C',
          hover: '#1B1E29',
          border: 'rgba(255, 255, 255, 0.08)',
        },
        static: {
          accent: '#00E599', // futuristic electric emerald accent
          accentCyan: '#00F0FF',
          muted: '#71788E',
          text: '#E6EDF3',
          subtext: '#949EB2',
          danger: '#FF4D4D',
          warning: '#FFB800',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(0, 229, 153, 0.4)' },
          '50%': { boxShadow: '0 0 0 10px rgba(0, 229, 153, 0)' },
        },
        speakingWave: {
          '0%, 100%': { transform: 'scaleY(0.4)' },
          '50%': { transform: 'scaleY(1.0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        }
      },
      animation: {
        'pulse-glow': 'pulseGlow 1.8s infinite',
        'speaking-wave': 'speakingWave 0.8s ease-in-out infinite',
      }
    },
  },
  plugins: [],
}
