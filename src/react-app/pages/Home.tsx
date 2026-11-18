// src/App.tsx
import "../App.css";
import MinecraftStatus from "../components/MinecraftStatus";

function App() {
	return (
		<div className="card">
			<h1>The Region</h1>
			<p>A Minecraft forever world server.</p>
			<MinecraftStatus />
		</div>
	);
}

export default App;
