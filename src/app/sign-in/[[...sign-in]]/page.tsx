import { SignIn } from '@clerk/nextjs';
import { dark } from '@clerk/themes';

export default function Page() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#09090b', // Zinc 950
        backgroundImage: `
          linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px)
        `,
        backgroundSize: '50px 50px',
        color: '#f4f4f5',
        fontFamily: '"JetBrains Mono", monospace'
      }}
    >
      <SignIn
        appearance={{
          baseTheme: dark,
          variables: {
            colorPrimary: '#f4f4f5',
            colorBackground: '#18181b', // Zinc 900
            colorInputBackground: '#27272a', // Zinc 800
            colorInputText: '#f4f4f5',
            colorText: '#f4f4f5',
            colorTextSecondary: '#a1a1aa', // Zinc 400
            fontFamily: '"JetBrains Mono", monospace',
            borderRadius: '6px'
          },
          elements: {
            card: {
              border: '1px solid #27272a',
              boxShadow: '0 20px 50px -10px rgba(0, 0, 0, 0.5)'
            },
            formButtonPrimary: {
              backgroundColor: '#f4f4f5',
              color: '#09090b',
              fontWeight: '600',
              textTransform: 'none',
              "&:hover": {
                  opacity: 0.9
              }
            },
            footerActionLink: {
                color: '#f4f4f5',
                textDecoration: 'underline',
                textUnderlineOffset: '2px'
            }
          }
        }}
      />
    </div>
  );
}