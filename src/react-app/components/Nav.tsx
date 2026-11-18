import { useEffect, useState } from "react";
import { NavLink } from "react-router";
import { useTheme } from "../hooks/useTheme";

function Nav() {
	const [open, setOpen] = useState(false);
	const close = () => setOpen(false);
    useEffect(() => {
        const query = window.matchMedia("(max-width: 640px)");
        const onChange = (e: MediaQueryListEvent) => {
            if (!e.matches) setOpen(false);
        };
        query.addEventListener("change", onChange);
        return () => query.removeEventListener("change", onChange);
    }, []);
    const { theme, toggle } = useTheme();

	return (
		<header className="nav">
			<div className="nav-inner">
				<NavLink to="/" className="nav-brand" onClick={close}>
                <span className="mc mc-sweet-berries mc-3xl"
      role="img" aria-label="Sweet Berries"></span>
				</NavLink>

				<nav id="nav-menu" className={`nav-links${open ? " open" : ""}`}>
                    <NavLink to="/" end onClick={close}>
                    <span className="mc mc-iron-nautilus-armor mc-xl"
      role="img" aria-label="Iron Nautilus Armor"></span> Home
                    </NavLink>
                    <NavLink to="/about" onClick={close}>
                    <span className="mc mc-writable-book mc-xl" role="img" aria-label="Writable Book"></span> About
                    </NavLink>
                    <NavLink to="/stats" onClick={close}>
                    <span className="mc mc-clock mc-xl" role="img" aria-label="Clock"></span> Stats
                    </NavLink>
                    <a href="https://region.obphi.com/map/" onClick={close}>
                    <span className="mc mc-buried-treasure-map mc-xl" role="img" aria-label="Buried Treasure Map"></span> Map
                    </a>
                </nav>

                <div className="nav-controls">
                    <button
                        className="theme-toggle"
                        aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                        onClick={toggle}
                    >
                        {theme === "dark" ? (
                            <span 
                                className="mc mc-white-dye mc-xl"
                                role="img" 
                                aria-label="White Dye">
                            </span>
                        ) : (
                            <span 
                                className="mc mc-black-dye mc-xl"
                                role="img"
                                aria-label="Black Dye">
                            </span>
                        )}
                    </button>
                    <button
                        className="nav-toggle"
                        aria-label="Toggle menu"
                        aria-expanded={open}
                        aria-controls="nav-menu"
                        onClick={() => setOpen((o) => !o)}
                    >
                        {open ? "✕" : "☰"}
                    </button>
                </div>
			</div>
		</header>
	);
}

export default Nav;