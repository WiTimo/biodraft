import { Canvas } from './editor/Canvas';
import LanguageProvider from './editor/ui/LanguageProvider';
import ThemeProvider from './editor/ui/ThemeProvider';

function App() {
  return (
    <main className="w-screen h-screen overflow-hidden">
      <LanguageProvider />
      <ThemeProvider />
      <Canvas />
    </main>
  );
}

export default App;