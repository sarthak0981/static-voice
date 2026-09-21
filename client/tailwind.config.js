/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#060709',
        surface: {
          DEFAULT: '#0B0D14',
          elevated: '#111420',
          card: '#0D0F18',
          hover: '#171B29',
          border: 'rgba(255, 255, 255, 0.07)',
          'border-strong': 'rgba(255, 255, 255, 0.14)',
        },
        static: {
          accent: '#8B5CF6', // Electric violet
          accentLight: '#A78BFA',
          accentIndigo: '#6366F1', // Soft indigo
          accentCyan: '#38BDF8', // Subtle cyan
          live: '#10B981', // Controlled success/connected green
          emerald: '#10B981',
          muted: '#64748B',
          text: '#F1F5F9',
          subtext: '#94A3B8',
          danger: '#EF4444',
          warning: '#F59E0B',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(139, 92, 246, 0.4)' },
          '50%': { boxShadow: '0 0 0 10px rgba(139, 92, 246, 0)' },
        },
        speakingWave: {
          '0%, 100%': { transform: 'scaleY(0.35)', opacity: '0.6' },
          '50%': { transform: 'scaleY(1.0)', opacity: '1.0' },
        },
        silentWave: {
          '0%, 100%': { opacity: '0.35' },
          '50%': { opacity: '0.45' },
        },
        softAtmosphere: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '50%': { transform: 'translate(-2%, 1%) scale(1.03)' },
        }
      },
      animation: {
        'pulse-glow': 'pulseGlow 2.5s infinite',
        'speaking-wave': 'speakingWave 0.7s ease-in-out infinite',
        'silent-wave': 'silentWave 3s ease-in-out infinite',
        'soft-atmosphere': 'softAtmosphere 20s ease-in-out infinite alternate',
      }
    },
  },
  plugins: [],
}
