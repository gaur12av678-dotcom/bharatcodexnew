/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui'] },
      colors: {
        // Theme colors — values src/index.css ke CSS variables se aati hain
        base: 'rgb(var(--c-base) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        raise: 'rgb(var(--c-raise) / <alpha-value>)',
        edge: 'rgb(var(--c-edge) / <alpha-value>)',
        body: 'rgb(var(--c-body) / <alpha-value>)',
        mute: 'rgb(var(--c-mute) / <alpha-value>)',
        faint: 'rgb(var(--c-faint) / <alpha-value>)',
      },
    },
  },
  plugins: [],
}
