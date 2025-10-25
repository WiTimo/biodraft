import { useEffect, useState } from 'react';
import { Canvas } from './canvas/Canvas';

function App() {
  const [acknowledged, setAcknowledged] = useState(() => {
    try {
      return !!localStorage.getItem('prototypeAcknowledged');
    } catch (e) {
      return false;
    }
  });

  useEffect(() => {
    // ensure body background stays consistent while modal is open
    if (!acknowledged) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [acknowledged]);

  const acknowledge = () => {
    try { localStorage.setItem('prototypeAcknowledged', '1'); } catch (e) { /* ignore */ }
    setAcknowledged(true);
  };

  return (
    <main className="w-screen h-screen overflow-hidden bg-blue-300">
      {!acknowledged && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60">
          <div className="max-w-3xl w-full mx-4 bg-red-700 text-white rounded-lg shadow-xl p-8">
            <h1 className="text-2xl font-bold mb-4">Prototype — Read before continuing</h1>
            <p className="mb-4">
              This is a prototyping build. It is not intended for production use. Performance may be poor,
              features are experimental, and data persistence is not guaranteed. By clicking "Understood"
              you acknowledge that this is a prototype and you accept the risks of using it.
            </p>
            <ul className="list-disc pl-5 mb-6">
              <li>Not optimized for performance; rendering and simulation may be slow.</li>
              <li>Features may be incomplete or change without notice.</li>
              <li>Do not use for critical production workflows.</li>
            </ul>
            <div className="flex justify-end">
              <button
                onClick={acknowledge}
                className="px-4 py-2 bg-white text-red-700 rounded-md font-semibold"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

      <Canvas />
    </main>
  );
}

export default App;