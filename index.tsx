import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');

if (!rootElement) {
  console.error("CRITICAL ERROR: Could not find root element to mount to.");
} else {
  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    console.log("Evidence Miner mounted successfully.");
  } catch (e) {
    console.error("CRITICAL ERROR: Failed to mount React application.", e);
    rootElement.innerHTML = `<div style="color:red; padding:20px;"><h3>Application Error</h3><p>Failed to load the application. Check console for details.</p><pre>${e}</pre></div>`;
  }
}