import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

window.onerror = function(message, source, lineno, colno, error) {
  console.error('💥 Глобальная ошибка:', message, 'в', source, 'строка:', lineno);
  const root = document.getElementById('root');
  if (root && root.innerHTML === '') {
    root.innerHTML = `<div style="color: white; background: #1a1a1a; padding: 20px; font-family: sans-serif; text-align: center;">
      <h2 style="color: #e74c3c;">☢️ КРИТИЧЕСКИЙ СБОЙ СИСТЕМЫ</h2>
      <p>Пожалуйста, попробуйте перезагрузить страницу.</p>
      <div style="font-size: 0.7rem; color: #555; margin-top: 20px;">${message}</div>
    </div>`;
  }
  return false;
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
