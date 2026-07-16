export function Lobby() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-purple-400 to-indigo-300 bg-clip-text text-transparent self-start">
        Lobby
      </h1>
      <p className="text-slate-400 text-sm">
        Welcome to the DokerFace poker waiting lobby. Active tables and waiting rooms will list
        here.
      </p>
    </div>
  );
}
