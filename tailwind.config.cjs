/** @type {import('tailwindcss').Config} */
module.exports = {
  prefix: 'tw-',
  corePlugins: { preflight: false },
  content: ['index.html', 'src/**/*.{ts,tsx}', '!src/bank/**/*'],
  theme: {
    // Use Tailwind's default border radius scale so shadcn components are rounded
    borderRadius: {
      none: '0px',
      sm: '0.125rem',
      DEFAULT: '0.25rem',
      md: '0.375rem',
      lg: '0.5rem',
      xl: '0.75rem',
      '2xl': '1rem',
      '3xl': '1.5rem',
      full: '9999px',
    },
    fontSize: {
      xs: ['12px', { lineHeight: '16px' }],
      sm: ['14px', { lineHeight: '20px' }],
      base: ['14px', { lineHeight: '20px' }],
      lg: ['14px', { lineHeight: '20px' }],
      xl: ['14px', { lineHeight: '20px' }],
      '2xl': ['14px', { lineHeight: '20px' }],
      '3xl': ['14px', { lineHeight: '20px' }],
      '4xl': ['14px', { lineHeight: '20px' }],
      '5xl': ['14px', { lineHeight: '20px' }],
      '6xl': ['14px', { lineHeight: '20px' }],
      '7xl': ['14px', { lineHeight: '20px' }],
      '8xl': ['14px', { lineHeight: '20px' }],
      '9xl': ['14px', { lineHeight: '20px' }],
    },
    extend: {
      screens: {
        lg: '1240px',
        xxl: '1569px',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica', 'sans-serif'],
      },
      colors: {
        // Collapse neutral scale to 4 greys
        neutral: {
          50: '#f5f5f5',
          100: '#f5f5f5',
          200: '#aaaaaa',
          300: '#aaaaaa',
          400: '#aaaaaa',
          500: '#aaaaaa',
          600: '#262626',
          700: '#262626',
          800: '#1f1f1f',
          900: '#141414',
          950: '#141414'
        },
        graphite: '#333232',
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
    },
  },
};


