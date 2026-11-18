import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router";
import { useTheme } from "../hooks/useTheme";

function Nav() {
	const [open, setOpen] = useState(false);
	const [themeOpen, setThemeOpen] = useState(false);
	const themeMenuRef = useRef<HTMLDivElement>(null);

	const close = () => setOpen(false);
	const { theme, toggle } = useTheme();

	useEffect(() => {
		const query = window.matchMedia("(max-width: 640px)");
		const onChange = (e: MediaQueryListEvent) => {
			if (!e.matches) setOpen(false);
		};
		query.addEventListener("change", onChange);
		return () => query.removeEventListener("change", onChange);
	}, []);

	// Close theme dropdown on outside click or Escape
	useEffect(() => {
		if (!themeOpen) return;

		const onPointerDown = (e: MouseEvent) => {
			if (!themeMenuRef.current?.contains(e.target as Node)) {
				setThemeOpen(false);
			}
		};
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") setThemeOpen(false);
		};

		document.addEventListener("mousedown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("mousedown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [themeOpen]);

	const selectTheme = (next: "light" | "dark") => {
		if (next !== theme) toggle();
		setThemeOpen(false);
	};


	return (
		<header className="nav">
			<div className="nav-inner">
				<NavLink to="/" className="nav-brand" onClick={close}>
                <span className="mc mc-sweet-berries mc-3xl"
      role="img" aria-label="Sweet Berries"></span>
				</NavLink>

				<nav id="nav-menu" className={`nav-links${open ? " open" : ""}`}>
                    <NavLink to="/" end onClick={close}>
                    <span className="mc mc-oak-door mc-xl"
      role="img" aria-label="Oak Door"></span> Home
                    </NavLink>
                    <NavLink to="/stats" onClick={close}>
                    <span className="mc mc-paper mc-xl" role="img" aria-label="Clock"></span> Stats
                    </NavLink>
                    <NavLink to="/about" onClick={close}>
                    <span className="mc mc-writable-book mc-xl" role="img" aria-label="Writable Book"></span> About
                    </NavLink>
                    <a href="https://region.obphi.com/map/" onClick={close}>
                    <span className="mc mc-buried-treasure-map mc-xl" role="img" aria-label="Buried Treasure Map"></span> Map^
                    </a>
                </nav>

                <div className="nav-controls">
					<div className="theme-dropdown" ref={themeMenuRef}>
						<button
							type="button"
							className="theme-toggle"
							aria-haspopup="menu"
							aria-expanded={themeOpen}
							aria-label={`Theme: ${theme}`}
							onClick={() => {
								setThemeOpen((o) => !o);
								setOpen(false);
							}}
						>
							<span
								className={`mc ${theme === "dark" ? "mc-black-dye" : "mc-white-dye"} mc-xl`}
								aria-hidden="true"
							></span>
							<i className={`theme-caret hn ${themeOpen ? "hn-angle-up-solid" : "hn-angle-down-solid"}`} aria-hidden="true"></i>
						</button>

						{themeOpen && (
							<div className="theme-menu" role="menu" aria-label="Theme options">
								<button
									type="button"
									role="menuitemradio"
									aria-checked={theme === "light"}
									className={`theme-option${theme === "light" ? " active" : ""}`}
									onClick={() => selectTheme("light")}
								>
									<span className="mc mc-white-dye mc-xl" aria-hidden="true"></span>
									Light
								</button>
								<button
									type="button"
									role="menuitemradio"
									aria-checked={theme === "dark"}
									className={`theme-option${theme === "dark" ? " active" : ""}`}
									onClick={() => selectTheme("dark")}
								>
									<span className="mc mc-black-dye mc-xl" aria-hidden="true"></span>
									Dark
								</button>
							</div>
						)}
					</div>

					<button
						type="button"
						className="nav-toggle"
						aria-label="Toggle menu"
						aria-expanded={open}
						aria-controls="nav-menu"
						onClick={() => {
							setOpen((o) => !o);
							setThemeOpen(false);
						}}
					>
						{open ? <i className="hn hn-times"></i> : <i className="hn hn-bars"></i>}
					</button>
				</div>
			</div>
		</header>
	);
}

export default Nav;