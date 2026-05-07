import './style.css';
import ReactDOM from 'react-dom/client';
import { OptionsForm } from '@/components/OptionsForm';

const rootElement = document.getElementById('root');

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(<OptionsForm />);
}
