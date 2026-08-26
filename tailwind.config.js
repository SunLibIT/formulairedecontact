/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Palette de la charte SunLib. Les valeurs pointent sur les variables
      // CSS de src/index.css : une seule définition, utilisable en classe
      // Tailwind comme en CSS brut.
      colors: {
        teal: {
          DEFAULT: 'var(--teal)',
          deep: 'var(--teal-deep)',
          ink: 'var(--teal-ink)',
          soft: 'var(--teal-soft)',
        },
        brand: {
          green: 'var(--green)',
          bright: 'var(--green-bright)',
          soft: 'var(--green-soft)',
        },
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        line: 'var(--line)',
        surface: 'var(--surface)',
        canvas: 'var(--bg)',
        amber: {
          DEFAULT: 'var(--amber)',
          bg: 'var(--amber-bg)',
          border: 'var(--amber-border)',
          soft: 'var(--amber-soft)',
          'soft-bg': 'var(--amber-soft-bg)',
          'soft-border': 'var(--amber-soft-border)',
        },
        danger: {
          DEFAULT: 'var(--red)',
          bg: 'var(--red-bg)',
          border: 'var(--red-border)',
        },
        info: {
          DEFAULT: 'var(--info)',
          bg: 'var(--info-bg)',
          border: 'var(--info-border)',
        },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        card: 'var(--radius)',
        control: 'var(--radius-sm)',
      },
      backgroundImage: {
        // Réservé au bouton d'action principale.
        brand: 'var(--brand-gradient)',
      },
      boxShadow: {
        focus: 'var(--focus)',
      },
    },
  },
  plugins: [],
};
