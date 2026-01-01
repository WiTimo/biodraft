import { Canvas } from './editor/Canvas';
import ThemeProvider from './editor/ui/ThemeProvider';

function App() {
  return (
    <main className="w-screen h-screen overflow-hidden">
      <ThemeProvider />
      <Canvas />
    </main>
  );
}

export default App;