import { Canvas } from './editor/Canvas';
import LanguageProvider from './editor/ui/LanguageProvider';
import ThemeProvider from './editor/ui/ThemeProvider';
import ToastViewport from './ui/toast/ToastViewport';

function App() {
  return (
    <main className="w-screen h-screen overflow-hidden">
      <LanguageProvider />
      <ThemeProvider />
      <Canvas />
      <ToastViewport />
    </main>
  );
}

export default App;