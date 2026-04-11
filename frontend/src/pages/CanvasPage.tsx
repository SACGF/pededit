import { useEffect } from "react";
import { ReactFlow, Background, Controls, MiniMap } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useAppStore } from "../store/useAppStore";
import { Button } from "@/components/ui/button";

export default function CanvasPage() {
  const { user, pedigrees, loadPedigrees, createPedigree, openPedigree, logout } = useAppStore();

  useEffect(() => {
    loadPedigrees();
  }, [loadPedigrees]);

  const handleNew = async () => {
    const id = await createPedigree("Untitled Pedigree");
    await openPedigree(id);
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-64 border-r bg-white flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <span className="font-semibold text-sm">{user?.username}</span>
          <Button variant="ghost" size="sm" onClick={logout}>
            Sign out
          </Button>
        </div>
        <div className="p-4 flex-1 overflow-y-auto">
          <Button size="sm" className="w-full mb-3" onClick={handleNew}>
            New pedigree
          </Button>
          <ul className="space-y-1">
            {pedigrees.map((p) => (
              <li key={p.id}>
                <button
                  className="w-full text-left px-2 py-1.5 rounded text-sm hover:bg-gray-100 truncate"
                  onClick={() => openPedigree(p.id)}
                >
                  {p.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1">
        <ReactFlow nodes={[]} edges={[]} fitView>
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
    </div>
  );
}
