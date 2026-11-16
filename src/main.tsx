import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined') {
  const origConsoleError = console.error.bind(console);
  console.error = (...args: any[]) => {
    if (typeof args[0] === 'string' && args[0].includes('Cannot find single active touch')) {
      return;
    }
    origConsoleError(...args);
  };
}

createRoot(document.getElementById('root')!).render(<App />);
