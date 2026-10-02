/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        enging: {
          navy: '#223546',
          'navy-dark': '#121921',
          'navy-secondary': '#1c2836',
          'navy-item': '#15202c',
          orange: '#e95c0c',
          'orange-hover': '#d04f08',
          'orange-light': '#fff3ed',
          'orange-subtle': 'rgba(233, 92, 12, 0.08)',
          blue: '#184e8e',
          slate: '#f8fafc'
        }
      }
    },
  },
  plugins: [],
}
