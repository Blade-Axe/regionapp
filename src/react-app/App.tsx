import { BrowserRouter, Routes, Route } from "react-router";
import Nav from "./components/Nav";
import Footer from "./components/Footer";
import Home from "./pages/Home";
import About from "./pages/About";
import Stats from "./pages/Stats";
import User from "./pages/User";

function App() {
	return (
		<BrowserRouter>
			<Nav />
			<main className="page">
				<Routes>
					<Route path="/" element={<Home />} />
					<Route path="/about" element={<About />} />
					<Route path="/stats" element={<Stats />} />
					<Route path="/user/:name" element={<User />} />
				</Routes>
			</main>
			<Footer />
		</BrowserRouter>
	);
}

export default App;