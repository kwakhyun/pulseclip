import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('PulseClip root element was not found.');

createRoot(root).render(<App />);
