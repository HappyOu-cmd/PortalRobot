import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/montserrat/400.css';
import '@fontsource/montserrat/500.css';
import '@fontsource/montserrat/600.css';
import '@fontsource/montserrat/700.css';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/onest/400.css';
import '@fontsource/onest/500.css';
import '@fontsource/onest/600.css';
import '@fontsource/onest/700.css';
import '@fontsource/geologica/400.css';
import '@fontsource/geologica/500.css';
import '@fontsource/geologica/600.css';
import '@fontsource/geologica/700.css';
import '@fontsource/commissioner/400.css';
import '@fontsource/commissioner/500.css';
import '@fontsource/commissioner/600.css';
import '@fontsource/commissioner/700.css';
import './styles/tailwind.css';
import './styles/theme.css';
import './styles/global.css';

const phoneDevice = /Android|iPhone|iPod|Mobile/i.test(navigator.userAgent);
const mobilePoints = phoneDevice || location.pathname === '/mobile' || location.pathname.startsWith('/mobile/');
document.documentElement.dataset.mobilePoints = String(mobilePoints);

const root = ReactDOM.createRoot(document.getElementById('root')!);
if (mobilePoints) {
  void import('./mobile/MobilePointsApp').then(({ MobilePointsApp }) => root.render(<React.StrictMode><MobilePointsApp /></React.StrictMode>));
} else {
  void import('./App').then(({ App }) => root.render(<React.StrictMode><App /></React.StrictMode>));
}
