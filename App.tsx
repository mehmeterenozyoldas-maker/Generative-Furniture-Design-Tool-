import React from 'react';
import SensingScene from './components/SensingScene';
import { Box, Download } from 'lucide-react';

const App: React.FC = () => {
  return (
    <div className="relative w-full h-screen bg-[#1a1a1a] text-white overflow-hidden">
      <SensingScene />
      
      {/* UI Overlay */}
      <div className="absolute left-4 top-4 z-10 max-w-sm">
        <div className="bg-[#222]/80 backdrop-blur-md border border-white/10 rounded-xl p-5 shadow-2xl">
          <div className="flex items-center gap-3 mb-3">
            <Box className="w-6 h-6 text-amber-400" />
            <h1 className="text-lg font-bold tracking-wide">Parametric Studio <span className="text-amber-400">Pro</span></h1>
          </div>
          
          <div className="text-sm text-gray-300 space-y-3 font-sans leading-relaxed">
            <p>
              Advanced computational design tool for 3D printing. Generate complex organic structures like Voronoi Recliners, Hyphae Lamps, and Möbius Benches.
            </p>
            
            <div className="flex items-center gap-2 text-xs text-gray-500 border-t border-white/5 pt-3">
              <Download className="w-3 h-3" />
              <span>Export .STL for fabrication</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;