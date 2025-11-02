import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/main.css';

const rootElement = document.getElementById('app');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        {/* Top full-width row */}
        <div style={{ padding: 16, borderBottom: '1px solid #e5e5e5' }}>
          {/* Populate this header row later */}
        </div>

        {/* Two columns beneath, 50/50 split */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 0,
            flex: 1,
            minHeight: 0,
          }}
        >
          <div style={{ padding: 16, borderRight: '1px solid #f0f0f0' }}>{/* Left column */}</div>
          <div style={{ padding: 16 }}>{/* Right column */}</div>
        </div>
      </div>
    </React.StrictMode>
  );
}


