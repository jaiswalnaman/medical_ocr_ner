/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      typography: {
        DEFAULT: {
          css: {
            maxWidth: 'none',
            color: '#333',
            'thead th': {
              paddingTop: '0.75rem',
              paddingBottom: '0.75rem',
              backgroundColor: '#f3f4f6',
            },
            'tbody td': {
              paddingTop: '0.75rem',
              paddingBottom: '0.75rem',
            },
          },
        },
      },
    },
  },
  plugins: [],
};